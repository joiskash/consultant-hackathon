import { CasePack, CasePackSchema, callClaude } from '@freshcase/types';

// Stage 5 — Coherence guard: programmatic checks, no LLM except the single
// repair pass in repairPack.

export interface NumberSeries {
  label: string;
  values: number[];
}

const CONNECTORS = new Set([',', 'then', 'to', 'and', '->', '→', '/']);
const NUMBER_RE = /^\$?\d[\d,]*(?:\.\d+)?$/;

function isYear(n: number): boolean {
  return Number.isInteger(n) && n >= 1900 && n <= 2099;
}

// Parse scripted speech (or worked-solution text) into labelled runs of >= 3
// numbers joined by natural connectors: "Revenue: 360, 378, then 397 million".
export function parseNumberSeries(text: string): NumberSeries[] {
  const tokens = text
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.;:!?]+|[.;:!?]+$/g, ''))
    .filter(Boolean);

  const series: NumberSeries[] = [];
  let run: number[] = [];
  let labelWords: string[] = [];
  let pendingConnector = false;

  const flush = () => {
    const values = run.filter((v) => !isYear(v));
    if (values.length >= 3) {
      series.push({ label: labelWords.slice(-5).join(' ').toLowerCase(), values });
    }
    run = [];
    pendingConnector = false;
  };

  for (const raw of tokens) {
    const stripped = raw.replace(/,+$/g, '');
    const endsWithComma = raw.endsWith(',');
    if (NUMBER_RE.test(stripped)) {
      const value = Number(stripped.replace(/[$,]/g, ''));
      if (run.length === 0 || pendingConnector || endsWithComma) {
        run.push(value);
      } else {
        flush();
        run.push(value);
      }
      pendingConnector = endsWithComma;
    } else if (run.length > 0 && CONNECTORS.has(stripped.toLowerCase())) {
      pendingConnector = true;
    } else if (
      run.length > 0 &&
      /^(million|billion|thousand|dollars?|dirhams?|percent|%)$/i.test(stripped)
    ) {
      pendingConnector = endsWithComma || pendingConnector;
    } else {
      flush();
      labelWords.push(stripped);
      if (labelWords.length > 8) labelWords = labelWords.slice(-8);
    }
  }
  flush();
  return series;
}

function meanGrowth(values: number[]): number | null {
  if (values.length < 2 || values.some((v) => v <= 0)) return null;
  const growths: number[] = [];
  for (let i = 1; i < values.length; i++) growths.push(values[i] / values[i - 1] - 1);
  return growths.reduce((a, b) => a + b, 0) / growths.length;
}

const ANOMALY_THRESHOLD = 0.075; // 7.5 percentage points off the median growth

export function findAnomalousDrivers(series: NumberSeries[]): string[] {
  const growths = series
    .map((s) => ({ label: s.label, growth: meanGrowth(s.values) }))
    .filter((g): g is { label: string; growth: number } => g.growth !== null);
  if (growths.length < 2) return [];
  const sorted = growths.map((g) => g.growth).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return growths.filter((g) => Math.abs(g.growth - median) > ANOMALY_THRESHOLD).map((g) => g.label);
}

// Derived profit series: largest-magnitude line minus the sum of the others.
function derivedProfitSeries(series: NumberSeries[]): number[] | null {
  if (series.length < 2) return null;
  const periods = series[0].values.length;
  if (series.some((s) => s.values.length !== periods)) return null;
  const byMagnitude = [...series].sort((a, b) => b.values[0] - a.values[0]);
  const [top, ...rest] = byMagnitude;
  return top.values.map((v, i) => v - rest.reduce((sum, s) => sum + s.values[i], 0));
}

function seriesMatches(a: number[], b: number[], tolerance = 0.6): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
}

