import { buildServerTools } from '../src/tools';

test('defines all 8 server tools pointing at the backend', () => {
  const tools = buildServerTools('https://api.example.com');
  const names = tools.map((t) => t.name).sort();
  expect(names).toEqual([
    'ask_clarifying', 'end_case', 'get_phase_brief', 'report_advance',
    'report_silence', 'select_case', 'start_session', 'submit_math',
  ]);
  tools.forEach((t) => {
    expect(t.type).toBe('webhook');
    expect(t.api_schema.url.startsWith('https://api.example.com')).toBe(true);
  });
});

test('ask_clarifying description forbids answering from world knowledge', () => {
  const ask = buildServerTools('https://x').find((t) => t.name === 'ask_clarifying')!;
  expect(ask.description.toLowerCase()).toContain('rather than answering from your own knowledge');
  expect(ask.api_schema.method).toBe('POST');
});
