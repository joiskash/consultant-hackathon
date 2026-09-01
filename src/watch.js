import { buildConfig } from './config.js';
import { createSource } from './source.js';
import { AmcError } from './amc.js';
import { Telegram, renderEvent, URGENT } from './telegram.js';
import { loadState, saveState } from './state.js';
import { pollOnce } from './poll.js';
import { log } from './log.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cfg = buildConfig();
const amc = createSource(cfg);
const tg = new Telegram(cfg.telegramToken, cfg.telegramChatId);
const state = loadState(cfg.stateFile);

let theatreName = 'AMC Lincoln Square 13';
let consecutiveFailures = 0;
let failureAlerted = false;
let fastPollUntil = 0;

/** Queue on disk first, so a Telegram outage cannot swallow the one alert that matters. */
async function deliver(html, { silent = false, repeat = 1 } = {}) {
  for (let i = 0; i < repeat; i++) {
    if (i > 0) await sleep(3000);
    const ok = await tg.send(html, { silent });
    if (!ok) {
      state.outbox.push({ html, silent, queuedAt: Date.now() });
      saveState(cfg.stateFile, state);
      return;
    }
  }
}

async function flushOutbox() {
  if (!state.outbox?.length) return;
  log.info(`flushing ${state.outbox.length} queued message(s)`);
  const pending = [...state.outbox];
  state.outbox = [];
  for (const msg of pending) {
    const ok = await tg.send(msg.html, { silent: msg.silent });
    if (!ok) state.outbox.push(msg);
  }
  saveState(cfg.stateFile, state);
}

async function bootstrap() {
  const botName = await tg.verify();
  log.info(`telegram bot @${botName} reachable`);

  if (!state.theatreId) {
    state.theatreId = cfg.theatreId ?? (await amc.findTheatreId(cfg.theatreSlug));
  }
  if (state.dateFormat) amc.dateFormat = state.dateFormat;
  await amc.resolveDateFormat(state.theatreId, cfg.watchStart);
  state.dateFormat = amc.dateFormat;
  saveState(cfg.stateFile, state);

  await deliver(
    `<b>👁️ Odyssey watcher started</b>\n\nWatching IMAX 70mm at ${theatreName}\n${cfg.watchStart} → ${cfg.watchEnd}\nPolling every ${Math.round(cfg.pollIntervalMs / 1000)}s`,
    { silent: true },
  );
}

async function tick() {
  const firstRun = Object.keys(state.showtimes ?? {}).length === 0;
  const { events, showtimes } = await pollOnce(amc, cfg, state);

  const urgent = events.filter((e) => URGENT.has(e.kind));
  const quiet = events.filter((e) => !URGENT.has(e.kind));

  for (const e of urgent) {
    log.info(`ALERT ${e.kind} ${e.id}`);
    // Repeat the ones that matter: a single missed buzz is a missed ticket.
    await deliver(renderEvent(e, theatreName), { repeat: 3 });
  }
  // On the very first poll every tracked showtime is "new", which would fire
  // one message per showtime. Collapse that into a single summary; only later
  // arrivals are worth an individual note.
  if (firstRun && quiet.length > 1) {
    const soldOut = quiet.filter((e) => e.showtime.soldOut).length;
    log.info(`first run: summarising ${quiet.length} tracked showtimes`);
    await deliver(
      `<b>👁️ Now watching ${quiet.length} IMAX 70mm showtime(s)</b>\n` +
        `${soldOut} currently sold out.\n\nYou will be alerted the moment any of them becomes buyable.`,
      { silent: true },
    );
  } else {
    for (const e of quiet) {
      log.info(`note ${e.kind} ${e.id}`);
      await deliver(renderEvent(e, theatreName), { silent: true });
    }
  }

  // Drops arrive in bursts, so tighten the cadence for a while after any change.
  if (events.length) fastPollUntil = Date.now() + cfg.fastPollWindowMs;

  state.showtimes = showtimes;
  state.trackedCount = Object.keys(showtimes).length;
  state.lastPollAt = Date.now();
  saveState(cfg.stateFile, state);
}

async function heartbeat() {
  if (Date.now() - (state.lastHeartbeat ?? 0) < cfg.heartbeatMs) return;
  const tracked = state.trackedCount ?? 0;
  // Zero tracked showtimes for hours usually means the matcher is wrong, not
  // that nothing is scheduled — say so rather than looking healthy while blind.
  const warn = tracked === 0 ? '\n\n⚠️ Tracking 0 showtimes — run `npm run discover` to check the format matcher.' : '';
  await deliver(
    `<b>💓 Watcher alive</b>\nTracking ${tracked} IMAX 70mm showtime(s)\nLast poll: ${new Date(state.lastPollAt ?? Date.now()).toISOString()}${warn}`,
    { silent: true },
  );
  state.lastHeartbeat = Date.now();
  saveState(cfg.stateFile, state);
}

async function main() {
  try {
    await bootstrap();
  } catch (e) {
    // Startup failures are the easiest kind to miss: the supervisor restarts us
    // quietly and nothing reaches the phone. Try to say why before dying.
    log.error(`startup failed: ${e.message}`);
    await deliver(
      `<b>🔴 Watcher failed to start</b>\n<code>${e.message}</code>\n\nIt will keep retrying.`,
    ).catch(() => {});
    throw e;
  }

  for (;;) {
    try {
      await flushOutbox();
      await tick();
      await heartbeat();

      if (consecutiveFailures > 0) {
        if (failureAlerted) {
          await deliver('<b>✅ Watcher recovered</b>\nPolling normally again.', { silent: true });
        }
        consecutiveFailures = 0;
        failureAlerted = false;
      }
    } catch (e) {
      consecutiveFailures++;
      log.error(`poll failed (${consecutiveFailures}): ${e.message}`);

      // A rejected key never fixes itself. Shout once and keep the process up
      // so the supervisor does not crash-loop against AMC.
      const fatal = e instanceof AmcError && (e.status === 401 || e.status === 403);
      if ((fatal || consecutiveFailures >= cfg.failureAlertThreshold) && !failureAlerted) {
        failureAlerted = true;
        await deliver(
          `<b>🔴 Watcher is failing</b>\n${consecutiveFailures} consecutive error(s).\n<code>${e.message}</code>\n\nIt keeps retrying, but check it.`,
        );
      }
    }

    const interval = Date.now() < fastPollUntil ? cfg.fastPollIntervalMs : cfg.pollIntervalMs;
    // Jitter keeps restarts from lining up into a thundering herd.
    await sleep(interval + Math.random() * 2000);
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log.info(`${sig} received, saving state`);
    saveState(cfg.stateFile, state);
    process.exit(0);
  });
}

main().catch((e) => {
  log.error(`fatal: ${e.stack ?? e.message}`);
  process.exit(1);
});
