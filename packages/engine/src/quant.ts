import { CasePack, Mode, QuantVerdict } from '@freshcase/types';

// Wrong math policy: Realistic probes once then reveals; Guided corrects
// immediately with a technique note. Comparison tolerates rounding and stated
// approximation: ±5% relative, never string match.

const TOLERANCE = 0.05;
// A candidate number this close to an expected figure (but outside tolerance)
// is a contradiction; anything further away is treated as their own
// intermediate working and ignored.
const CONTRADICTION_BAND = 0.25;

export function extractNumbers(text: string): number[] {
  const matches = text.match(/-?\$?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
  return matches
    .map((m) => Number(m.replace(/[$,%]/g, '')))
    .filter((n) => !Number.isNaN(n) && !(Number.isInteger(n) && n >= 1900 && n <= 2099));
}

function expectedFigures(pack: CasePack): number[] {
  return extractNumbers(Object.values(pack.quant_module.worked_solution).join(' '));
}

function relDiff(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b);
}

export function isMathCorrect(candidateText: string, pack: CasePack): boolean {
  const expected = expectedFigures(pack);
  const stated = extractNumbers(candidateText);
  if (expected.length === 0 || stated.length === 0) return false;

  let matches = 0;
  let contradictions = 0;
  for (const n of stated) {
    const best = expected.reduce((min, e) => Math.min(min, relDiff(n, e)), Infinity);
    if (best <= TOLERANCE) matches += 1;
    else if (best <= CONTRADICTION_BAND) contradictions += 1;
  }
  return matches >= 1 && contradictions === 0;
}

function correctFigure(pack: CasePack): string {
  const ws = pack.quant_module.worked_solution;
  return ws.takeaway_basic ?? Object.values(ws)[0] ?? '';
}

export function judgeMath(
  candidateText: string,
  pack: CasePack,
  mode: Mode,
  priorWrongAttempts: number,
): QuantVerdict {
  if (isMathCorrect(candidateText, pack)) return { verdict: 'correct' };
  if (mode === 'guided' || priorWrongAttempts >= 1) {
    return { verdict: 'reveal', correct_figure: correctFigure(pack) };
  }
  return { verdict: 'probe' };
}
