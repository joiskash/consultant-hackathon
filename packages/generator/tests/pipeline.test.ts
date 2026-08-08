import fs from 'fs';
import path from 'path';
import { CasePack, CasePackSchema, StoryFacts } from '@freshcase/types';
import { generateMenu, getCasePack, ContextClient } from '../src';
import { slugify } from '../src/author';

const saverite: CasePack = CasePackSchema.parse(
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../fixtures/saverite.json'), 'utf-8'),
  ),
);

const headlines = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/headlines.json'), 'utf-8'),
) as { result: { url: string; title: string; description?: string; relevance?: string } }[];

const ARTICLE_MD = [
  '# Company beats expectations',
  'Published August 7, 2026.',
  'The company reported strong results this quarter, with management outlining a plan',
  'to address rising costs across its core segments.',
].join('\n');

// Canned context.dev responses keyed by endpoint.
function mockFetch(): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (url.includes('/web/search')) {
      return json({ results: headlines.map((h) => h.result) });
    }
    if (url.includes('/web/naics')) {
      return json({ status: 'ok', codes: [{ code: '445110', name: 'Grocery', confidence: 'high' }] });
    }
    if (url.includes('/web/scrape/markdown')) {
      return json({ success: true, markdown: ARTICLE_MD });
    }
    if (url.includes('/brand/retrieve')) {
      return json({
        status: 'ok',
        brand: {
          domain: 'example.com',
          title: 'Example Corp',
          description: 'A large company.',
          stock: { ticker: 'EXM' },
          industries: { eic: [{ industry: 'Retail', subindustry: 'Grocery' }] },
        },
      });
    }
    return json({ message: 'not found' }, 404);
  }) as typeof fetch;
}

// Stage-4 stand-in: returns a valid saverite-shaped pack customized per story.
async function mockAuthor(facts: StoryFacts, caseType: string, sourceUrl: string): Promise<CasePack> {
  const pack: CasePack = JSON.parse(JSON.stringify(saverite));
  pack.meta.id = `gen-${slugify(facts.company)}-${slugify(facts.headline)}`;
  delete (pack.meta as { fixture?: boolean }).fixture;
  pack.meta.company = facts.company;
  pack.meta.case_type = caseType;
  pack.meta.source_headline = facts.headline;
  pack.meta.source_urls = [sourceUrl];
  return pack;
}

describe('generateMenu pipeline (mocked context.dev)', () => {
  test('produces >= 2 valid packs from a canned search response', async () => {
    const client = new ContextClient({ apiKey: 'test-key', fetchImpl: mockFetch() });
    const menu = await generateMenu({ count: 3, client, author: mockAuthor });

    expect(menu.degraded).toBeUndefined();
    expect(menu.items.length).toBeGreaterThanOrEqual(2);
    for (const item of menu.items) {
      expect(item.id).toMatch(/^gen-/);
      expect(item.spoken_teaser.length).toBeGreaterThan(0);
      expect(item.company.length).toBeGreaterThan(0);
    }
  });

  test('generated packs are retrievable via getCasePack', async () => {
    const client = new ContextClient({ apiKey: 'test-key', fetchImpl: mockFetch() });
    const menu = await generateMenu({ count: 2, client, author: mockAuthor });
    const pack = await getCasePack(menu.items[0].id);
    expect(CasePackSchema.parse(pack)).toBeTruthy();
  });

  test('falls back to fixture packs with degraded flag when search fails', async () => {
    const failingFetch = (async () =>
      new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const client = new ContextClient({ apiKey: 'test-key', fetchImpl: failingFetch });
    const menu = await generateMenu({ count: 3, client, author: mockAuthor });

    expect(menu.degraded).toBe(true);
    expect(menu.items.length).toBeGreaterThanOrEqual(1);
    expect(menu.items[0].id).toBe('fixture-saverite');
  });

  test('fixture pack is always available by id', async () => {
    const pack = await getCasePack('fixture-saverite');
    expect(pack.meta.company).toContain('SaveRite');
  });

  test('getCasePack rejects unknown ids', async () => {
    await expect(getCasePack('nope')).rejects.toThrow('Unknown case pack id');
  });
});
