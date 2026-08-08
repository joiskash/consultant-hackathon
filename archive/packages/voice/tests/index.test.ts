import { getAgentConfig } from '../src';

describe('getAgentConfig', () => {
  test('produces a config for realistic mode', () => {
    const config = getAgentConfig('realistic');
    expect(config.mode).toBe('realistic');
    expect(config.systemPrompt).toContain('professionally cold');
  });
});
