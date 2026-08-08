import { DebriefHandoff, VoiceMetrics } from '@freshcase/types';
import { RubricOutput } from './rubric';

// Validator between the LLM and the output — mirrors M1's coherence guard.
// Never ship fabricated quotes: every quote must actually appear in the
// transcript (fuzzy >= 0.9 for ASR punctuation), every cited metric must match
// Stage 1's values, all five dimensions present, every needs_work gap drilled.

export const DIMENSIONS = ['Structure', 'Quantitative', 'Insight & Drive', 'Closing', 'Communication'];

const METRIC_CITATION = /^metric:\s*([a-z_.]+)\s*=\s*(.+)$/i;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Token-window similarity: 1.0 for exact substring; otherwise the best Dice
// coefficient over same-length windows of the transcript.
export function quoteSimilarity(quote: string, transcriptText: string): number {
  const q = normalize(quote);
  const t = normalize(transcriptText);
  if (!q) return 0;
  if (t.includes(q)) return 1;
  const qTokens = q.split(' ');
  const tTokens = t.split(' ');
  if (qTokens.length > tTokens.length) return 0;
  let best = 0;
  for (let i = 0; i + qTokens.length <= tTokens.length; i++) {
    const window = tTokens.slice(i, i + qTokens.length);
    const overlap = qTokens.filter((tok, j) => window[j] === tok).length;
    best = Math.max(best, (2 * overlap) / (qTokens.length + window.length));
  }
  return best;
}

function lookupMetric(metrics: VoiceMetrics, name: string): unknown {
  return name
    .split('.')
    .reduce<unknown>((obj, key) => (obj as Record<string, unknown> | undefined)?.[key], metrics);
}

function metricMatches(cited: string, actual: unknown): boolean {
  if (actual === undefined || actual === null) return false;
  const citedNum = Number(cited.replace(/[^\d.-]/g, ''));
  if (typeof actual === 'number' && !Number.isNaN(citedNum)) {
    return Math.abs(actual - citedNum) <= Math.max(1, Math.abs(actual) * 0.01);
  }
  return normalize(String(cited)).includes(normalize(JSON.stringify(actual))) ||
    normalize(JSON.stringify(actual)).includes(normalize(cited));
}

export function validateRubricOutput(
  output: RubricOutput,
  handoff: DebriefHandoff,
  metrics: VoiceMetrics,
): string[] {
  const violations: string[] = [];
  const transcriptText = handoff.transcript.map((t) => t.text).join('\n');

  // All five dimensions, exactly.
  const names = output.scorecard.dimensions.map((d) => d.name);
  for (const dim of DIMENSIONS) {
    if (!names.includes(dim)) violations.push(`missing dimension "${dim}"`);
  }

  for (const dim of output.scorecard.dimensions) {
    for (const finding of dim.findings) {
      const evidence = finding.evidence.trim();
      if (!evidence) {
        violations.push(`${dim.name}: finding "${finding.item}" has no evidence`);
        continue;
      }
      const metricCite = evidence.match(METRIC_CITATION);
      if (metricCite) {
        const actual = lookupMetric(metrics, metricCite[1]);
        if (!metricMatches(metricCite[2], actual)) {
          violations.push(
            `${dim.name}: cited metric "${metricCite[1]} = ${metricCite[2]}" contradicts the computed value ${JSON.stringify(actual)}`,
          );
        }
      } else if (quoteSimilarity(evidence, transcriptText) < 0.9) {
        violations.push(
          `${dim.name}: evidence quote "${evidence.slice(0, 80)}" does not appear in the transcript`,
        );
      }
      if (
        dim.band === 'needs_work' &&
        finding.answer !== 'yes' &&
        !(finding.drill ?? '').trim()
      ) {
        violations.push(`${dim.name}: needs_work finding "${finding.item}" has no drill`);
      }
    }
  }

  violations.push(...lintSpokenDebrief(output.spoken_debrief));
  return violations;
}

export function lintSpokenDebrief(text: string): string[] {
  const violations: string[] = [];
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 200) violations.push(`spoken_debrief is ${words} words (hard cap 200)`);
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length !== 3) {
    violations.push(
      `spoken_debrief must be exactly 3 findings as 3 paragraphs, found ${paragraphs.length}`,
    );
  }
  if (/[#*_|]|\]\(|https?:\/\//.test(text)) {
    violations.push('spoken_debrief contains markdown syntax or a URL');
  }
  return violations;
}
