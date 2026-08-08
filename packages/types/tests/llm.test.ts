import { callClaude } from '../src/llm';
import { z } from 'zod';

describe('callClaude', () => {
  test('throws when OPENROUTER_API_KEY is missing', async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(callClaude('hello', z.object({}))).rejects.toThrow(
      'OPENROUTER_API_KEY is not configured',
    );
  });
});
