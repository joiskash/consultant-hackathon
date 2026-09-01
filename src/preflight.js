/** Two-minute sanity check to run before trusting the watcher. */
import { buildConfig, datesInWindow } from './config.js';
import { AmcClient } from './amc.js';
import { Telegram } from './telegram.js';

const cfg = buildConfig();
let failed = false;
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => { failed = true; console.log(`  FAIL  ${m}`); };

console.log('\n1. Config');
ok(`window ${cfg.watchStart} → ${cfg.watchEnd} (${datesInWindow(cfg.watchStart, cfg.watchEnd).length} days)`);

console.log('\n2. Telegram');
const tg = new Telegram(cfg.telegramToken, cfg.telegramChatId);
try {
  ok(`bot @${await tg.verify()} reachable`);
} catch (e) { bad(`getMe: ${e.message}`); }

console.log('\n3. AMC vendor key');
const amc = new AmcClient(cfg.amcKey);
let theatreId = null;
try {
  theatreId = cfg.theatreId ?? (await amc.findTheatreId(cfg.theatreSlug));
  ok(`theatre id ${theatreId}`);
} catch (e) { bad(`theatre lookup: ${e.message}`); }

if (theatreId) {
  console.log('\n4. Showtimes endpoint');
  try {
    await amc.resolveDateFormat(theatreId, cfg.watchStart);
    const st = await amc.showtimes(theatreId, cfg.watchStart);
    ok(`${st.length} showtimes on ${cfg.watchStart} (date format: ${amc.dateFormat})`);
  } catch (e) { bad(`showtimes: ${e.message}`); }

  console.log('\n5. Embargoed feed (optional)');
  try {
    const emb = await amc.embargoedShowtimes(theatreId, cfg.watchStart);
    if (emb === null) console.log('  WARN  key lacks embargoed access — early warning disabled, watcher still works');
    else ok(`${emb.length} embargoed showtimes`);
  } catch (e) { bad(`embargoed: ${e.message}`); }
}

console.log('\n6. Test alert');
if (await tg.send('<b>🧪 Preflight test</b>\nIf you see this, alerts will reach you.')) ok('test message delivered');
else bad('could not deliver test message');

console.log(failed ? '\nPREFLIGHT FAILED — fix the above before deploying.\n' : '\nAll checks passed. Safe to deploy.\n');
process.exit(failed ? 1 : 0);
