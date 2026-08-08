import fs from 'fs';
import path from 'path';
import type { Mode } from '@freshcase/types';

const dir = path.join(__dirname, '../prompts');
const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf-8').trim();

export const FIRST_MESSAGE =
  'Welcome to FreshCase. I have three live cases from this morning\u2019s headlines. ' +
  'Before we start — would you like a guided run or a realistic one?';

export function composeSystemPrompt(mode: Mode): string {
  const modeFile = mode === 'guided' ? 'mode-guided.md' : 'mode-realistic.md';
  return [read('persona.md'), read(modeFile), read('protocol.md')].join('\n\n');
}
