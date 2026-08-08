import { CaseMenu, CaseMenuItem, CasePack } from '@freshcase/types';
import { loadConfig, GeneratorConfig } from './config';
import { ContextClient, NaicsCode, SearchResult } from './contextClient';
import { extractCompanyCandidate, preScore, scoreHeadline, ScoredHeadline } from './caseability';
import { groundStory } from './grounding';
import { authorCase } from './author';
import { checkCoherence, repairPack } from './coherence';
import { loadFixturePacks } from './fixtures';

export { ContextClient } from './contextClient';
export * from './caseability';
export * from './coherence';
export * from './grounding';
export { buildAuthorPrompt, authorCase, slugify } from './author';
export { loadConfig } from './config';
export { loadFixturePacks } from './fixtures';

const generatedPacks = new Map<string, CasePack>();
let fixturePacks: Map<string, CasePack> | null = null;

function fixtures(): Map<string, CasePack> {
  if (!fixturePacks) fixturePacks = loadFixturePacks();
  return fixturePacks;
}

const log = (msg: string) => console.log(`[generator] ${msg}`);
const logError = (msg: string) => console.error(`[generator] ${msg}`);

function teaser(pack: CasePack, publishedHint: string | null): string {
  const type = pack.meta.case_type.replace(/_/g, ' ');
  const headline = pack.meta.source_headline;
  if (!headline) return `A ${type} case on ${pack.meta.company}.`;
  const today = new Date().toISOString().slice(0, 10);
  const recency = publishedHint === today ? "this morning's news" : "this week's news";
  return `A ${type} case on ${pack.meta.company}, from ${recency}: ${headline}`;
}

function menuItem(pack: CasePack, publishedHint: string | null): CaseMenuItem {
  return {
    id: pack.meta.id,
    spoken_teaser: teaser(pack, publishedHint),
    case_type: pack.meta.case_type,
    company: pack.meta.company,
    source_published_hint: publishedHint,
  };
}

interface PipelineDeps {
  client?: ContextClient;
  config?: GeneratorConfig;
  author?: typeof authorCase;
  repair?: typeof repairPack;
}

// Only trust results actually on the press allowlist — verified live 8 Aug 2026
// that the API's includeDomains param is not reliably enforced.
export function filterToAllowlist(results: SearchResult[], domains: string[]): SearchResult[] {
  return results.filter((r) => {
    try {
      const host = new URL(r.url).hostname.replace(/^www\./, '');
      return domains.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
      return false;
    }
  });
}

// Below this many allowlisted fresh results, widen the search window.
const THIN_POOL_THRESHOLD = 15;

// Stage 1 — headline pool via context.dev /web/search. Prefer the last 24
// hours (the "published this morning" demo beat); if the pool is thin, widen
// to the last week and merge so the menu never starves on a slow news day.
async function fetchHeadlinePool(
  client: ContextClient,
  config: GeneratorConfig,
): Promise<SearchResult[]> {
  const query = config.caseTriggers.search_terms.join(' OR ');
  const search = async (freshness: 'last_24_hours' | 'last_week') =>
    filterToAllowlist(
      await client.searchWeb({
        query,
        numResults: 30,
        freshness,
        country: 'ae',
        includeDomains: config.pressAllowlist,
      }),
      config.pressAllowlist,
    );

  const fresh = await search('last_24_hours');
  if (fresh.length >= THIN_POOL_THRESHOLD) return fresh;

  log(`thin 24h pool (${fresh.length} results) — widening to last_week`);
  const weekly = await search('last_week');
  const seen = new Set(fresh.map((r) => r.url));
  return [...fresh, ...weekly.filter((r) => !seen.has(r.url))];
}

