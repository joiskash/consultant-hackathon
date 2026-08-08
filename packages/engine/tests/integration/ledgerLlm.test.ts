import fs from 'fs';
import path from 'path';
import { CasePackSchema } from '@freshcase/types';
import { classifyWithLlm } from '../../src/ledger';

// Paraphrased-question set against SaveRite's ledger, resolved by the real
// LLM classifier. Runs only when OPENROUTER_API_KEY is configured.

const saverite = CasePackSchema.parse(
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../../fixtures/saverite.json'), 'utf-8'),
  ),
);

// Ledger indices: 0 business_model, 1 market growth, 2 competition,
// 3 products, 4 value_chain/suppliers, 5 timeline, 6 revenue_trend
const PARAPHRASES: [string, number][] = [
  ['Is the whole industry feeling this, or just our client?', 2],
  ['Do they sell online at all or only in physical stores?', 0],
  ['Is the grocery market itself shrinking?', 1],
  ['Have any new players entered the space recently?', 2],
  ['Do we know which product categories are behind this?', 3],
  ['How does the company actually make money?', 4],
  ['How quickly does the client need an answer?', 5],
  ['Has the top line been going up or down?', 6],
  ['Where do they source what they sell?', 4],
  ['Are their rivals seeing profits stall as well?', 2],
];

const hasKey = !!process.env.OPENROUTER_API_KEY;
const maybe = hasKey ? describe : describe.skip;

maybe('LLM ledger classification (live)', () => {
  jest.setTimeout(60000);

  test.each(PARAPHRASES)('"%s" -> entry %i', async (question, expected) => {
    const result = await classifyWithLlm(question, saverite);
    expect(result.entry_index).toBe(expected);
  });

  test('quant-territory question is flagged', async () => {
    const result = await classifyWithLlm(
      'What exactly were their cost of goods sold numbers over the last three years?',
      saverite,
    );
    expect(result.quant_territory).toBe(true);
  });
});
