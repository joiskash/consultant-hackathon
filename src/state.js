import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isBuyable } from './match.js';

const EMPTY = { theatreId: null, dateFormat: null, showtimes: {}, lastHeartbeat: 0, outbox: [] };

export function loadState(file) {
  try {
    return { ...EMPTY, ...JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    return { ...EMPTY };
  }
}

/** Atomic: a crash mid-write must never leave a truncated state file behind. */
export function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, file);
}

export function fingerprint(st, { embargoed = false } = {}) {
  return {
    embargoed,
    soldOut: Boolean(st.isSoldOut),
    almostSoldOut: Boolean(st.isAlmostSoldOut),
    buyable: !embargoed && isBuyable(st),
    movieName: st.movieName ?? null,
    showDateTimeLocal: st.showDateTimeLocal ?? st.showDateTimeUtc ?? null,
    auditorium: st.auditorium ?? null,
    purchaseUrl: st.purchaseUrl ?? null,
  };
}

/**
 * Compare the previous fingerprints against this poll and emit only the
 * transitions worth waking someone for.
 *
 * `prev` is the stored map; `curr` is id -> fingerprint from this poll.
 */
export function diffShowtimes(prev, curr) {
  const events = [];

  for (const [id, now] of Object.entries(curr)) {
    const before = prev[id];

    if (!before) {
      // Never seen. Buyable on arrival is the headline case: a new on-sale show.
      events.push({
        kind: now.buyable ? 'NEW_ONSALE' : now.embargoed ? 'NEW_EMBARGOED' : 'NEW_UNAVAILABLE',
        id,
        showtime: now,
      });
      continue;
    }

    // Embargo lifted: it was scheduled but unpurchasable, and now it is not.
    if (before.embargoed && !now.embargoed && now.buyable) {
      events.push({ kind: 'EMBARGO_LIFTED', id, showtime: now });
      continue;
    }

    // Returns and expired holds: the realistic path to a seat on a sold-out run.
    if (before.soldOut && !now.soldOut && now.buyable) {
      events.push({ kind: 'BACK_IN_STOCK', id, showtime: now });
      continue;
    }

    // Became purchasable for any other reason (e.g. purchaseUrl appeared).
    if (!before.buyable && now.buyable) {
      events.push({ kind: 'NOW_BUYABLE', id, showtime: now });
    }
  }

  return events;
}
