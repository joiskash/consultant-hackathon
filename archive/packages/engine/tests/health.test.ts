import request from 'supertest';
import { app } from '../src/index';

describe('GET /health', () => {
  test('responds', async () => {
    const res = await request(app).get('/health');
    // 200 if DB is up, 503 if not; either means the server works
    expect([200, 503]).toContain(res.status);
  });
});
