import express from 'express';
import request from 'supertest';
import { signedUrlRouter } from '../src/services/elevenlabs';

const fake = { conversationalAi: { conversations: { getSignedUrl: async ({ agentId }: any) => ({ signedUrl: 'wss://x/' + agentId }) } } } as any;
const app = express().use(signedUrlRouter(() => fake));

test('returns a signed url for the agent', async () => {
  const r = await request(app).get('/api/voice/signed-url?agentId=g1');
  expect(r.status).toBe(200);
  expect(r.body.signedUrl).toBe('wss://x/g1');
});

test('400 when agentId missing', async () => {
  expect((await request(app).get('/api/voice/signed-url')).status).toBe(400);
});
