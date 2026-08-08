import { DebriefHandoff, Scorecard, VoiceMetrics } from '@freshcase/types';

// Written scorecard, rendered to markdown mirroring the team's human
// feedback-form layout: same section order, same guidance-question phrasing.

const BAND_LABEL: Record<string, string> = {
  strength: 'Strength',
  on_track: 'On track',
  needs_work: 'Needs work',
};

function metricsTable(metrics: VoiceMetrics): string {
  const silence = Object.entries(metrics.unannounced_silence)
    .map(([phase, s]) => `${phase}: ${s.count}x / ${s.total_duration_seconds}s`)
    .join('; ');
  const math = metrics.math_record
    .map((m) => (m.recovered ? `${m.verdict} (recovered)` : m.verdict))
    .join(' → ');
  return [
    '| Metric | Value |',
    '|---|---|',
    `| Time to framework | ${Math.round(metrics.time_to_framework_seconds)}s |`,
    `| Unannounced silence | ${silence || 'none'} |`,
    `| Announced thinking time | ${metrics.announced_thinking_time_seconds}s (thinking time is good — never penalized) |`,
    `| Talk-time ratio (candidate share) | ${(metrics.talk_time_ratio * 100).toFixed(0)}% |`,
    `| Calc elapsed | ${Math.round(metrics.calc_elapsed_seconds)}s |`,
    `| Hints consumed | ${metrics.hints_consumed.count} (max level ${metrics.hints_consumed.max_level}) |`,
    `| Insight layers reached | ${metrics.insight_layers_reached} |`,
    `| Math record | ${math || 'no quant attempted'} |`,
  ].join('\n');
}

export function renderScorecard(
  scorecard: Scorecard,
  metrics: VoiceMetrics,
  handoff: DebriefHandoff,
  note?: string,
): string {
  const meta = handoff.case_pack.meta;
  const durationMin =
    handoff.events.length > 0
      ? Math.round(
          (handoff.events[handoff.events.length - 1].timestamp - handoff.events[0].timestamp) /
            60000,
        )
      : 0;

  const lines: string[] = [
    `# Case Scorecard — ${meta.company}`,
    '',
    meta.source_headline
      ? `Generated from news: "${meta.source_headline}"`
      : `Fixture case (${meta.id})`,
    `Mode: ${handoff.mode} · Duration: ~${durationMin} min · Case type: ${meta.case_type}`,
    '',
  ];
  if (note) lines.push(`> ${note}`, '');

  for (const dim of scorecard.dimensions) {
    lines.push(`## ${dim.name} — ${BAND_LABEL[dim.band] ?? dim.band}`, '');
    for (const f of dim.findings) {
      lines.push(`- **${f.item}** — ${f.answer}`, `  - Evidence: ${f.evidence}`);
      if (f.drill) lines.push(`  - Drill: ${f.drill}`);
    }
    lines.push('');
  }

  lines.push('## Measured metrics', '', metricsTable(metrics), '');
  lines.push(
    '---',
    '*Figures in this exercise were synthesized for practice — do not cite them as reported financials.*',
  );
  return lines.join('\n');
}
