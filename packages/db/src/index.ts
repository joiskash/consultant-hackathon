import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }
  return new Pool({ connectionString });
}

export async function migrate(pool: Pool): Promise<void> {
  const dir = path.join(__dirname, '../migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(fs.readFileSync(path.join(dir, file), 'utf-8'));
  }
}

export async function healthCheck(pool: Pool): Promise<void> {
  await pool.query('SELECT 1');
}
