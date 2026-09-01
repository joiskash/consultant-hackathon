/**
 * Shows the real markup around the 70mm showtimes so the scraper can be written
 * against the actual page instead of a guess. Prints bounded excerpts only.
 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const url = process.env.PROBE_URL
  || 'https://www.amctheatres.com/showtimes/all/2026-09-03/amc-lincoln-square-13/all';

const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
const html = await res.text();
console.log(`${res.status} ${res.url}  bytes=${html.length}\n`);

// 1. Any embedded JSON blobs the page hands the client.
console.log('=== embedded JSON candidates ===');
for (const m of html.matchAll(/<script[^>]*(?:id="([^"]*)"|type="([^"]*)")[^>]*>/gi)) {
  const id = m[1] || m[2] || '';
  if (/json|__|state|data/i.test(id)) console.log(`  <script ${id}> at ${m.index}`);
}
for (const pat of ['__NEXT_DATA__', '__NUXT__', '__APOLLO_STATE__', 'window.__', 'ld+json']) {
  console.log(`  ${pat}: ${html.includes(pat) ? 'PRESENT' : 'absent'}`);
}

// 2. Markup around each 70mm mention.
console.log('\n=== context around "70mm" ===');
let n = 0;
for (const m of html.matchAll(/70\s*mm/gi)) {
  if (n++ >= 4) break;
  const chunk = html.slice(Math.max(0, m.index - 700), m.index + 700).replace(/\s+/g, ' ');
  console.log(`\n--- occurrence ${n} @ ${m.index} ---\n${chunk}\n`);
}
if (!n) console.log('  none found on this date');

// 3. Ticket links, which are what an alert must contain.
console.log('=== ticket-ish links ===');
const links = new Set();
for (const m of html.matchAll(/href="([^"]*(?:showtimes|ticket|seat)[^"]*)"/gi)) links.add(m[1]);
for (const l of [...links].slice(0, 25)) console.log('  ', l);

// 4. Does the word Odyssey sit near a showtime block?
const odys = html.search(/odyssey/i);
console.log(`\n=== first "odyssey" @ ${odys} ===`);
if (odys >= 0) console.log(html.slice(odys - 500, odys + 900).replace(/\s+/g, ' '));
