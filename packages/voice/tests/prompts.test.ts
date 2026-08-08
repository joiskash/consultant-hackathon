import { composeSystemPrompt, FIRST_MESSAGE } from '../src/prompts';

test('realistic prompt is cold and includes the tool protocol', () => {
  const p = composeSystemPrompt('realistic');
  expect(p).toContain('never answer case questions from your own knowledge');
  expect(p).toContain('get_phase_brief');
  expect(p).not.toContain('technique coaching'); // guided-only delta absent
});
test('guided prompt includes coaching delta', () => {
  expect(composeSystemPrompt('guided')).toContain('technique coaching');
});
test('first message offers the case menu by voice', () => {
  expect(FIRST_MESSAGE.length).toBeGreaterThan(0);
});
