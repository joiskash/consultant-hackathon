/**
 * Diagnostic matrix for a rejected vendor key. Tries each endpoint and header
 * variant and reports the exact status and body, so a 403 becomes actionable
 * instead of a dead end.
 */
const key = process.env.AMC_VENDOR_KEY;
if (!key) { console.error('AMC_VENDOR_KEY not set'); process.exit(1); }
console.log(`key length=${key.length} prefix=${key.slice(0, 4)}… (value never printed)\n`);

const BASE = 'https://api.amctheatres.com';
const paths = [
  '/v2/theatres',
  '/v2/theatres?page-size=5',
  '/v2/theatres/2103',
  '/v2/theatres/amc-lincoln-square-13',
  '/v2/movies?page-size=5',
  '/v2/movies/views/now-playing?page-size=5',
  '/v2/theatres/2103/showtimes/2026-09-03',
  '/v1/theatres?page-size=5',
  '/',
];
const variants = [
  ['X-AMC-Vendor-Key + json', { 'X-AMC-Vendor-Key': key, Accept: 'application/json' }],
  ['X-AMC-Vendor-Key + hal', { 'X-AMC-Vendor-Key': key, Accept: 'application/hal+json' }],
  ['no accept header', { 'X-AMC-Vendor-Key': key }],
  ['lowercase header', { 'x-amc-vendor-key': key, Accept: 'application/json' }],
];

async function hit(path, headers) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers, signal: AbortSignal.timeout(15_000) });
    const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 220);
    console.log(`  ${String(res.status).padEnd(4)} ${path}`);
    if (body) console.log(`       ${res.ok ? 'OK: ' : ''}${body.slice(0, 200)}`);
  } catch (e) {
    console.log(`  ERR  ${path}  ${e.message}`);
  }
}

// Full endpoint sweep on the documented header form.
const [primaryLabel, primaryHeaders] = variants[0];
console.log(`===== ${primaryLabel} (all endpoints) =====`);
for (const path of paths) await hit(path, primaryHeaders);

// Then one representative call per alternative header form, to rule out the
// possibility that the key is fine and we are simply sending it wrong.
for (const [label, headers] of variants.slice(1)) {
  console.log(`\n===== ${label} =====`);
  await hit('/v2/theatres?page-size=5', headers);
}
