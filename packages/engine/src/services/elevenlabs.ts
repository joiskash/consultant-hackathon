import { Router } from 'express';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

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

export function getClient(): any {
  return new ElevenLabsClient({ apiKey: getElevenLabsConfig().apiKey });
}

export function signedUrlRouter(clientFactory: () => any = getClient): Router {
  const r = Router();
  r.get('/api/voice/signed-url', async (req, res) => {
    const agentId = req.query.agentId ? String(req.query.agentId) : '';
    if (!agentId) return res.status(400).json({ error: 'agentId is required' });
    try {
      const { signedUrl } = await clientFactory().conversationalAi.conversations.getSignedUrl({ agentId });
      res.json({ signedUrl });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  return r;
}
