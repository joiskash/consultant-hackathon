import { log } from './log.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class Telegram {
  constructor(token, chatId, { fetchImpl = fetch } = {}) {
    this.token = token;
    this.chatId = chatId;
    this.fetch = fetchImpl;
  }

  async send(html, { silent = false } = {}) {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await sleep(1000 * 2 ** attempt);
      try {
        const res = await this.fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.chatId,
            text: html,
            parse_mode: 'HTML',
            disable_web_page_preview: false,
            disable_notification: silent,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) return true;
        const body = await res.text().catch(() => '');
        lastErr = new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        // A malformed chat id or revoked token will never succeed; stop early.
        if (res.status === 400 || res.status === 401 || res.status === 404) break;
      } catch (e) {
        lastErr = e;
      }
    }
    log.error(`telegram send failed: ${lastErr?.message}`);
    return false;
  }

  async verify() {
    const res = await this.fetch(`https://api.telegram.org/bot${this.token}/getMe`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Telegram getMe failed: HTTP ${res.status}`);
    const body = await res.json();
    return body?.result?.username ?? 'unknown';
  }
}

const HEADLINE = {
  NEW_ONSALE: '🎟️ NEW SHOWTIME ON SALE',
  EMBARGO_LIFTED: '🚨 TICKETS JUST OPENED',
  BACK_IN_STOCK: '♻️ SEATS RELEASED (was sold out)',
  NOW_BUYABLE: '✅ NOW BUYABLE',
  NEW_EMBARGOED: '👀 New showtime scheduled (not on sale yet)',
  NEW_UNAVAILABLE: 'ℹ️ New showtime seen (not purchasable)',
};

/** Events we buzz the phone for. The rest are informational. */
export const URGENT = new Set(['NEW_ONSALE', 'EMBARGO_LIFTED', 'BACK_IN_STOCK', 'NOW_BUYABLE']);

export function renderEvent(event, theatreName) {
  const s = event.showtime;
  const when = s.showDateTimeLocal
    ? String(s.showDateTimeLocal).replace('T', ' ').slice(0, 16)
    : 'time unknown';
  const lines = [
    `<b>${esc(HEADLINE[event.kind] ?? event.kind)}</b>`,
    '',
    `<b>${esc(s.movieName ?? 'Odyssey')}</b> — IMAX 70mm`,
    `📍 ${esc(theatreName)}`,
    `🕐 ${esc(when)}`,
  ];
  if (s.auditorium) lines.push(`🪑 ${esc(s.auditorium)}`);
  if (s.almostSoldOut) lines.push('⚠️ Almost sold out');
  if (s.purchaseUrl) lines.push('', `<a href="${esc(s.purchaseUrl)}">BUY NOW →</a>`);
  return lines.join('\n');
}
