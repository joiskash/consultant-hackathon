import { z } from 'zod';
import { CasePack, ClarifyingAnswer, callClaude } from '@freshcase/types';

// /ask resolution: LLM topic match -> ledger hit -> live fetch (generated
// packs only) -> miss. Exact-string matching is forbidden; candidates
// paraphrase, so classification is semantic (one small LLM call) with a
// token-overlap heuristic fallback if the LLM is unavailable.

const ClassificationSchema = z.object({
  entry_index: z.number().int().nullable(),
  quant_territory: z.boolean(),
});
export type LedgerClassification = z.infer<typeof ClassificationSchema>;

export type Classifier = (question: string, pack: CasePack) => Promise<LedgerClassification>;
export type LiveFetcher = (question: string, pack: CasePack) => Promise<{
  answer: string;
  source_url: string;
} | null>;

export async function classifyWithLlm(
  question: string,
  pack: CasePack,
): Promise<LedgerClassification> {
  const entries = pack.clarifying_ledger
    .map((e, i) => `${i}: topics=[${e.topics.join(', ')}] answer="${e.answer}"`)
    .join('\n');
  const prompt = [
    'You are routing a case-interview clarifying question to a prepared answer ledger.',
    `Case prompt: ${pack.prompt.spoken}`,
    'Ledger entries:',
    entries,
    '',
    `Candidate question: "${question}"`,
    '',
    'Return JSON: { "entry_index": <index of the semantically matching entry, or null if none matches>,',
    '"quant_territory": <true if the question asks for revenue/cost/profit FIGURES or other numbers that belong to the quant exercise, else false> }',
  ].join('\n');
  return callClaude(prompt, ClassificationSchema);
}

const QUANT_WORDS = /revenue|cost|profit|margin|ebitda|income|financials|numbers|figures|how much|how many/i;

export function classifyHeuristic(question: string, pack: CasePack): LedgerClassification {
  const words = new Set(
    question
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
  let best: { index: number; score: number } | null = null;
  pack.clarifying_ledger.forEach((entry, index) => {
    const topicWords = entry.topics.flatMap((t) => t.toLowerCase().split(/[_\s]+/));
    const score = topicWords.filter((t) => words.has(t)).length;
    if (score > 0 && (!best || score > best.score)) best = { index, score };
  });
  return {
    entry_index: best ? (best as { index: number }).index : null,
    quant_territory: QUANT_WORDS.test(question),
  };
}

export async function defaultClassifier(
  question: string,
  pack: CasePack,
): Promise<LedgerClassification> {
  try {
    return await classifyWithLlm(question, pack);
  } catch {
    return classifyHeuristic(question, pack);
  }
}

const ExtractionSchema = z.object({ answer: z.string().nullable() });
const LIVE_FETCH_TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// Live fetch: scrape the pack's source article (warm cache — M1 scraped it),
// extract an answer with one LLM call; article lacking it -> domain-scoped
// search fallback. Timeout 8s -> miss.
export function makeLiveFetcher(deps: {
  scrapeMarkdown: (url: string) => Promise<string>;
  searchWeb: (params: {
    query: string;
    includeDomains?: string[];
    freshness?: 'last_week';
  }) => Promise<{ url: string; title: string; description?: string }[]>;
  pressAllowlist: string[];
}): LiveFetcher {
  return async (question, pack) => {
    const sourceUrl = pack.meta.source_urls[0];
    if (!sourceUrl) return null;
    try {
      return await withTimeout(
        (async () => {
          const article = await deps.scrapeMarkdown(sourceUrl);
          const extracted = await callClaude(
            [
              `Answer the question using ONLY this article. Return JSON {"answer": "<concise spoken answer>"} or {"answer": null} if the article does not contain it.`,
              `Question: ${question}`,
              `Article:\n${article.slice(0, 10000)}`,
            ].join('\n\n'),
            ExtractionSchema,
          );
          if (extracted.answer) return { answer: extracted.answer, source_url: sourceUrl };

          const domain = pack.meta.source_urls[0] ? new URL(sourceUrl).hostname : '';
          const results = await deps.searchWeb({
            query: `${pack.meta.company} ${question}`,
            includeDomains: [...deps.pressAllowlist, domain].filter(Boolean),
            freshness: 'last_week',
          });
          const top = results[0];
          if (!top) return null;
          const fromSearch = await callClaude(
            [
              `Answer the question using ONLY these search results. Return JSON {"answer": "<concise spoken answer>"} or {"answer": null}.`,
              `Question: ${question}`,
              `Results:\n${results
                .slice(0, 5)
                .map((r) => `- ${r.title}: ${r.description ?? ''} (${r.url})`)
                .join('\n')}`,
            ].join('\n\n'),
            ExtractionSchema,
          );
          return fromSearch.answer ? { answer: fromSearch.answer, source_url: top.url } : null;
        })(),
        LIVE_FETCH_TIMEOUT_MS,
      );
    } catch {
      return null;
    }
  };
}

export interface AskResult {
  answer: ClarifyingAnswer;
  event:
    | { type: 'ledger_release'; entry_index: number; answer: string }
    | { type: 'live_fetch'; question_text: string; answer: string; source_url: string }
    | { type: 'ledger_miss'; question_text: string };
}

export async function resolveAsk(
  question: string,
  pack: CasePack,
  classify: Classifier,
  liveFetch: LiveFetcher | null,
): Promise<AskResult> {
  const classification = await classify(question, pack);

  if (classification.entry_index !== null) {
    const entry = pack.clarifying_ledger[classification.entry_index];
    if (entry) {
      return {
        answer: { answer: entry.answer },
        event: {
          type: 'ledger_release',
          entry_index: classification.entry_index,
          answer: entry.answer,
        },
      };
    }
  }

  // Guardrail: quant-territory questions are answered from the pack or missed
  // — NEVER live-fetched. Live answers are real-world facts and must not
  // interact with the synthesized quant module.
  const isFixture = pack.meta.fixture === true;
  if (!classification.quant_territory && !isFixture && liveFetch) {
    const fetched = await liveFetch(question, pack);
    if (fetched) {
      return {
        answer: { answer: fetched.answer, live_fetched: true, source_url: fetched.source_url },
        event: {
          type: 'live_fetch',
          question_text: question,
          answer: fetched.answer,
          source_url: fetched.source_url,
        },
      };
    }
  }

  return {
    answer: { answer: null, miss: true },
    event: { type: 'ledger_miss', question_text: question },
  };
}
