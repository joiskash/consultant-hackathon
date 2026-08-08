import request from 'supertest';
import fs from 'fs';
import path from 'path';

// Full scripted walkthrough of saverite.json from menu to debrief handoff.
// The generator is mocked (no network, no LLM); ledger matching falls back to
// the heuristic because API keys are cleared below.

jest.mock('@freshcase/generator', () => {
  const fixture = JSON.parse(
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('fs').readFileSync(
      require('path').join(__dirname, '../../../fixtures/saverite.json'),
      'utf-8',
    ),
  );
  return {
    generateMenu: async () => ({
      items: [
        {
          id: 'fixture-saverite',
          spoken_teaser: 'A profitability case on SaveRite.',
          case_type: 'profitability',
          company: 'SaveRite (fictional)',
          source_published_hint: null,
        },
      ],
      degraded: true,
    }),
    getCasePack: async (id: string) => {
      if (id !== 'fixture-saverite') throw new Error(`Unknown case pack id: ${id}`);
      return fixture;
    },
    ContextClient: class {
      constructor() {
        throw new Error('no network in tests');
      }
    },
    loadConfig: () => {
      throw new Error('no config in tests');
    },
  };
});

import { app } from '../src/index';

beforeAll(() => {
  delete process.env.OPENROUTER_API_KEY; // force heuristic ledger classification
  delete process.env.CONTEXT_DEV_API_KEY; // no live fetch
});

describe('saverite walkthrough (menu -> debrief handoff)', () => {
  test('full scripted session produces the expected event log', async () => {
    // menu
    const create = await request(app).post('/session').send({ mode: 'realistic' });
    expect(create.status).toBe(201);
    const id = create.body.session_id;
    expect(create.body.menu.items[0].id).toBe('fixture-saverite');

    // select -> prompt
    const select = await request(app)
      .post(`/session/${id}/select`)
      .send({ case_id: 'fixture-saverite' });
    expect(select.status).toBe(200);
    expect(select.body.prompt_spoken).toContain('SaveRite');
    expect(select.body.disclaimer_spoken).toMatch(/simplified/i);

    // candidate speaks, asks a clarifying question
    await request(app)
      .post(`/session/${id}/event`)
      .send({ type: 'candidate_turn', payload: { text: 'Are competitors seeing this too?' } });
    const advance1 = await request(app)
      .post(`/session/${id}/advance`)
      .send({ reason: 'candidate started clarifying' });
    expect(advance1.status).toBe(200);
    expect(advance1.body.phase).toBe('clarifying');

    const ask = await request(app)
      .post(`/session/${id}/ask`)
      .send({ question_text: 'Are competitors seeing the same profitability problem?' });
    expect(ask.status).toBe(200);
    expect(ask.body.answer).toContain('Competitors are NOT');

    // structure
    const advance2 = await request(app).post(`/session/${id}/advance`).send({});
    expect(advance2.body.phase).toBe('structure');

    // illegal jump attempt: structure -> debrief
    const illegal = await request(app)
      .post(`/session/${id}/advance`)
      .send({ to_phase: 'debrief' });
    expect(illegal.status).toBe(400);

    // quant: wrong math (probe), then corrected
    const advance3 = await request(app).post(`/session/${id}/advance`).send({});
    expect(advance3.body.phase).toBe('quant');
    const wrong = await request(app)
      .post(`/session/${id}/quant`)
      .send({ candidate_math_text: 'EBITDA is about 180 million' });
    expect(wrong.body.verdict).toBe('probe');
    const right = await request(app)
      .post(`/session/${id}/quant`)
      .send({ candidate_math_text: 'Correction: EBITDA is flat at 165 million, COGS growing 20%' });
    expect(right.body.verdict).toBe('correct');

    // brainstorm -> recommendation -> debrief
    for (const phase of ['brainstorm', 'recommendation', 'debrief']) {
      const advance = await request(app).post(`/session/${id}/advance`).send({});
      expect(advance.body.phase).toBe(phase);
    }

    await request(app)
      .post(`/session/${id}/event`)
      .send({ type: 'interviewer_turn', payload: { text: 'Thanks — let us debrief.' } });

    // handoff
    const debrief = await request(app).post(`/session/${id}/debrief`).send({});
    expect(debrief.status).toBe(200);
    expect(debrief.body.case_pack.meta.id).toBe('fixture-saverite');
    expect(debrief.body.transcript).toHaveLength(2);

    const eventTypes = debrief.body.events.map((e: { type: string }) => e.type);
    expect(eventTypes).toEqual([
      'phase_transition', // menu -> prompt (select)
      'candidate_turn',
      'phase_transition', // prompt -> clarifying
      'ledger_release',
      'phase_transition', // clarifying -> structure
      'phase_transition', // structure -> quant
      'math_verdict',
      'math_verdict',
      'phase_transition', // quant -> brainstorm
      'phase_transition', // brainstorm -> recommendation
      'phase_transition', // recommendation -> debrief
      'interviewer_turn',
    ]);
  });

  test('silence crossings escalate through the ladder via /event', async () => {
    const create = await request(app).post('/session').send({ mode: 'guided' });
    const id = create.body.session_id;
    await request(app).post(`/session/${id}/select`).send({ case_id: 'fixture-saverite' });
    await request(app).post(`/session/${id}/advance`).send({}); // clarifying
    await request(app).post(`/session/${id}/advance`).send({}); // structure

    const actions: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post(`/session/${id}/event`)
        .send({ type: 'silence_crossing', payload: { seconds: 30 } });
      actions.push(
        res.body.escalation.action === 'hint'
          ? `hint${res.body.escalation.level}`
          : res.body.escalation.action,
      );
    }
    expect(actions).toEqual(['check_in', 'nudge', 'hint1']);

    // progress resets the ladder
    await request(app)
      .post(`/session/${id}/event`)
      .send({ type: 'candidate_turn', payload: { text: 'Right, so my structure is...' } });
    const afterProgress = await request(app)
      .post(`/session/${id}/event`)
      .send({ type: 'silence_crossing', payload: { seconds: 30 } });
    expect(afterProgress.body.escalation.action).toBe('check_in');
  });
});