// Stage 2 — case-ability filter: heuristics first, then classification credits
// only for the shortlist. Emits the scored list to the log.
async function selectStories(
  client: ContextClient,
  config: GeneratorConfig,
  results: SearchResult[],
  n: number,
): Promise<ScoredHeadline[]> {
  const shortlist = [...results]
    .sort((a, b) => preScore(b, config.caseTriggers) - preScore(a, config.caseTriggers))
    .slice(0, n + 2);

  // NAICS input must be a brand name/domain, not a headline; classify in parallel.
  const scored = await Promise.all(
    shortlist.map(async (result) => {
      const company = extractCompanyCandidate(result.title);
      let codes: NaicsCode[] = [];
      if (company) {
        try {
          codes = await client.classifyNaics(company);
        } catch (err) {
          logError(`NAICS classification failed for "${company}": ${(err as Error).message}`);
        }
      }
      return scoreHeadline(result, config.caseTriggers, config.industryWhitelist, codes);
    }),
  );

  scored.sort((a, b) => b.score.score - a.score.score);
  log('case-ability scores:');
  for (const s of scored) {
    log(`  [${s.score.score}/5] ${s.result.title} — ${JSON.stringify(s.score.criteria)}`);
  }
  return scored.filter((s) => s.company !== null && s.case_type !== null).slice(0, n);
}

// Stages 3-5 for one story; returns null (and logs why) if the story is dropped.
async function buildPack(
  client: ContextClient,
  story: ScoredHeadline,
  deps: Required<Pick<PipelineDeps, 'author' | 'repair'>>,
): Promise<{ pack: CasePack; publishedAt: string | null } | null> {
  try {
    log(`grounding "${story.result.title}"`);
    const facts = await groundStory(client, story);
    log(`authoring pack for ${facts.company}`);
    const t = Date.now();
    let pack = await deps.author(facts, story.case_type as string, story.result.url);
    log(`authored ${pack.meta.id} in ${Math.round((Date.now() - t) / 1000)}s`);

    let violations = checkCoherence(pack);
    if (violations.length > 0) {
      log(`pack ${pack.meta.id} failed coherence (${violations.join(' | ')}) — one repair pass`);
      if (violations.some((v) => v.includes('setup_spoken'))) {
        log(`  setup_spoken was: ${pack.quant_module.setup_spoken}`);
      }
      pack = await deps.repair(pack, violations);
      violations = checkCoherence(pack);
      if (violations.length > 0) {
        logError(`pack ${pack.meta.id} REJECTED after repair: ${violations.join(' | ')}`);
        return null;
      }
    }
    return { pack, publishedAt: facts.published_at ?? null };
  } catch (err) {
    logError(`story dropped ("${story.result.title}"): ${(err as Error).message}`);
    return null;
  }
}

// Public interface — the only two functions other modules may import.

export async function generateMenu(
  opts: { count?: number } & PipelineDeps = {},
): Promise<CaseMenu> {
  const count = opts.count ?? 3;
  const config = opts.config ?? loadConfig();
  const deps = { author: opts.author ?? authorCase, repair: opts.repair ?? repairPack };

  const items: CaseMenuItem[] = [];
  let degraded = false;

  try {
    const client = opts.client ?? new ContextClient();
    const pool = await fetchHeadlinePool(client, config);
    log(`headline pool: ${pool.length} results`);
    const stories = await selectStories(client, config, pool, count + 1);

    // Build all selected stories (count + 1 spare) concurrently; keep the
    // first `count` that survive grounding, authoring, and the coherence guard.
    const built = await Promise.all(stories.map((story) => buildPack(client, story, deps)));
    for (const b of built) {
      if (!b || items.length >= count) continue;
      generatedPacks.set(b.pack.meta.id, b.pack);
      items.push(menuItem(b.pack, b.publishedAt));
    }
  } catch (err) {
    logError(`pipeline failed: ${(err as Error).message}`);
  }

  if (items.length < 2) {
    degraded = true;
    logError(
      `FALLBACK: only ${items.length} generated pack(s) viable — padding menu with fixture packs`,
    );
    for (const pack of fixtures().values()) {
      if (items.length >= count) break;
      if (items.some((i) => i.id === pack.meta.id)) continue;
      items.push(menuItem(pack, null));
    }
  }

  return degraded ? { items, degraded: true } : { items };
}

export async function getCasePack(id: string): Promise<CasePack> {
  const pack = generatedPacks.get(id) ?? fixtures().get(id);
  if (!pack) throw new Error(`Unknown case pack id: ${id}`);
  return pack;
}
