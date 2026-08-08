import request from 'supertest';
import { app } from '../src/index';

describe('GET /api/cases', () => {
  test('returns the fixture case menu', async () => {
    const res = await request(app).get('/api/cases');
    expect(res.status).toBe(200);
    expect(res.body.cases).toHaveLength(1);
    expect(res.body.cases[0].company).toBe('SaveRite (fictional)');
  });
});
