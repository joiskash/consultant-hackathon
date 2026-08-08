import express from 'express';
import request from 'supertest';
import { mockEngineRouter } from '../src/mockEngine';

const app = express().use(express.json()).use(mockEngineRouter());

test('start_session returns a session id and a menu', async () => {
  const r = await request(app).post('/session').send({ mode: 'realistic' });
  expect(r.status).toBe(201);
  expect(r.body.session_id).toBeDefined();
  expect(Array.isArray(r.body.menu)).toBe(true);
});

test('advance returns a valid PhaseBrief', async () => {
  const s = await request(app).post('/session').send({ mode: 'realistic' });
  const r = await request(app).post(`/session/${s.body.session_id}/advance`).send({ reason: 'entering structure' });
  expect(r.status).toBe(200);
  expect(r.body.phase).toBeDefined();
  expect(Array.isArray(r.body.may_say)).toBe(true);
});
