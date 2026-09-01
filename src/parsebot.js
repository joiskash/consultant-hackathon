import { log } from './log.js';

const BASE = 'https://api.parse.bot';
const DEFAULT_SCRAPER = '52c31c90-81d2-412e-ab12-c18bfddf9da8';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ParseBotError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/** `U2hvd3RpbWU6MTQ2NjUxMjg0` -> `146651284`, which is AMC's own showtime URL id. */
export function decodeShowtimeId(encoded) {
  try {
    const plain = Buffer.from(String(encoded), 'base64').toString('utf8');
    const m = plain.match(/Showtime:(\d+)/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function purchaseUrlFor(encoded) {
  const numeric = decodeShowtimeId(encoded);
  return numeric ? `https://www.amctheatres.com/showtimes/${numeric}` : null;
}

/**
 * Flatten Parse.bot's movie -> showtime_groups -> showtimes nesting into the
 * flat shape the matcher and differ already speak, so the source is swappable.
 */
/**
 * Classify AMC's availability wording.
 *
 * Deliberately defaults to buyable: an unrecognised label costs one spurious
 * alert, whereas treating it as sold out loses the ticket silently. Only
 * explicit unavailability counts as sold out, and "almost sold out" is the
 * opposite of sold out — seats remain.
 */
export function classifyAvailability(raw) {
  const a = String(raw ?? '').trim().toLowerCase();
  if (!a) return { soldOut: false, almost: false, canceled: false, unknown: true };
  if (/cancel/.test(a)) return { soldOut: true, almost: false, canceled: true, unknown: false };
  if (/almost|few\b|limited|last\s|hurry/.test(a)) {
    return { soldOut: false, almost: true, canceled: false, unknown: false };
  }
  if (/sold\s*out|unavailable|not\s+available|no\s+longer|past|expired|closed/.test(a)) {
    return { soldOut: true, almost: false, canceled: false, unknown: false };
  }
  return { soldOut: false, almost: false, canceled: false, unknown: !/available|on\s*sale|buy/.test(a) };
}

export function normalize(payload, isoDate) {
  const out = [];
  for (const movie of payload?.data?.movies ?? []) {
    for (const group of movie.showtime_groups ?? []) {
      for (const st of group.showtimes ?? []) {
        const avail = classifyAvailability(st.availability);
        out.push({
          id: st.showtime_id,
          movieName: movie.title,
          movieSlug: movie.slug,
          premiumFormat: group.format ?? null,
          auditorium: null,
          attributes: [
            ...(group.amenities ?? []).map((a) => ({ code: a, name: a })),
            ...(group.language ? [{ code: group.language, name: group.language }] : []),
          ],
          isSoldOut: avail.soldOut,
          isAlmostSoldOut: avail.almost,
          isCanceled: avail.canceled,
          availabilityUnknown: avail.unknown,
          rawAvailability: st.availability ?? null,
          showDateTimeLocal: `${isoDate}T${to24h(st.time)}`,
          displayTime: `${st.date ?? isoDate} ${st.time ?? ''}`.trim(),
          purchaseUrl: purchaseUrlFor(st.showtime_id),
        });
      }
    }
  }
  return out;
}

function to24h(time) {
  const m = String(time ?? '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return '00:00:00';
  let h = Number(m[1]) % 12;
  if (/PM/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}:00`;
}

/**
 * Exposes the same surface the poller already used for the official API, so
 * swapping the data source needs no change to polling, state, or alerting.
 */
export class ParseBotSource {
  constructor(apiKey, { scraperId = DEFAULT_SCRAPER, fetchImpl = fetch, maxRetries = 3 } = {}) {
    this.apiKey = apiKey;
    this.scraperId = scraperId;
    this.fetch = fetchImpl;
    this.maxRetries = maxRetries;
    this.lastRequestAt = 0;
    this.minRequestGapMs = Number(process.env.MIN_REQUEST_GAP_MS ?? 1000);
    this.dateFormat = 'iso';
  }

  async get(endpoint, params = {}) {
    const gap = Date.now() - this.lastRequestAt;
    if (gap < this.minRequestGapMs) await sleep(this.minRequestGapMs - gap);
    this.lastRequestAt = Date.now();

    const qs = new URLSearchParams(params).toString();
    const url = `${BASE}/scraper/${this.scraperId}/${endpoint}${qs ? `?${qs}` : ''}`;
    let lastErr;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(Math.min(20_000, 800 * 2 ** attempt) + Math.random() * 400);
      let res;
      try {
        res = await this.fetch(url, {
          headers: { 'X-API-Key': this.apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(120_000), // upstream does a live fetch
        });
      } catch (e) {
        lastErr = new ParseBotError(`network error: ${e.message}`, 0);
        continue;
      }

      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after')) * 1000 || 20_000;
        log.warn(`Parse.bot rate limited, waiting ${wait}ms`);
        await sleep(wait);
        lastErr = new ParseBotError('rate limited', 429);
        continue;
      }
      // Auth and contract errors are verdicts, not blips.
      if ([401, 403, 404, 422].includes(res.status)) {
        const detail = await res.text().catch(() => '');
        throw new ParseBotError(`HTTP ${res.status}: ${detail.slice(0, 300)}`, res.status);
      }
      if (res.status >= 500) { lastErr = new ParseBotError(`server error ${res.status}`, res.status); continue; }
      if (!res.ok) throw new ParseBotError(`unexpected HTTP ${res.status}`, res.status);

      const body = await res.json().catch(() => null);
      if (body?.status && body.status !== 'success') {
        lastErr = new ParseBotError(`upstream status ${body.status}`, res.status);
        continue;
      }
      return body;
    }
    throw lastErr ?? new ParseBotError('request failed', 0);
  }

  async findTheatreId(slug) {
    // The slug IS the identifier this API takes, but verify it really exists so
    // a typo surfaces at startup rather than as silent empty results forever.
    const body = await this.get('list_theatres', { market: process.env.AMC_MARKET || 'new-york-city' });
    const theatres = body?.data?.theatres ?? [];
    const hit = theatres.find((t) => t.slug === slug);
    if (!hit) {
      const names = theatres.map((t) => t.slug).join(', ');
      log.warn(`"${slug}" not in market listing (${names || 'empty'}); using it anyway`);
      return slug;
    }
    log.info(`resolved theatre "${hit.name}" (${hit.slug})`);
    return hit.slug;
  }

  async resolveDateFormat() { return 'iso'; }

  async showtimes(theatreSlug, isoDate) {
    const body = await this.get('get_showtimes', { theatre: theatreSlug, date: isoDate });
    return normalize(body, isoDate);
  }

  /** This source has no embargoed feed; degrade rather than pretend. */
  async embargoedShowtimes() { return null; }

  async seating(showtimeId) {
    return this.get('get_seating_layout', { showtime_id: showtimeId });
  }
}
