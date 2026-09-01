/**
 * Discovery probe for the Parse.bot AMC API.
 *
 * Contract per the published OpenAPI: GET /scraper/{id}/{endpoint} with query
 * params and an X-API-Key header. Times every call, because whether Parse.bot
 * scrapes live or serves cache decides if this is usable for a ticket drop.
 * Never prints the key.
 */
const key = process.env.PARSEBOT_API_KEY || process.env.PARSE_BOT;
const scraperId = process.env.PARSEBOT_SCRAPER_ID || '52c31c90-81d2-412e-ab12-c18bfddf9da8';
if (!key) { console.error('No Parse.bot key (set PARSE_BOT or PARSEBOT_API_KEY)'); process.exit(1); }
console.log(`key prefix=${key.slice(0, 4)}… len=${key.length}  scraper=${scraperId}\n`);

const BASE = 'https://api.parse.bot';
const trim = (v, n = 1800) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? `${s.slice(0, n)} …[${s.length} bytes total]` : s;
};

async function get(endpoint, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const path = `/scraper/${scraperId}/${endpoint}${qs ? `?${qs}` : ''}`;
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(120_000), // a live scrape can be slow
    });
    const text = await res.text();
    const ms = Date.now() - t0;
    let body; try { body = JSON.parse(text); } catch { body = text; }
    console.log(`  ${res.status}  ${ms}ms  ${endpoint} ${qs}`);
    console.log(`     ${trim(body)}\n`);
    return { status: res.status, body, ms };
  } catch (e) {
    console.log(`  ERR  ${Date.now() - t0}ms  ${endpoint} ${qs}  ${e.message}\n`);
    return { error: e.message };
  }
}

console.log('=== 1. enumerate endpoints ===');
await get('endpoints');

console.log('=== 2. list_theatres (documented) ===');
const th = await get('list_theatres', { market: 'new-york-city' });

// Pull the Lincoln Square slug straight from the response rather than assuming it.
let slug = 'amc-lincoln-square-13';
try {
  const hit = JSON.stringify(th.body).match(/"[^"]*lincoln-square[^"]*"/i);
  if (hit) { slug = hit[0].replace(/"/g, ''); console.log(`  -> Lincoln Square slug: ${slug}\n`); }
} catch { /* fall back to the assumed slug */ }

console.log('=== 3. showtimes: try documented-ish shapes ===');
for (const params of [
  { theatre: slug, date: '2026-09-03' },
  { theatre_slug: slug, date: '2026-09-03' },
  { theatre: slug },
]) {
  const r = await get('get_showtimes', params);
  if (r.status === 200) { console.log('  ^ this shape works\n'); break; }
}

console.log('=== 4. other plausible endpoint names ===');
for (const name of ['list_showtimes', 'get_theatre_showtimes', 'list_movies', 'get_seating_layout']) {
  await get(name, {});
}

console.log('=== 5. freshness: same call twice, compare latency ===');
const a = await get('list_theatres', { market: 'new-york-city' });
const b = await get('list_theatres', { market: 'new-york-city' });
console.log(`  first=${a.ms}ms second=${b.ms}ms`);
console.log('  A much faster second call implies caching; similar slow times imply a live fetch.');
