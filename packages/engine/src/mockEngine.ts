// STUB: replaces the real M2 state machine until M2 lands. Canned SaveRite briefs only.
import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { PhaseBrief, Phase } from '@freshcase/types';

const PHASE_ORDER: Phase[] = ['prompt', 'clarifying', 'structure', 'quant', 'brainstorm', 'recommendation', 'debrief'];

const BRIEFS: Record<Phase, PhaseBrief> = {
  menu: { phase: 'menu', may_say: ['Which case would you like?'], must_withhold: [], coaching_policy: '', time_guidance: '' },
  prompt: { phase: 'prompt', may_say: ['SaveRite, a grocery chain, has seen margins slip this quarter. How would you approach it?'], must_withhold: ['segment data'], coaching_policy: 'no feedback', time_guidance: '' },
  clarifying: { phase: 'clarifying', may_say: ['Good question — happy to share what we have.'], must_withhold: ['quant figures'], coaching_policy: 'no feedback', time_guidance: 'wrap clarifying soon' },
  structure: { phase: 'structure', may_say: ['Take a moment to structure your thinking.'], must_withhold: ['revenue split'], coaching_policy: 'no mid-case feedback', time_guidance: 'structure running long — offer to move on' },
  quant: { phase: 'quant', may_say: ['Walk me through the numbers.'], must_withhold: ['the answer'], coaching_policy: 'probe once then reveal', time_guidance: '' },
  brainstorm: { phase: 'brainstorm', may_say: ['What levers could improve margin?'], must_withhold: [], coaching_policy: 'no feedback', time_guidance: '' },
  recommendation: { phase: 'recommendation', may_say: ['Bring it together — what do you recommend?'], must_withhold: [], coaching_policy: 'no feedback', time_guidance: '' },
  debrief: { phase: 'debrief', may_say: ['That\u2019s everything from me — let\u2019s talk about how it went.'], must_withhold: [], coaching_policy: '', time_guidance: '' },
};

interface Session { id: string; mode: string; phaseIndex: number; mathAttempts: number; events: any[]; }

export function mockEngineRouter(): Router {
  const r = Router();
  const sessions = new Map<string, Session>();

  r.post('/session', (req, res) => {
    const id = randomUUID();
    sessions.set(id, { id, mode: req.body.mode ?? 'realistic', phaseIndex: 0, mathAttempts: 0, events: [] });
    res.status(201).json({ session_id: id, menu: [{ id: 'saverite', title: 'SaveRite grocery margins' }] });
  });

  r.post('/session/:id/select', (req, res) => {
    res.json({ prompt_spoken: BRIEFS.prompt.may_say[0], disclaimer_spoken: 'SaveRite is a real company; figures here are illustrative.' });
  });

  r.post('/session/:id/ask', (_req, res) => {
    // Canned ledger hit; real M2 does topic-match + live fetch.
    res.json({ answer: 'Same-store sales are flat year over year.', miss: false });
  });

  r.post('/session/:id/advance', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'session not found' });
    s.phaseIndex = Math.min(s.phaseIndex + 1, PHASE_ORDER.length - 1);
    res.json(BRIEFS[PHASE_ORDER[s.phaseIndex]]);
  });

  r.post('/session/:id/quant', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'session not found' });
    s.mathAttempts += 1;
    if (String(req.body.candidate_math_text).includes('20')) return res.json({ verdict: 'correct' });
    if (s.mathAttempts < 2) return res.json({ verdict: 'probe' });
    res.json({ verdict: 'reveal', correct_figure: '20%' });
  });

  r.post('/session/:id/event', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'session not found' });
    s.events.push({ ...req.body, at: Date.now() });
    if (req.body.type === 'silence_report') return res.json({ action: 'check_in' });
    res.json({ ack: true });
  });

  r.post('/session/:id/debrief', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'session not found' });
    res.json({ spoken_debrief: 'You structured well and recovered on the math. Your scorecard is on screen.', events: s.events });
  });

  return r;
}
