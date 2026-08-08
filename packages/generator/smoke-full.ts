// Temporary timed live smoke for the full generateMenu pipeline.
// Run: npx ts-node --compiler-options '{"module":"commonjs"}' smoke-full.ts
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { generateMenu, getCasePack } from './src';

const t0 = Date.now();
const stamp = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`;
const origLog = console.log.bind(console);
const origErr = console.error.bind(console);
console.log = (...args: unknown[]) => origLog(stamp(), ...args);
console.error = (...args: unknown[]) => origErr(stamp(), ...args);

(async () => {
  const menu = await generateMenu({ count: 2 });
  console.log('=== MENU ===');
  console.log(JSON.stringify(menu, null, 2));
  const gen = menu.items.find((i) => i.id.startsWith('gen-'));
  if (gen) {
    const pack = await getCasePack(gen.id);
    console.log('--- generated pack:', pack.meta.id, '| insight:', pack.hidden_insight.pattern);
    console.log(pack.quant_module.setup_spoken);
  }
  console.log('DONE');
})().catch((err) => {
  console.error('SMOKE FAILED:', err);
  process.exit(1);
});
