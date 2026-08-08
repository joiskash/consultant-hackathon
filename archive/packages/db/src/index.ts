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
  const filePath = path.join(__dirname, '../migrations/001_init.sql');
  const sql = fs.readFileSync(filePath, 'utf-8');
  await pool.query(sql);
}

export async function healthCheck(pool: Pool): Promise<void> {
  await pool.query('SELECT 1');
}
