import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import express from 'express';
import fs from 'fs';
import {
  CasePackSchema,
  DebriefHandoff,
  EngineEvent,
  Mode,
  Phase,
  TranscriptTurn,
} from '@freshcase/types';
import { getPool, healthCheck, migrate } from '@freshcase/db';
import { generateMenu, getCasePack, ContextClient, loadConfig } from '@freshcase/generator';
import { buildPhaseBrief, isLegalTransition, nextPhase } from './stateMachine';
import { judgeMath } from './quant';
import { escalate } from './silence';
import { defaultClassifier, makeLiveFetcher, resolveAsk, LiveFetcher } from './ledger';
import { createSession, getSession, updateSession, NewEngineEvent } from './sessionStore';

const app = express();
app.use(express.json());

const fixturePath = path.join(__dirname, '../../../fixtures/saverite.json');
export const saverite = CasePackSchema.parse(
  JSON.parse(fs.readFileSync(fixturePath, 'utf-8')),
);

const DISCLAIMER_SPOKEN =
  'Quick note before we begin: the figures in this exercise are simplified and synthesized for practice — treat them as exercise data, not reported financials.';

function liveFetcher(): LiveFetcher | null {
  try {
    const client = new ContextClient();
    const config = loadConfig();
    return makeLiveFetcher({
      scrapeMarkdown: (url) => client.scrapeMarkdown(url),
      searchWeb: (params) => client.searchWeb(params),
      pressAllowlist: config.pressAllowlist,
    });
  } catch {
    return null;
  }
}

app.get('/health', async (_req, res) => {
  try {
    const pool = getPool();
    await healthCheck(pool);
    await pool.end();
    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'down', error: (err as Error).message });
  }
});

// Menu generation costs ~30s and ~70 credits; cache it across sessions and
// refresh hourly (spec: generated on session start, hourly refresh optional).
const MENU_TTL_MS = 60 * 60 * 1000;
let menuCache: { menu: Awaited<ReturnType<typeof generateMenu>>; at: number } | null = null;

async function cachedMenu() {
  if (!menuCache || Date.now() - menuCache.at > MENU_TTL_MS) {
    menuCache = { menu: await generateMenu(), at: Date.now() };
  }
  return menuCache.menu;
}

