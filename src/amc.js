import { log } from './log.js';

const BASE = 'https://api.amctheatres.com';
const MAX_PAGES = 10;

export class AmcError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AmcClient {
  constructor(vendorKey, { fetchImpl = fetch, maxRetries = 3 } = {}) {
    this.vendorKey = vendorKey;
    this.fetch = fetchImpl;
    this.maxRetries = maxRetries;
    this.dateFormat = null; // resolved lazily; see resolveDateFormat()
  }

  async get(path) {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    let lastErr;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff with jitter so parallel restarts don't sync up.
        const wait = Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 500;
        await sleep(wait);
      }
      let res;
      try {
        res = await this.fetch(url, {
          headers: { 'X-AMC-Vendor-Key': this.vendorKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(20_000),
        });
      } catch (e) {
        lastErr = new AmcError(`network error: ${e.message}`, 0);
        continue;
      }

      if (res.status === 429) {
        // Honour the server's own pacing before falling back to our backoff.
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 15_000;
        log.warn(`429 from AMC, backing off ${wait}ms`);
        await sleep(wait);
        lastErr = new AmcError('rate limited', 429);
        continue;
      }

      // 401/403/404 are decisions, not blips: retrying cannot change them.
      if (res.status === 404) throw new AmcError('not found', 404);
      if (res.status === 401 || res.status === 403) {
        // AMC explains the refusal in the body; without it a 403 is unactionable.
        const detail = await res.text().catch(() => '');
        throw new AmcError(
          `vendor key rejected (HTTP ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
          res.status,
        );
      }
      if (res.status >= 500) {
        lastErr = new AmcError(`server error ${res.status}`, res.status);
        continue;
      }
      if (!res.ok) throw new AmcError(`unexpected HTTP ${res.status}`, res.status);

      try {
        return await res.json();
      } catch (e) {
        lastErr = new AmcError(`bad JSON: ${e.message}`, res.status);
      }
    }
    throw lastErr ?? new AmcError('request failed', 0);
  }

  /** Follow HAL `_links.next` and concatenate one embedded collection. */
  async getPaged(path, collection) {
    const items = [];
    let next = path;
    for (let page = 0; page < MAX_PAGES && next; page++) {
      const body = await this.get(next);
      const chunk = body?._embedded?.[collection];
      if (Array.isArray(chunk)) items.push(...chunk);
      const href = body?._links?.next?.href;
      next = href && href !== next ? href : null;
    }
    return items;
  }

  async findTheatreId(slug) {
    const theatres = await this.getPaged('/v2/theatres?page-size=100', 'theatres');
    const want = slug.toLowerCase();
    const hit =
      theatres.find((t) => (t.slug || '').toLowerCase() === want) ??
      theatres.find((t) => (t.slug || '').toLowerCase().includes(want)) ??
      theatres.find((t) => (t.name || '').toLowerCase().includes('lincoln square'));
    if (!hit) throw new AmcError(`theatre not found for slug "${slug}"`, 404);
    log.info(`resolved theatre "${hit.name}" -> id ${hit.id}`);
    return String(hit.id);
  }

  /**
   * AMC's date path segment format is not something we want to guess wrong and
   * silently poll a 404 for days, so probe the candidates once and cache it.
   */
  async resolveDateFormat(theatreId, isoDate) {
    if (this.dateFormat) return this.dateFormat;
    const [y, m, d] = isoDate.split('-');
    const candidates = [
      ['iso', isoDate],
      ['m-d-yyyy', `${Number(m)}-${Number(d)}-${y}`],
      ['mm-dd-yyyy', `${m}-${d}-${y}`],
    ];
    for (const [name, value] of candidates) {
      try {
        await this.get(`/v2/theatres/${theatreId}/showtimes/${value}?page-size=1`);
        log.info(`AMC date format resolved: ${name} (${value})`);
        this.dateFormat = name;
        return name;
      } catch (e) {
        if (e.status === 401 || e.status === 403) throw e; // key problem, not format
        log.warn(`date format "${name}" rejected (${e.status || e.message})`);
      }
    }
    throw new AmcError('could not determine AMC date path format', 0);
  }

  formatDate(isoDate) {
    const [y, m, d] = isoDate.split('-');
    if (this.dateFormat === 'm-d-yyyy') return `${Number(m)}-${Number(d)}-${y}`;
    if (this.dateFormat === 'mm-dd-yyyy') return `${m}-${d}-${y}`;
    return isoDate;
  }

  async showtimes(theatreId, isoDate) {
    const d = this.formatDate(isoDate);
    return this.getPaged(`/v2/theatres/${theatreId}/showtimes/${d}?page-size=100`, 'showtimes');
  }

  /**
   * Scheduled-but-not-yet-purchasable performances. This feed is the earliest
   * warning that a drop is coming. Some vendor keys are not granted it, so a
   * denial degrades to "no embargo data" rather than killing the poll.
   */
  async embargoedShowtimes(theatreId, isoDate) {
    const d = this.formatDate(isoDate);
    try {
      return await this.getPaged(
        `/v2/theatres/${theatreId}/showtimes/${d}/views/embargoed?page-size=100`,
        'showtimes',
      );
    } catch (e) {
      if (e.status === 403 || e.status === 404) return null;
      throw e;
    }
  }
}
