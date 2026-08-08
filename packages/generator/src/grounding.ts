import { StoryFacts } from '@freshcase/types';
import { ContextClient } from './contextClient';
import { ScoredHeadline } from './caseability';

// Stage 3 — Story grounding: scrape the article + brand-retrieve the company.

// Search results carry no timestamp; pull a date from the URL or article body.
export function extractPublishedAt(url: string, articleMd: string): string | undefined {
  const urlMatch = url.match(/\/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:[/-]|$)/);
  if (urlMatch) {
    const [, y, m, d] = urlMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const iso = articleMd.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const written = articleMd
    .slice(0, 2000)
    .match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i,
    );
  if (written) {
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];
    const m = months.indexOf(written[1].toLowerCase()) + 1;
    return `${written[3]}-${String(m).padStart(2, '0')}-${written[2].padStart(2, '0')}`;
  }
  return undefined;
}

export async function groundStory(
  client: ContextClient,
  scored: ScoredHeadline,
): Promise<StoryFacts> {
  if (!scored.company) {
    throw new Error(`Cannot ground story without a company candidate: ${scored.result.title}`);
  }

  const [articleMd, brand] = await Promise.all([
    client.scrapeMarkdown(scored.result.url),
    client.retrieveBrand({ type: 'by_name', name: scored.company }),
  ]);
  if (!articleMd.trim()) {
    throw new Error(`Empty article scrape for ${scored.result.url}`);
  }
  if (!brand) {
    throw new Error(`Brand not resolvable for company "${scored.company}"`);
  }

  const anchorFacts: Record<string, unknown> = {
    brand_title: brand.title,
    brand_description: brand.description,
    domain: brand.domain,
    stock: brand.stock,
    employees: brand.employees,
    eic_industries: brand.industries?.eic,
    whitelisted_industry: scored.industry,
  };
  for (const key of Object.keys(anchorFacts)) {
    if (anchorFacts[key] === undefined || anchorFacts[key] === null) delete anchorFacts[key];
  }

  return {
    company: brand.title ?? scored.company,
    domain: brand.domain ?? '',
    headline: scored.result.title,
    article_md: articleMd,
    published_at: extractPublishedAt(scored.result.url, articleMd),
    anchor_facts: anchorFacts,
  };
}
