import { Scorecard } from '@freshcase/types';
import { computeMetrics } from '../src/metrics';
import { validateRubricOutput, lintSpokenDebrief, DIMENSIONS } from '../src/validator';
import { RubricOutput } from '../src/rubric';
import { strongHandoff } from './fixtures/goldens';

const handoff = strongHandoff();
const metrics = computeMetrics(handoff);

const okDebrief = [
  'Your best moment: you said "the profit plateau is a COGS problem, not a revenue problem" — exactly the instinct we want.',
  'First gap: push one layer deeper sooner. Drill: next case, name the segment you would cut before being asked.',
  'Second gap: tighten the close. Drill: give the recommendation in one sentence first. The written scorecard has the details.',
].join('\n\n');

function validOutput(): RubricOutput {
  const dimensions: Scorecard['dimensions'] = DIMENSIONS.map((name) => ({
    name,
    band: 'on_track' as const,
    findings: [
      {
        item: 'Reiterated the prompt?',
        answer: 'yes' as const,
        evidence:
          'So to make sure I have this right: SaveRite is a national grocery retailer with flat profits despite growing revenue',
      },
    ],
  }));
  return { scorecard: { dimensions }, spoken_debrief: okDebrief };
}

describe('validator (anti-hallucination gate)', () => {
  test('valid output passes', () => {
    expect(validateRubricOutput(validOutput(), handoff, metrics)).toEqual([]);
  });

  test('fabricated quote is rejected', () => {
    const output = validOutput();
    output.scorecard.dimensions[0].findings[0].evidence =
      'I think we should acquire our biggest competitor immediately';
    const violations = validateRubricOutput(output, handoff, metrics);
    expect(violations.some((v) => v.includes('does not appear in the transcript'))).toBe(true);
  });

  test('quote tolerates ASR punctuation differences (fuzzy >= 0.9)', () => {
    const output = validOutput();
    output.scorecard.dimensions[0].findings[0].evidence =
      'so to make sure i have this right saverite is a national grocery retailer, with flat profits despite growing revenue';
    expect(validateRubricOutput(output, handoff, metrics)).toEqual([]);
  });

  test('contradicted metric is rejected', () => {
    const output = validOutput();
    output.scorecard.dimensions[1].findings[0].evidence =
      'metric: hints_consumed.count = 4';
    const violations = validateRubricOutput(output, handoff, metrics);
    expect(violations.some((v) => v.includes('contradicts the computed value'))).toBe(true);
  });

  test('matching metric citation passes', () => {
    const output = validOutput();
    output.scorecard.dimensions[1].findings[0].evidence =
      'metric: calc_elapsed_seconds = 100';
    expect(validateRubricOutput(output, handoff, metrics)).toEqual([]);
  });

  test('missing dimension is rejected', () => {
    const output = validOutput();
    output.scorecard.dimensions = output.scorecard.dimensions.slice(0, 4);
    const violations = validateRubricOutput(output, handoff, metrics);
    expect(violations.some((v) => v.includes('missing dimension'))).toBe(true);
  });

  test('needs_work finding without a drill is rejected', () => {
    const output = validOutput();
    output.scorecard.dimensions[3].band = 'needs_work';
    output.scorecard.dimensions[3].findings[0].answer = 'no';
    const violations = validateRubricOutput(output, handoff, metrics);
    expect(violations.some((v) => v.includes('has no drill'))).toBe(true);
  });
});

describe('spoken-debrief lint', () => {
  test('valid 3-paragraph debrief passes', () => {
    expect(lintSpokenDebrief(okDebrief)).toEqual([]);
  });

  test('over 200 words fails', () => {
    const long = Array(3).fill(Array(80).fill('word').join(' ')).join('\n\n');
    expect(lintSpokenDebrief(long).some((v) => v.includes('hard cap 200'))).toBe(true);
  });

  test('wrong finding count fails', () => {
    expect(
      lintSpokenDebrief('only one paragraph here').some((v) => v.includes('exactly 3')),
    ).toBe(true);
  });

  test('markdown syntax fails', () => {
    const md = ['**Great** job', 'gap one', 'gap two'].join('\n\n');
    expect(lintSpokenDebrief(md).some((v) => v.includes('markdown'))).toBe(true);
  });
});