const SPOKEN_LINT_PATTERNS: [RegExp, string][] = [
  [/https?:\/\//, 'contains a URL'],
  [/\|.*\|/, 'contains a markdown table'],
  [/(^|\n)#{1,6}\s/, 'contains a markdown heading'],
  [/\*\*|__/, 'contains markdown emphasis'],
  [/\]\(/, 'contains a markdown link'],
  [/(^|\n)\s*[-*]\s/, 'contains markdown bullets'],
];

function lintSpoken(field: string, text: string): string[] {
  return SPOKEN_LINT_PATTERNS.filter(([re]) => re.test(text)).map(
    ([, msg]) => `speech lint: ${field} ${msg}`,
  );
}

export function checkCoherence(pack: CasePack): string[] {
  const violations: string[] = [];

  // --- Quant arithmetic + exactly one anomalous driver ---
  const spokenSeries = parseNumberSeries(pack.quant_module.setup_spoken);
  if (spokenSeries.length < 2) {
    violations.push(
      'quant: setup_spoken must dictate each line item as "<Name>: A, B, then C million" — ' +
        'one line item at a time with exactly three consecutive numbers, never transposed by ' +
        'year or interleaved with percentages; could not parse at least two such series',
    );
  } else {
    const anomalies = findAnomalousDrivers(spokenSeries);
    if (anomalies.length !== 1) {
      violations.push(
        `quant: expected exactly one anomalous line item in setup_spoken (all others growing at a similar steady rate), found ${anomalies.length}` +
          (anomalies.length > 0 ? ` (${anomalies.join('; ')})` : '') +
          ' — rebuild the numbers so exactly one line item deviates sharply from the shared trend',
      );
    }

    // Every numeric run cited in worked_solution must be re-derivable: either a
    // spoken series (setup or follow-up drop) or the computed profit line.
    const pool = [
      ...spokenSeries.map((s) => s.values),
      ...parseNumberSeries(pack.quant_module.followup_data_drop.spoken).map((s) => s.values),
    ];
    const profit = derivedProfitSeries(spokenSeries);
    if (profit) pool.push(profit);
    for (const [key, value] of Object.entries(pack.quant_module.worked_solution)) {
      for (const run of parseNumberSeries(value)) {
        if (!pool.some((candidate) => seriesMatches(run.values, candidate))) {
          violations.push(
            `quant: worked_solution.${key} cites series [${run.values.join(', ')}] that does not match the spoken data or a derived total`,
          );
        }
      }
    }
  }

  // --- Ledger consistency (structural) ---
  if (pack.clarifying_ledger.length < 5 || pack.clarifying_ledger.length > 8) {
    violations.push(
      `ledger: expected 5-8 entries, found ${pack.clarifying_ledger.length}`,
    );
  }
  pack.clarifying_ledger.forEach((entry, i) => {
    if (entry.topics.length === 0) violations.push(`ledger: entry ${i} has no topics`);
    if (!entry.answer.trim()) violations.push(`ledger: entry ${i} has an empty answer`);
  });

  // --- Completeness ---
  const atLeast = (arr: unknown[], n: number, field: string) => {
    if (arr.length < n) violations.push(`completeness: ${field} has ${arr.length} items, needs >= ${n}`);
  };
  atLeast(pack.recommendation_key.risks, 2, 'recommendation_key.risks');
  atLeast(pack.recommendation_key.mitigations, 2, 'recommendation_key.mitigations');
  atLeast(pack.recommendation_key.next_steps, 2, 'recommendation_key.next_steps');
  atLeast(pack.hidden_insight.layers, 2, 'hidden_insight.layers');
  atLeast(pack.framework_rubric.expected_buckets, 1, 'framework_rubric.expected_buckets');
  atLeast(pack.brainstorm_module.sample_answers, 3, 'brainstorm_module.sample_answers');
  if (Object.keys(pack.quant_module.worked_solution).length === 0) {
    violations.push('completeness: quant_module.worked_solution is empty');
  }
  const nonEmpty: [string, string][] = [
    ['prompt.spoken', pack.prompt.spoken],
    ['quant_module.setup_spoken', pack.quant_module.setup_spoken],
    ['quant_module.expected_setup', pack.quant_module.expected_setup],
    ['hidden_insight.kicker.spoken', pack.hidden_insight.kicker.spoken],
    ['hidden_insight.scoring', pack.hidden_insight.scoring],
    ['brainstorm_module.prompt_spoken', pack.brainstorm_module.prompt_spoken],
    ['recommendation_key.expected_recommendation', pack.recommendation_key.expected_recommendation],
    ['recommendation_key.supporting_logic', pack.recommendation_key.supporting_logic],
  ];
  for (const [field, value] of nonEmpty) {
    if (!value.trim()) violations.push(`completeness: ${field} is empty`);
  }

  // --- Speech lint ---
  const spokenFields: [string, string][] = [
    ['prompt.spoken', pack.prompt.spoken],
    ['quant_module.setup_spoken', pack.quant_module.setup_spoken],
    ['quant_module.followup_data_drop.spoken', pack.quant_module.followup_data_drop.spoken],
    ['hidden_insight.kicker.spoken', pack.hidden_insight.kicker.spoken],
    ['brainstorm_module.prompt_spoken', pack.brainstorm_module.prompt_spoken],
  ];
  for (const [field, value] of spokenFields) {
    violations.push(...lintSpoken(field, value));
  }

  return violations;
}

// One repair round-trip maximum; caller drops the pack if it still fails.
export async function repairPack(pack: CasePack, violations: string[]): Promise<CasePack> {
  const prompt = [
    'You previously authored this case pack JSON, but it failed programmatic coherence checks.',
    'Fix ONLY what the violations require, preserving everything else. Return the full corrected CasePack JSON object and nothing else.',
    '',
    'Violations:',
    ...violations.map((v) => `- ${v}`),
    '',
    'Case pack:',
    JSON.stringify(pack, null, 2),
  ].join('\n');
  return callClaude(prompt, CasePackSchema);
}
