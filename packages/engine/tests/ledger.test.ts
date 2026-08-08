import { classifyHeuristic, resolveAsk, LiveFetcher } from '../src/ledger';
import { saverite } from '../src/index';

// SaveRite ledger indices:
// 0 business_model/operations/footprint, 1 market/industry_growth,
// 2 competition/competitors, 3 products/categories,
// 4 value_chain/suppliers/revenue_model, 5 timeline, 6 revenue_trend

describe('heuristic topic matching (LLM fallback)', () => {
  const cases: [string, number][] = [
    ['Can you tell me about their business model?', 0],
    ['What does their footprint look like?', 0],
    ['How is the market developing?', 1],
    ['Are competitors seeing the same thing?', 2],
    ['Which products drive the problem?', 3],
    ['How do suppliers fit into the value chain?', 4],
    ['What is the timeline for this work?', 5],
  ];

  test.each(cases)('"%s" -> entry %i', (question, expected) => {
    expect(classifyHeuristic(question, saverite).entry_index).toBe(expected);
  });

  test('unrelated question matches nothing', () => {
    expect(classifyHeuristic('What color is the CEO tie?', saverite).entry_index).toBeNull();
  });

  test('quant-territory detection', () => {
    expect(classifyHeuristic('What was revenue last year?', saverite).quant_territory).toBe(true);
    expect(classifyHeuristic('Can you share the cost figures?', saverite).quant_territory).toBe(true);
    expect(classifyHeuristic('Who are the competitors?', saverite).quant_territory).toBe(false);
  });
});

describe('resolveAsk', () => {
  const neverFetch: LiveFetcher = jest.fn(async () => {
    throw new Error('live fetch must not be called');
  });

  test('ledger hit returns the answer and a release event', async () => {
    const result = await resolveAsk(
      'are competitors affected?',
      saverite,
      async () => ({ entry_index: 2, quant_territory: false }),
      neverFetch,
    );
    expect(result.answer.answer).toContain('Competitors are NOT');
    expect(result.event.type).toBe('ledger_release');
  });

  test('quant-territory miss NEVER live-fetches (guardrail)', async () => {
    const fetcher = jest.fn(async () => ({ answer: 'nope', source_url: 'x' }));
    const generatedPack = {
      ...saverite,
      meta: { ...saverite.meta, fixture: undefined, source_urls: ['https://x.com/a'] },
    };
    const result = await resolveAsk(
      'what is their exact revenue figure?',
      generatedPack,
      async () => ({ entry_index: null, quant_territory: true }),
      fetcher,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.answer.miss).toBe(true);
    expect(result.event.type).toBe('ledger_miss');
  });

  test('fixture pack miss never live-fetches', async () => {
    const fetcher = jest.fn(async () => ({ answer: 'nope', source_url: 'x' }));
    const result = await resolveAsk(
      'what does the CEO think about drones?',
      saverite, // fixture: true
      async () => ({ entry_index: null, quant_territory: false }),
      fetcher,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.answer).toEqual({ answer: null, miss: true });
  });

  test('generated pack miss live-fetches and reports the source', async () => {
    const generatedPack = {
      ...saverite,
      meta: { ...saverite.meta, fixture: undefined, source_urls: ['https://news.com/story'] },
    };
    const result = await resolveAsk(
      'has the company announced layoffs?',
      generatedPack,
      async () => ({ entry_index: null, quant_territory: false }),
      async () => ({ answer: 'Yes, 5% of staff.', source_url: 'https://news.com/story' }),
    );
    expect(result.answer.live_fetched).toBe(true);
    expect(result.answer.source_url).toBe('https://news.com/story');
    expect(result.event.type).toBe('live_fetch');
  });

  test('failed live fetch degrades to a miss', async () => {
    const generatedPack = {
      ...saverite,
      meta: { ...saverite.meta, fixture: undefined, source_urls: ['https://news.com/story'] },
    };
    const result = await resolveAsk(
      'any recent regulatory findings?',
      generatedPack,
      async () => ({ entry_index: null, quant_territory: false }),
      async () => null,
    );
    expect(result.answer.miss).toBe(true);
  });
});
