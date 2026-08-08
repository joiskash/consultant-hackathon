import request from 'supertest';
import { app } from '../../src/index';
import { getPool, migrate } from '@freshcase/db';
import { clearCache } from '../../src/sessionStore';

// Verifies Postgres write-through: session survives a cache wipe (restart).
describe('sessions persistence integration', () => {
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

  test('session state survives an in-memory cache wipe', async () => {
    if (!process.env.DATABASE_URL) {
      console.log('Skipping DB integration test: DATABASE_URL not set');
      return;
    }

    const create = await request(app).post('/session').send({ mode: 'realistic' });
    expect(create.status).toBe(201);
    const id = create.body.session_id;

    await request(app).post(`/session/${id}/select`).send({ case_id: 'fixture-saverite' });

    clearCache(); // simulate a backend restart

    const state = await request(app).get(`/session/${id}/state`);
    expect(state.status).toBe(200);
    expect(state.body.mode).toBe('realistic');
    expect(state.body.phase).toBe('prompt');
    expect(state.body.case_pack.meta.id).toBe('fixture-saverite');
  });
});
