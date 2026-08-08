import { z } from 'zod';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5';

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  return JSON.parse(candidate);
}

// Single LLM entry point for all modules (M0 convention): structured output + one retry.
// Routed via OpenRouter; model configurable through LLM_MODEL.
export async function callClaude<T>(prompt: string, schema: z.ZodSchema<T>): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }
  const model = process.env.LLM_MODEL ?? DEFAULT_MODEL;

  let lastError: unknown;
  let retryFeedback = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 16384,
        // Case packs are large strict-JSON outputs; long "thinking" burns the
        // token budget and blows the 90s menu SLA. Ignored by non-reasoning models.
        reasoning: { enabled: false },
        messages: [
          {
            role: 'system',
            content:
              'You respond with a single valid JSON object only — no prose, no markdown fences.',
          },
          { role: 'user', content: prompt + retryFeedback },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      lastError = new Error(`OpenRouter API error: ${response.status}`);
      continue;
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    try {
      return schema.parse(extractJson(text));
    } catch (err) {
      lastError = err;
      retryFeedback =
        '\n\nYour previous response failed validation with these errors — fix them and return the corrected JSON:\n' +
        `${(err as Error).message}\n\nPrevious response:\n${text.slice(0, 8000)}`;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('callClaude failed to produce valid structured output');
}
