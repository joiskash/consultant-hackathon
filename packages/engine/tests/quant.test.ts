import { judgeMath, isMathCorrect } from '../src/quant';
import { saverite } from '../src/index';

// SaveRite worked solution: revenue ~5% YoY, COGS ~20% YoY, EBITDA 165/165.5/165.

describe('wrong-math ladder', () => {
  test('correct math (exact figures) passes', () => {
    expect(isMathCorrect('COGS is growing about 20% while revenue grows 5%, EBITDA flat at 165', saverite)).toBe(true);
  });

  test('rounding tolerance: "about 20%" vs 20.3% still correct', () => {
    expect(isMathCorrect('cost growth is roughly 20.3 percent a year', saverite)).toBe(true);
    expect(isMathCorrect('EBITDA comes out to about 166 million', saverite)).toBe(true);
  });

  test('wrong figure near an expected one is flagged', () => {
    expect(isMathCorrect('EBITDA is 180 million each year', saverite)).toBe(false);
    expect(isMathCorrect('costs are growing at 30% a year', saverite)).toBe(false);
  });

  test('realistic mode: probe first, reveal second', () => {
    const first = judgeMath('EBITDA is 180 million', saverite, 'realistic', 0);
    expect(first.verdict).toBe('probe');
    expect(first.correct_figure).toBeUndefined();

    const second = judgeMath('no wait, 185 million', saverite, 'realistic', 1);
    expect(second.verdict).toBe('reveal');
    expect(second.correct_figure).toBeTruthy();
  });

  test('self-correction after probe scores correct', () => {
    const recovered = judgeMath('sorry — recomputing, EBITDA is 165, flat', saverite, 'realistic', 1);
    expect(recovered.verdict).toBe('correct');
  });

  test('guided mode: reveal immediately on first error', () => {
    const verdict = judgeMath('EBITDA is 180 million', saverite, 'guided', 0);
    expect(verdict.verdict).toBe('reveal');
    expect(verdict.correct_figure).toBeTruthy();
  });
});
