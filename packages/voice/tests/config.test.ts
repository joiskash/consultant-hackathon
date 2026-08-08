import { buildConversationConfig } from '../src/config';

test('assembles prompt, tools, and tts into conversation_config', () => {
  const c: any = buildConversationConfig('realistic', 'https://api.example.com');
  expect(c.agent.prompt.prompt).toContain('never answer case questions');
  expect(c.agent.prompt.tools).toHaveLength(8);
  expect(c.agent.firstMessage.length).toBeGreaterThan(0);
  expect(c.tts.voiceId).toBe('JBFqnCBsd6RMkjVDRZzb');
  expect(c.agent.prompt.llm).toBeDefined();
});
