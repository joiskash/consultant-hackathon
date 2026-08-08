import { CasePack } from '@freshcase/types';

export interface Scorecard {
  dimensions: { name: string; score: number; notes: string }[];
}

export function computeVoiceMetrics(_transcript: string): { talkTimeSeconds: number; silenceGaps: number } {
  return { talkTimeSeconds: 0, silenceGaps: 0 };
}

export async function scoreCase(_casePack: CasePack, _transcript: string): Promise<Scorecard> {
  throw new Error('scoreCase is not implemented');
}
