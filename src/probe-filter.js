/**
 * Decisive probe: does AMC's own imax70mm filter slug work as a URL segment?
 * Includes a positive control (the `imax` filter, which should have showtimes)
 * so we can tell "parser is broken" apart from "no 70mm showtimes exist".
 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const THEATRE = 'amc-lincoln-square-13';
const dates = ['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];

async function look(date, filter) {
  const url = `https://www.amctheatres.com/showtimes/all/${date}/${THEATRE}/${filter}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
    const html = await res.text();
    const ids = [...new Set([...html.matchAll(/\/showtimes\/(\d+)/g)].map((m) => m[1]))];
    const odyssey = /the-odyssey-\d+/i.test(html);
    // The dropdown always contains every filter label, so counting labels is
    // meaningless; only showtime ids and the movie slug indicate real content.
    return { url, status: res.status, bytes: html.length, ids, odyssey, html };
  } catch (e) {
    return { url, error: e.message };
  }
}

console.log('=== imax70mm filter across the watch window ===');
let sample = null;
for (const d of dates) {
  const r = await look(d, 'imax70mm');
  if (r.error) { console.log(`  ${d}  ERR ${r.error}`); continue; }
  console.log(`  ${d}  ${r.status}  bytes=${r.bytes}  showtimeIds=${r.ids.length}  odysseyPresent=${r.odyssey}`);
  if (!sample && r.ids.length && r.odyssey) sample = r;
}

console.log('\n=== positive control: imax filter on first date ===');
const ctl = await look(dates[0], 'imax');
if (!ctl.error) {
  console.log(`  ${dates[0]}  ${ctl.status}  bytes=${ctl.bytes}  showtimeIds=${ctl.ids.length}  odysseyPresent=${ctl.odyssey}`);
  console.log(`  ids: ${ctl.ids.slice(0, 12).join(', ')}`);
}

// One bounded excerpt of a real showtime block, to find sold-out markers.
const src = sample ?? (ctl.ids?.length ? ctl : null);
if (src) {
  console.log(`\n=== showtime block excerpt from ${src.url} ===`);
  const i = src.html.search(/\/showtimes\/\d+/);
  console.log(src.html.slice(Math.max(0, i - 1200), i + 1200).replace(/\s+/g, ' '));
  console.log('\n=== sold-out vocabulary present? ===');
  for (const w of ['sold out','soldout','isSoldOut','unavailable','almost sold','Sold Out']) {
    console.log(`  ${w}: ${src.html.includes(w) ? 'PRESENT' : 'absent'}`);
  }
} else {
  console.log('\nNo page had both showtime ids and Odyssey — nothing to excerpt.');
}
