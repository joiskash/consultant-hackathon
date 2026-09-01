import { datesInWindow } from './config.js';
import { isCandidate } from './match.js';
import { fingerprint, diffShowtimes } from './state.js';
import { log } from './log.js';

/**
 * One full sweep of the watch window. Returns the events to alert on plus the
 * fingerprint map to store. Pure enough to test against fixtures.
 */
export async function pollOnce(amc, cfg, state) {
  const dates = datesInWindow(cfg.watchStart, cfg.watchEnd);
  const curr = {};
  let embargoFeedSeen = false;

  for (const date of dates) {
    const live = await amc.showtimes(state.theatreId, date);
    for (const st of live) {
      if (!isCandidate(st, cfg.movieQuery)) continue;
      curr[String(st.id)] = fingerprint(st, { embargoed: false });
    }

    const embargoed = await amc.embargoedShowtimes(state.theatreId, date);
    if (embargoed !== null) {
      embargoFeedSeen = true;
      for (const st of embargoed) {
        if (!isCandidate(st, cfg.movieQuery)) continue;
        const id = String(st.id);
        // The live feed is authoritative: if it already appeared there as
        // purchasable, do not overwrite it with the embargoed view.
        if (curr[id]?.buyable) continue;
        curr[id] = fingerprint(st, { embargoed: true });
      }
    }
  }

  const unknown = Object.values(curr).filter((f) => f.availabilityUnknown);
  if (unknown.length) {
    log.warn(`${unknown.length} showtime(s) had unrecognised availability wording; treated as buyable`);
  }

  const events = diffShowtimes(state.showtimes ?? {}, curr);
  log.info(
    `poll: ${Object.keys(curr).length} candidate showtime(s), ${events.length} event(s)` +
      (embargoFeedSeen ? '' : ' [embargo feed unavailable]'),
  );
  return { events, showtimes: curr, embargoFeedSeen };
}
