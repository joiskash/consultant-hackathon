import { readFileSync } from 'node:fs';

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

/** Minimal .env loader so local runs need no extra dependency. Real env wins. */
function loadDotEnv(path = '.env') {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return; // no .env file; values come from the environment
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

export function buildConfig() {
  loadDotEnv();

  const cfg = {
    amcKey: process.env.AMC_VENDOR_KEY,
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,

    theatreSlug: process.env.THEATRE_SLUG || 'amc-lincoln-square-13',
    theatreId: process.env.THEATRE_ID || null,
    movieQuery: (process.env.MOVIE_QUERY || 'odyssey').toLowerCase(),
    watchStart: process.env.WATCH_START || '2026-09-01',
    watchEnd: process.env.WATCH_END || '2026-09-06',

    pollIntervalMs: num(process.env.POLL_INTERVAL_MS, 60_000),
    fastPollIntervalMs: num(process.env.FAST_POLL_INTERVAL_MS, 15_000),
    fastPollWindowMs: num(process.env.FAST_POLL_WINDOW_MS, 600_000),
    heartbeatMs: num(process.env.HEARTBEAT_MS, 21_600_000),
    failureAlertThreshold: num(process.env.FAILURE_ALERT_THRESHOLD, 5),

    stateFile: process.env.STATE_FILE || './state/state.json',
  };

  const names = {
    amcKey: 'AMC_VENDOR_KEY',
    telegramToken: 'TELEGRAM_BOT_TOKEN',
    telegramChatId: 'TELEGRAM_CHAT_ID',
  };
  const missing = Object.keys(names).filter((k) => !cfg[k]);
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.map((k) => names[k]).join(', ')}`);
  }
  return cfg;
}

/** Inclusive list of YYYY-MM-DD dates in the watch window. */
export function datesInWindow(start, end) {
  const out = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(last.getTime())) {
    throw new Error(`Bad WATCH_START/WATCH_END: ${start} .. ${end}`);
  }
  if (last < d) throw new Error(`WATCH_END (${end}) is before WATCH_START (${start})`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
    if (out.length > 60) throw new Error('Watch window too large (>60 days)');
  }
  return out;
}
