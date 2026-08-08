import fs from 'fs';
import path from 'path';
import { CasePack, CasePackSchema } from '@freshcase/types';

const FIXTURES_DIR = path.resolve(__dirname, '../../../fixtures');

// Fixture packs are always loaded and available by id; they are the fallback
// when live generation fails or yields < 2 viable packs.
export function loadFixturePacks(): Map<string, CasePack> {
  const packs = new Map<string, CasePack>();
  for (const file of fs.readdirSync(FIXTURES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8'));
    const parsed = CasePackSchema.safeParse(raw);
    if (parsed.success) {
      packs.set(parsed.data.meta.id, parsed.data);
    } else {
      console.error(`[generator] fixture ${file} failed CasePack validation — skipping`);
    }
  }
  return packs;
}
