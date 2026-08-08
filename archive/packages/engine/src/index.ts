import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import express from 'express';
import fs from 'fs';
import { CasePackSchema } from '@freshcase/types';
import { getPool, healthCheck, migrate } from '@freshcase/db';

const app = express();
app.use(express.json());

const fixturePath = path.join(__dirname, '../../../docs/fixtures/saverite.json');
const rawFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
export const saverite = CasePackSchema.parse(rawFixture);

app.get('/health', async (_req, res) => {
  try {
    const pool = getPool();
    await healthCheck(pool);
    await pool.end();
    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      db: 'down',
      error: (err as Error).message,
    });
  }
});

app.get('/api/cases', (_req, res) => {
  res.json({
    cases: [
      {
        id: saverite.meta.id ?? 'saverite',
        company: saverite.meta.company,
        industry: saverite.meta.industry,
        case_type: saverite.meta.case_type,
        prompt: saverite.prompt.spoken,
      },
    ],
  });
});

app.post('/api/sessions', async (req, res) => {
  const mode = req.body.mode ?? 'realistic';
  const caseId = req.body.caseId ?? 'saverite';
  let pool;
  try {
    pool = getPool();
    await migrate(pool);
    const result = await pool.query(
      'INSERT INTO sessions (mode, case_pack_id) VALUES ($1, $2) RETURNING id',
      [mode, caseId],
    );
    res.status(201).json({ id: result.rows[0].id, mode, caseId });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  } finally {
    if (pool) await pool.end();
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  let pool;
  try {
    pool = getPool();
    const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'session not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  } finally {
    if (pool) await pool.end();
  }
});

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
