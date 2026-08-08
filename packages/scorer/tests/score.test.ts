import { score, scorecardMarkdown } from '../src';
import { computeMetrics } from '../src/metrics';
import { RubricOutput } from '../src/rubric';
import { DIMENSIONS } from '../src/validator';
import { strongHandoff } from './fixtures/goldens';

const handoff = strongHandoff();

const goodDebrief = [
  'Your best moment: you said "the profit plateau is a COGS problem, not a revenue problem" — exactly the instinct we want.',
  'First gap: reach the second layer faster. Drill: after any anomaly, immediately ask what is inside it.',
  'Second gap: compress your close. Drill: recommendation first, in one sentence. The written scorecard has the rest.',
].join('\n\n');

function canned(band: 'strength' | 'on_track' = 'on_track'): RubricOutput {
  return {
    scorecard: {
      dimensions: DIMENSIONS.map((name) => ({
        name,
        band,
        findings: [
          {
            item: 'Reiterated the prompt?',
            answer: 'yes' as const,
            evidence: 'metric: hints_consumed.count = 0',
          },
        ],
      })),
    },
    spoken_debrief: goodDebrief,
  };
}

describe('score() orchestration', () => {
  test('valid rubric output flows straight through', async () => {
    const result = await score(handoff, { evaluate: async () => canned('strength') });
    expect(result.scorecard.dimensions).toHaveLength(5);
    expect(result.spoken_debrief).toBe(goodDebrief);
    expect(result.metrics).toEqual(computeMetrics(handoff));
  });

  test('invalid output triggers exactly one repair pass', async () => {
    const bad = canned();
    bad.scorecard.dimensions[0].findings[0].evidence = 'a totally fabricated quote about drones';
    const repair = jest.fn(async () => canned());
    const result = await score(handoff, { evaluate: async () => bad, repair });
    expect(repair).toHaveBeenCalledTimes(1);
    expect(result.scorecard.dimensions).toHaveLength(5);
  });

  test('failed repair falls back to metrics-only scorecard with apology', async () => {
    const bad = canned();
    bad.scorecard.dimensions[0].findings[0].evidence = 'another fabricated quote';
    const result = await score(handoff, {
      evaluate: async () => bad,
      repair: async () => bad, // still invalid
    });
    expect(result.scorecard.dimensions).toEqual([]);
    expect(result.spoken_debrief).toMatch(/apolog/i);
    const md = scorecardMarkdown(result, handoff);
    expect(md).toContain('metrics only');
    expect(md).toContain('| Metric | Value |');
  });

  test('LLM failure falls back without throwing', async () => {
    const result = await score(handoff, {
      evaluate: async () => {
        throw new Error('provider down');
      },
    });
    expect(result.scorecard.dimensions).toEqual([]);
    expect(result.metrics.insight_layers_reached).toBe(2);
  });

  test('rendered scorecard matches the feedback-form layout snapshot', async () => {
    const result = await score(handoff, { evaluate: async () => canned('strength') });
    const md = scorecardMarkdown(result, handoff);
    expect(md).toMatchSnapshot();
    expect(md).toContain('# Case Scorecard — SaveRite (fictional)');
    expect(md).toContain('## Structure — Strength');
    expect(md).toContain('## Measured metrics');
    expect(md).toContain('synthesized for practice');
  });
});
