export interface ElevenLabsConfig {
  apiKey: string;
}

export function getElevenLabsConfig(): ElevenLabsConfig {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }
  return { apiKey };
}
