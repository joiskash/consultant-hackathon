/**
 * Discovery probe for the Parse.bot AMC API.
 *
 * We do not know the endpoint names or parameter shapes, so this asks the API
 * to describe itself and then deliberately sends empty bodies: a well-behaved
 * API answers a missing-parameter error that names what it wants.
 * Never prints the key.
 */
const key = process.env.PARSEBOT_API_KEY || process.env.PARSE_BOT;
const scraperId = process.env.PARSEBOT_SCRAPER_ID || '806399d8-6960-4d3e-9ea0-da32b3129d63';
if (!key) { console.error('No Parse.bot key (set PARSE_BOT or PARSEBOT_API_KEY)'); process.exit(1); }
console.log(`key prefix=${key.slice(0, 4)}… len=${key.length}  scraper=${scraperId}\n`);

const BASE = 'https://api.parse.bot';
const headers = { 'X-API-Key': key, 'Content-Type': 'application/json' };
const show = (s) => (typeof s === 'string' ? s : JSON.stringify(s)).slice(0, 1500);

async function call(method, path, body) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(90_000), // scrape-on-demand can be slow
    });
    const text = await res.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    console.log(`  ${method} ${path} ${body ? JSON.stringify(body) : ''} -> ${res.status}`);
    console.log(`     ${show(parsed)}\n`);
    return { status: res.status, body: parsed };
  } catch (e) {
    console.log(`  ${method} ${path} -> ERR ${e.message}\n`);
    return { error: e.message };
  }
}

console.log('=== 1. describe the scraper ===');
for (const p of [`/scraper/${scraperId}`, `/scrapers/${scraperId}`, `/scraper/${scraperId}/endpoints`, '/scrapers']) {
  await call('GET', p);
}

console.log('=== 2. empty-body calls, to surface required params ===');
for (const name of ['get_showtimes', 'get_theatres', 'get_movies', 'get_seating_layout']) {
  await call('POST', `/scraper/${scraperId}/${name}`, {});
}

console.log('=== 3. plausible showtime queries ===');
const attempts = [
  { theatre: 'amc-lincoln-square-13', date: '2026-09-03' },
  { theater: 'amc-lincoln-square-13', date: '2026-09-03' },
  { theatre_slug: 'amc-lincoln-square-13', date: '2026-09-03' },
  { url: 'https://www.amctheatres.com/movie-theatres/new-york-city/amc-lincoln-square-13/showtimes' },
];
for (const body of attempts) {
  const r = await call('POST', `/scraper/${scraperId}/get_showtimes`, body);
  if (r.status === 200) { console.log('  ^ this parameter shape works'); break; }
}
