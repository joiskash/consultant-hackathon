import { callClaude } from '../src/llm';
import { z } from 'zod';

describe('callClaude', () => {
  test('throws when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(callClaude('hello', z.object({}))).rejects.toThrow(
      'ANTHROPIC_API_KEY is not configured',
    );
  });
});
