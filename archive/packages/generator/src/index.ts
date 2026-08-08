import { CasePack } from '@freshcase/types';

export interface StoryInput {
  headline: string;
  sourceUrl?: string;
}

export interface CaseabilityScore {
  headline: string;
  score: number;
  reasons: string[];
}

export function scoreCaseability(input: StoryInput): CaseabilityScore {
  const reasons: string[] = [];
  let score = 0;

  if (input.headline.length > 0) {
    score += 1;
    reasons.push('headline present');
  }
  if (input.sourceUrl) {
    score += 1;
    reasons.push('source url present');
  }

  return { headline: input.headline, score, reasons };
}

export async function generateCasePack(_input: StoryInput): Promise<CasePack> {
  throw new Error('generateCasePack is not implemented');
}