app.post('/session', async (req, res) => {
  const mode: Mode = req.body?.mode === 'guided' ? 'guided' : 'realistic';
  try {
    const [state, menu] = await Promise.all([createSession(mode), cachedMenu()]);
    res.status(201).json({ session_id: state.session_id, menu });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

async function withSession(
  req: express.Request,
  res: express.Response,
  handler: (state: Awaited<ReturnType<typeof createSession>>) => Promise<void>,
): Promise<void> {
  const state = await getSession(req.params.id);
  if (!state) {
    res.status(404).json({ error: 'session not found' });
    return;
  }
  try {
    await handler(state);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

app.post('/session/:id/select', (req, res) =>
  withSession(req, res, async (state) => {
    const caseId = req.body?.case_id;
    if (!caseId) {
      res.status(400).json({ error: 'case_id is required' });
      return;
    }
    const pack = await getCasePack(caseId);
    await updateSession(state, { phase: 'prompt', case_pack: pack }, [
      { type: 'phase_transition', from: 'menu', to: 'prompt', reason: `selected ${caseId}` },
    ]);
    res.json({ prompt_spoken: pack.prompt.spoken, disclaimer_spoken: DISCLAIMER_SPOKEN });
  }),
);

app.post('/session/:id/ask', (req, res) =>
  withSession(req, res, async (state) => {
    const question = req.body?.question_text;
    if (!question || !state.case_pack) {
      res.status(400).json({ error: 'question_text and a selected case are required' });
      return;
    }
    const result = await resolveAsk(question, state.case_pack, defaultClassifier, liveFetcher());
    await updateSession(state, {}, [result.event]);
    res.json(result.answer);
  }),
);

app.post('/session/:id/event', (req, res) =>
  withSession(req, res, async (state) => {
    const { type, payload = {} } = req.body ?? {};
    if (type === 'candidate_turn' || type === 'interviewer_turn') {
      await updateSession(state, {}, [{ type, text: payload.text ?? '' }]);
      res.json({ ack: true });
      return;
    }
    if (type === 'thinking_time_granted') {
      await updateSession(state, {}, [{ type, seconds: payload.seconds ?? 90 }]);
      res.json({ ack: true });
      return;
    }
    if (type === 'silence_crossing') {
      if (!state.case_pack) {
        res.status(400).json({ error: 'no case selected' });
        return;
      }
      // Stall count = silence crossings since the last candidate turn
      // (progress resets the ladder); hints already given never reset.
      let stalls = 0;
      for (let i = state.events.length - 1; i >= 0; i--) {
        const e = state.events[i];
        if (e.type === 'candidate_turn') break;
        if (e.type === 'silence_crossing') stalls += 1;
      }
      stalls += 1;
      const hintsGiven = state.events.filter((e) => e.type === 'hint_given').length;
      const action = escalate(stalls, hintsGiven, state.mode, state.phase, state.case_pack);
      const events: NewEngineEvent[] = [
        { type: 'silence_crossing', phase: state.phase, seconds: payload.seconds ?? 0 },
      ];
      if (action.action === 'hint') events.push({ type: 'hint_given', level: action.level });
      await updateSession(state, {}, events);
      res.json({ ack: true, escalation: action });
      return;
    }
    res.status(400).json({ error: `unknown event type: ${type}` });
  }),
);

app.post('/session/:id/advance', (req, res) =>
  withSession(req, res, async (state) => {
    const to: Phase | null = req.body?.to_phase ?? nextPhase(state.phase);
    if (!to || !isLegalTransition(state.phase, to)) {
      res.status(400).json({ error: `illegal transition ${state.phase} -> ${to}` });
      return;
    }
    await updateSession(state, { phase: to }, [
      { type: 'phase_transition', from: state.phase, to, reason: req.body?.reason },
    ]);
    res.json(buildPhaseBrief(to, state.mode, state.case_pack));
  }),
);

app.post('/session/:id/quant', (req, res) =>
  withSession(req, res, async (state) => {
    const text = req.body?.candidate_math_text;
    if (!text || !state.case_pack) {
      res.status(400).json({ error: 'candidate_math_text and a selected case are required' });
      return;
    }
    const priorWrong = state.events.filter(
      (e) => e.type === 'math_verdict' && e.verdict !== 'correct',
    ).length;
    const verdict = judgeMath(text, state.case_pack, state.mode, priorWrong);
    await updateSession(state, {}, [
      { type: 'math_verdict', verdict: verdict.verdict, correct_figure: verdict.correct_figure },
    ]);
    res.json(verdict);
  }),
);

app.get('/session/:id/state', (req, res) =>
  withSession(req, res, async (state) => {
    res.json(state);
  }),
);

app.post('/session/:id/debrief', (req, res) =>
  withSession(req, res, async (state) => {
    if (!state.case_pack) {
      res.status(400).json({ error: 'no case selected' });
      return;
    }
    const transcript: TranscriptTurn[] = state.events
      .filter((e) => e.type === 'candidate_turn' || e.type === 'interviewer_turn')
      .map((e) => ({
        speaker: e.type === 'candidate_turn' ? ('candidate' as const) : ('interviewer' as const),
        text: (e as { text: string }).text,
        timestamp: e.timestamp,
      }));
    const handoff: DebriefHandoff = {
      session_id: state.session_id,
      mode: state.mode,
      case_pack: state.case_pack,
      transcript,
      events: state.events,
    };
    res.json(handoff);
  }),
);

const PORT = process.env.PORT ?? 3000;

export { app };

if (require.main === module) {
  (async () => {
    let pool;
    try {
      pool = getPool();
      await migrate(pool);
      console.log('Database migrated');
    } catch (err) {
      console.error('Migration failed:', (err as Error).message);
    } finally {
      if (pool) await pool.end();
    }

    app.listen(PORT, () => {
      console.log(`Engine listening on port ${PORT}`);
    });
  })();
}
