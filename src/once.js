/**
 * Single-pass entry for the GitHub Actions backup watcher.
 *
 * Actions gives us no reliable persistent state, so this deliberately trades
 * precision for safety: it alerts whenever a buyable IMAX 70mm showtime exists,
 * deduping through a state file restored from the Actions cache. If the cache
 * misses, you get a duplicate alert — which is strictly better than a missed one.
 */
import { buildConfig } from './config.js';
import { AmcClient } from './amc.js';
import { Telegram, renderEvent, URGENT } from './telegram.js';
import { loadState, saveState } from './state.js';
import { pollOnce } from './poll.js';
import { log } from './log.js';

const cfg = buildConfig();
const amc = new AmcClient(cfg.amcKey);
const tg = new Telegram(cfg.telegramToken, cfg.telegramChatId);
const state = loadState(cfg.stateFile);

try {
  if (!state.theatreId) state.theatreId = cfg.theatreId ?? (await amc.findTheatreId(cfg.theatreSlug));
  if (state.dateFormat) amc.dateFormat = state.dateFormat;
  await amc.resolveDateFormat(state.theatreId, cfg.watchStart);
  state.dateFormat = amc.dateFormat;

  const { events, showtimes } = await pollOnce(amc, cfg, state);

  for (const e of events.filter((x) => URGENT.has(x.kind))) {
    log.info(`ALERT ${e.kind} ${e.id}`);
    await tg.send(`${renderEvent(e, 'AMC Lincoln Square 13')}\n\n<i>(backup watcher)</i>`);
  }

  state.showtimes = showtimes;
  state.trackedCount = Object.keys(showtimes).length;
  state.lastPollAt = Date.now();
  saveState(cfg.stateFile, state);
  log.info('single pass complete');
} catch (e) {
  log.error(`single pass failed: ${e.message}`);
  await tg.send(`<b>⚠️ Backup watcher error</b>\n<code>${e.message}</code>`, { silent: true });
  process.exit(1);
}
