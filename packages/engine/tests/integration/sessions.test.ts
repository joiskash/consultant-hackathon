import request from 'supertest';
import { app } from '../../src/index';
import { getPool, migrate } from '@freshcase/db';

describe('sessions integration', () => {
  let pool: ReturnType<typeof getPool> | null = null;

  beforeAll(async () => {
    if (process.env.DATABASE_URL) {
      pool = getPool();
      await migrate(pool);
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  test('POST /api/sessions and GET /api/sessions/:id', async () => {
    if (!process.env.DATABASE_URL) {
      console.log('Skipping DB integration test: DATABASE_URL not set');
      return;
    }

    const create = await request(app)
      .post('/api/sessions')
      .send({ mode: 'realistic', caseId: 'saverite' });

    expect(create.status).toBe(201);
    const { id } = create.body;

    const get = await request(app).get(`/api/sessions/${id}`);
    expect(get.status).toBe(200);
    expect(get.body.mode).toBe('realistic');
    expect(get.body.case_pack_id).toBe('saverite');
  });
});
