import express from 'express';
import request from 'supertest';
import { mockEngineRouter } from '../src/mockEngine';

const app = express().use(express.json()).use(mockEngineRouter());

test('drives a full case: start -> select -> ask -> advance*4 -> quant(probe->reveal) -> debrief', async () => {
  const start = await request(app).post('/session').send({ mode: 'realistic' });
  const id = start.body.session_id;

  await request(app).post(`/session/${id}/select`).send({ case_id: 'saverite' }).expect(200);
  const ask = await request(app).post(`/session/${id}/ask`).send({ question_text: 'is the whole industry feeling this?' }).expect(200);
  expect(ask.body.answer).toBeTruthy();

  const phases = [] as string[];
  for (let i = 0; i < 4; i++) {
    const b = await request(app).post(`/session/${id}/advance`).send({ reason: 'progress' }).expect(200);
    phases.push(b.body.phase);
  }
  expect(phases).toEqual(['clarifying', 'structure', 'quant', 'brainstorm']);

  const wrong1 = await request(app).post(`/session/${id}/quant`).send({ candidate_math_text: 'about 5%' }).expect(200);
  expect(wrong1.body.verdict).toBe('probe');
  const wrong2 = await request(app).post(`/session/${id}/quant`).send({ candidate_math_text: 'about 5%' }).expect(200);
  expect(wrong2.body.verdict).toBe('reveal');

  await request(app).post(`/session/${id}/event`).send({ type: 'candidate_turn', text: 'my recommendation is...' }).expect(200);
  const debrief = await request(app).post(`/session/${id}/debrief`).send({}).expect(200);
  expect(debrief.body.spoken_debrief).toBeTruthy();
  expect(debrief.body.events.length).toBeGreaterThan(0);
});
