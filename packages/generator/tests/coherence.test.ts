import fs from 'fs';
import path from 'path';
import { CasePack, CasePackSchema } from '@freshcase/types';
import { checkCoherence, findAnomalousDrivers, parseNumberSeries } from '../src/coherence';

const saverite: CasePack = CasePackSchema.parse(
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../fixtures/saverite.json'), 'utf-8'),
  ),
);

const clone = (): CasePack => JSON.parse(JSON.stringify(saverite));

describe('coherence guard (Stage 5)', () => {
  test('saverite fixture passes all checks', () => {
    expect(checkCoherence(saverite)).toEqual([]);
  });

  test('parses the five spoken line items from setup_spoken', () => {
    const series = parseNumberSeries(saverite.quant_module.setup_spoken);
    expect(series.map((s) => s.values)).toEqual([
      [360, 378, 397],
      [50, 60, 72],
      [95, 100, 105],
      [10, 10.5, 11],
      [40, 42, 44],
    ]);
  });

  test('identifies COGS as the single anomalous driver', () => {
    const series = parseNumberSeries(saverite.quant_module.setup_spoken);
    const anomalies = findAnomalousDrivers(series);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toContain('goods');
  });

  test('broken arithmetic: worked_solution citing figures not in the speech fails', () => {
    const mutated = clone();
    mutated.quant_module.worked_solution.ebitda = '165 / 170 / 165 — flat';
    const violations = checkCoherence(mutated);
    expect(violations.some((v) => v.includes('worked_solution.ebitda'))).toBe(true);
  });

  test('two anomalous drivers fails the exactly-one check', () => {
    const mutated = clone();
    mutated.quant_module.setup_spoken = mutated.quant_module.setup_spoken.replace(
      'Wages: 95, 100, 105 million.',
      'Wages: 95, 120, 150 million.',
    );
    const violations = checkCoherence(mutated);
    expect(violations.some((v) => v.includes('exactly one anomalous'))).toBe(true);
  });

  test('no anomalous driver also fails the exactly-one check', () => {
    const mutated = clone();
    mutated.quant_module.setup_spoken = mutated.quant_module.setup_spoken.replace(
      'Cost of goods sold: 50, 60, then 72 million.',
      'Cost of goods sold: 50, 52.5, then 55 million.',
    );
    const violations = checkCoherence(mutated);
    expect(violations.some((v) => v.includes('exactly one anomalous'))).toBe(true);
  });

  test('empty risks fails completeness', () => {
    const mutated = clone();
    mutated.recommendation_key.risks = [];
    const violations = checkCoherence(mutated);
    expect(violations.some((v) => v.includes('recommendation_key.risks'))).toBe(true);
  });

  test('markdown in a spoken field fails speech lint', () => {
    const mutated = clone();
    mutated.prompt.spoken += ' See **this table** | col1 | col2 | at https://example.com';
    const violations = checkCoherence(mutated);
    expect(violations.some((v) => v.startsWith('speech lint: prompt.spoken'))).toBe(true);
  });

  test('ledger outside 5-8 entries fails', () => {
    const mutated = clone();
    mutated.clarifying_ledger = mutated.clarifying_ledger.slice(0, 2);
    const violations = checkCoherence(mutated);
    expect(violations.some((v) => v.includes('expected 5-8 entries'))).toBe(true);
  });
});
