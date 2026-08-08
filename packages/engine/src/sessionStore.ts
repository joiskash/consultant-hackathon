import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { CasePack, EngineEvent, Mode, Phase, SessionState } from '@freshcase/types';
import { getPool } from '@freshcase/db';

// Sessions live in an in-memory map for fast access; every mutation is
// written through to Postgres (state JSONB) when DATABASE_URL is configured,
// so a backend restart mid-demo can recover.

// Distributive omit: strip `timestamp` from each EngineEvent variant without
// collapsing the discriminated union.
export type NewEngineEvent = EngineEvent extends infer E
  ? E extends { type: string; timestamp: number }
    ? Omit<E, 'timestamp'>
    : never
  : never;

const cache = new Map<string, SessionState>();

let pool: Pool | null | undefined;
function db(): Pool | null {
  if (pool === undefined) {
    try {
      pool = process.env.DATABASE_URL ? getPool() : null;
    } catch {
      pool = null;
    }
  }
  return pool;
}

async function persist(state: SessionState): Promise<void> {
  const p = db();
  if (!p) return;
  await p.query(
    `INSERT INTO sessions (id, mode, case_pack_id, phase, state)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE
       SET mode = $2, case_pack_id = $3, phase = $4, state = $5, updated_at = NOW()`,
    [
      state.session_id,
      state.mode,
      state.case_pack?.meta.id ?? '',
      state.phase,
      JSON.stringify(state),
    ],
  );
}

export async function createSession(mode: Mode): Promise<SessionState> {
  const state: SessionState = {
    session_id: randomUUID(),
    mode,
    phase: 'menu',
    case_pack: null,
    events: [],
    created_at: Date.now(),
  };
  cache.set(state.session_id, state);
  await persist(state);
  return state;
}

export async function getSession(id: string): Promise<SessionState | null> {
  const cached = cache.get(id);
  if (cached) return cached;
  const p = db();
  if (!p) return null;
  const result = await p.query('SELECT state FROM sessions WHERE id = $1', [id]);
  if (result.rows.length === 0 || !result.rows[0].state) return null;
  const state = result.rows[0].state as SessionState;
  cache.set(id, state);
  return state;
}

export async function updateSession(
  state: SessionState,
  changes: Partial<Pick<SessionState, 'phase' | 'case_pack'>>,
  events: NewEngineEvent[] = [],
): Promise<SessionState> {
  if (changes.phase) state.phase = changes.phase as Phase;
  if (changes.case_pack !== undefined) state.case_pack = changes.case_pack as CasePack | null;
  const now = Date.now();
  for (const event of events) {
    state.events.push({ ...event, timestamp: now } as EngineEvent);
  }
  await persist(state);
  return state;
}

export function clearCache(): void {
  cache.clear();
}

export async function closeStore(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
  cache.clear();
}
