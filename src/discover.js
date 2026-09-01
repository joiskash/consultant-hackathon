/**
 * Dumps every distinct format string AMC actually returns for the target movie,
 * so the IMAX 70mm matcher is pinned against real data instead of a guess.
 */
import { buildConfig, datesInWindow } from './config.js';
import { AmcClient } from './amc.js';
import { formatHaystack, isTargetMovie, isImax70 } from './match.js';

const cfg = buildConfig();
const amc = new AmcClient(cfg.amcKey);

const theatreId = cfg.theatreId ?? (await amc.findTheatreId(cfg.theatreSlug));
await amc.resolveDateFormat(theatreId, cfg.watchStart);

const seenFormats = new Set();
const seenAttrs = new Set();
const seenAuditoriums = new Set();
const seenMovies = new Set();
let matched = 0;
let total = 0;

for (const date of datesInWindow(cfg.watchStart, cfg.watchEnd)) {
  const live = await amc.showtimes(theatreId, date);
  const emb = (await amc.embargoedShowtimes(theatreId, date)) ?? [];
  console.log(`${date}: ${live.length} showtimes, ${emb.length} embargoed`);

  for (const st of [...live, ...emb]) {
    total++;
    seenMovies.add(st.movieName);
    if (!isTargetMovie(st, cfg.movieQuery)) continue;
    if (st.premiumFormat) seenFormats.add(st.premiumFormat);
    if (st.auditorium) seenAuditoriums.add(String(st.auditorium));
    for (const a of st.attributes ?? []) seenAttrs.add(`${a?.code} = ${a?.name}`);
    if (isImax70(st)) {
      matched++;
      console.log(`  MATCH ${st.showDateTimeLocal}  [${formatHaystack(st)}]  soldOut=${st.isSoldOut}`);
    } else {
      console.log(`  skip  ${st.showDateTimeLocal}  [${formatHaystack(st)}]`);
    }
  }
}

console.log('\n=== all movies at this theatre in window ===');
for (const m of [...seenMovies].sort()) console.log(' -', m);
console.log(`\n=== premiumFormat values for "${cfg.movieQuery}" ===`);
for (const f of [...seenFormats].sort()) console.log(' -', f);
console.log('\n=== attributes ===');
for (const a of [...seenAttrs].sort()) console.log(' -', a);
console.log('\n=== auditoriums ===');
for (const a of [...seenAuditoriums].sort()) console.log(' -', a);
console.log(`\n${matched} of ${total} showtimes matched the IMAX 70mm filter.`);
if (matched === 0) {
  console.log('\nNo matches. If a 70mm format appears above, set FORMAT_PATTERN to a regex that matches it.');
}
