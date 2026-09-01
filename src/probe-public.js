/**
 * Is there a keyless path to the same data? Checks AMC's public website
 * endpoints for reachability from a datacenter IP and for the markers we would
 * need to parse. Reports only status/size/markers — never dumps page content.
 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const urls = [
  'https://www.amctheatres.com/movie-theatres/new-york-city/amc-lincoln-square-13/showtimes',
  'https://www.amctheatres.com/movie-theatres/amc-loews-lincoln-square-13/showtimes/all/2026-09-03',
  'https://www.amctheatres.com/movie-theatres/new-york-city/amc-lincoln-square-13',
  'https://www.amctheatres.com/showtimes/all/2026-09-03/amc-lincoln-square-13/all',
];

const markers = ['odyssey', '70mm', '70 mm', 'imax', '__NEXT_DATA__', 'application/ld+json', 'showtime'];
const blockers = ['just a moment', 'cf-challenge', 'access denied', 'captcha', 'enable javascript'];

for (const url of urls) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(25_000),
      redirect: 'follow',
    });
    const body = await res.text().catch(() => '');
    const low = body.toLowerCase();
    const found = markers.filter((m) => low.includes(m));
    const blocked = blockers.filter((b) => low.includes(b));
    console.log(`\n${res.status}  ${url}`);
    console.log(`   final=${res.url}`);
    console.log(`   bytes=${body.length}  markers=[${found.join(', ')}]`);
    if (blocked.length) console.log(`   ⚠️  BOT-BLOCK SIGNALS: ${blocked.join(', ')}`);
  } catch (e) {
    console.log(`\nERR  ${url}\n   ${e.message}`);
  }
}
console.log('\nA 200 with odyssey/70mm/imax markers and no block signals means a keyless path is viable.');
