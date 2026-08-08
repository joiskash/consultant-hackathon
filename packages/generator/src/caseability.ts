import { CaseabilityScore } from '@freshcase/types';
import { CaseTriggersConfig, IndustryEntry } from './config';
import { NaicsCode, SearchResult } from './contextClient';

// Stage 2 — Case-ability filter (docs/specs/M1-generator.md).
// Score each headline 0–5, one point per criterion. All heuristics are pure;
// the industry criterion takes pre-fetched NAICS codes so the scorer itself
// never touches the network.

const COMPANY_STOPWORDS = new Set([
  'The', 'A', 'An', 'In', 'On', 'At', 'As', 'By', 'For', 'From', 'With', 'After', 'Before',
  'Why', 'How', 'What', 'When', 'Where', 'Who', 'Dubai', 'Abu', 'UAE', 'US', 'UK', 'Gulf',
  'Middle', 'East', 'Saudi', 'Europe', 'Asia', 'America', 'Africa', 'China', 'India',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'Oil', 'Gold', 'Brent', 'Stocks', 'Markets', 'Shares', 'Crypto', 'Bitcoin',
]);

// A run of 1-4 capitalized/allcaps tokens near the start of the title, e.g.
// "Emirates NBD posts record profit" -> "Emirates NBD".
export function extractCompanyCandidate(title: string): string | null {
  const cleaned = title.replace(/^[^A-Za-z0-9']+/, '');
  const match = cleaned.match(
    /^((?:[A-Z][A-Za-z0-9&'.-]*|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z0-9&'.-]*|[A-Z]{2,})){0,3})/,
  );
  if (!match) return null;
  const tokens = match[1].split(/\s+/).filter((t) => !COMPANY_STOPWORDS.has(t));
  if (tokens.length === 0) return null;
  return tokens.join(' ');
}

export function detectCaseType(text: string, triggers: CaseTriggersConfig): string | null {
  const lower = text.toLowerCase();
  const matches = Object.entries(triggers.case_types)
    .filter(([, rubric]) => rubric.keywords.some((k) => lower.includes(k.toLowerCase())))
    .sort((a, b) => a[1].priority - b[1].priority);
  return matches.length > 0 ? matches[0][0] : null;
}

export function hasDecisionSignal(text: string, triggers: CaseTriggersConfig): boolean {
  const lower = text.toLowerCase();
  return triggers.decision_signals.some((s) => lower.includes(s.toLowerCase()));
}

export function isWhitelistedIndustry(
  codes: NaicsCode[],
  whitelist: IndustryEntry[],
): string | null {
  for (const code of codes) {
    for (const entry of whitelist) {
      if (entry.naics_prefixes.some((prefix) => code.code.startsWith(prefix))) {
        return entry.name;
      }
    }
  }
  return null;
}

export interface ScoredHeadline {
  result: SearchResult;
  score: CaseabilityScore;
  company: string | null;
  case_type: string | null;
  industry: string | null;
}

export function scoreHeadline(
  result: SearchResult,
  triggers: CaseTriggersConfig,
  whitelist: IndustryEntry[],
  naicsCodes: NaicsCode[] = [],
): ScoredHeadline {
  const text = `${result.title} ${result.description ?? ''}`;
  const company = extractCompanyCandidate(result.title);
  const caseType = detectCaseType(text, triggers);
  const industry = isWhitelistedIndustry(naicsCodes, whitelist);

  const criteria = {
    single_company_protagonist: company !== null,
    decision_or_diagnosis: hasDecisionSignal(text, triggers),
    preferred_case_type: caseType !== null,
    high_relevance: result.relevance === 'high',
    whitelisted_industry: industry !== null,
  };
  const score = Object.values(criteria).filter(Boolean).length;

  return {
    result,
    score: { headline: result.title, score, criteria },
    company,
    case_type: caseType,
    industry,
  };
}

// Heuristic-only pre-score (criteria 1-4) used to shortlist candidates before
// spending classification credits on the industry check.
export function preScore(result: SearchResult, triggers: CaseTriggersConfig): number {
  const text = `${result.title} ${result.description ?? ''}`;
  let score = 0;
  if (extractCompanyCandidate(result.title)) score += 1;
  if (hasDecisionSignal(text, triggers)) score += 1;
  if (detectCaseType(text, triggers)) score += 1;
  if (result.relevance === 'high') score += 1;
  return score;
}
