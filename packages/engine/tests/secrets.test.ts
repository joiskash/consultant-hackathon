import { getContextDevConfig } from '../src/services/contextDev';
import { getElevenLabsConfig } from '../src/services/elevenlabs';

describe('secret handling', () => {
  test('CONTEXT_DEV_API_KEY is required', () => {
    delete process.env.CONTEXT_DEV_API_KEY;
    expect(() => getContextDevConfig()).toThrow('CONTEXT_DEV_API_KEY is not configured');
  });

  test('ELEVENLABS_API_KEY is required', () => {
    delete process.env.ELEVENLABS_API_KEY;
    expect(() => getElevenLabsConfig()).toThrow('ELEVENLABS_API_KEY is not configured');
  });
});
