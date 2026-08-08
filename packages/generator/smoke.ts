// Temporary live smoke test for Stages 1-3 (M1 spec: "Live smoke (manual, on the day)").
// Run: npx ts-node smoke.ts from packages/generator. Costs ~25 credits.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { ContextClient } from './src/contextClient';
import { loadConfig } from './src/config';
import { extractCompanyCandidate, preScore, scoreHeadline } from './src/caseability';
import { groundStory } from './src/grounding';
import { filterToAllowlist } from './src';

(async () => {
  const config = loadConfig();
  const client = new ContextClient();

  console.log('--- Stage 1: /web/search ---');
  const raw = await client.searchWeb({
    query: config.caseTriggers.search_terms.join(' OR '),
    numResults: 30,
    freshness: 'last_24_hours',
    country: 'ae',
    includeDomains: config.pressAllowlist,
  });
  const results = filterToAllowlist(raw, config.pressAllowlist);
  console.log(`got ${raw.length} results, ${results.length} on the press allowlist`);
  results.slice(0, 10).forEach((r) => console.log(`  [${r.relevance}] ${r.title} (${r.url})`));

  console.log('\n--- Stage 2: pre-score + one live NAICS call ---');
  const ranked = [...results].sort(
    (a, b) => preScore(b, config.caseTriggers) - preScore(a, config.caseTriggers),
  );
  const top = ranked.find((r) => extractCompanyCandidate(r.title) !== null);
  if (!top) throw new Error('no case-able results');
  const codes = await client.classifyNaics(extractCompanyCandidate(top.title)!);
  console.log(`top headline: ${top.title}`);
  console.log(`naics: ${JSON.stringify(codes)}`);
  const scored = scoreHeadline(top, config.caseTriggers, config.industryWhitelist, codes);
  console.log(`score: ${scored.score.score}/5 ${JSON.stringify(scored.score.criteria)}`);
  console.log(`company=${scored.company} case_type=${scored.case_type} industry=${scored.industry}`);

  console.log('\n--- Stage 3: grounding (scrape + brand) ---');
  const facts = await groundStory(client, scored);
  console.log(`company: ${facts.company} (${facts.domain})`);
  console.log(`published_at: ${facts.published_at}`);
  console.log(`article_md: ${facts.article_md.length} chars`);
  console.log(`anchor_facts: ${JSON.stringify(facts.anchor_facts, null, 2).slice(0, 800)}`);
})().catch((err) => {
  console.error('SMOKE FAILED:', err);
  process.exit(1);
});
