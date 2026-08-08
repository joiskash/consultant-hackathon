export interface ContextDevConfig {
  apiKey: string;
  baseUrl: string;
}

export function getContextDevConfig(): ContextDevConfig {
  const apiKey = process.env.CONTEXT_DEV_API_KEY;
  if (!apiKey) {
    throw new Error('CONTEXT_DEV_API_KEY is not configured');
  }
  return { apiKey, baseUrl: 'https://api.context.dev/v1' };
}
