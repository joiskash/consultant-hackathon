import { DebriefHandoff, DebriefResult, Scorecard, VoiceMetrics } from '@freshcase/types';
import { computeMetrics } from './metrics';
import { evaluateRubric, repairRubric, RubricOutput } from './rubric';
import { validateRubricOutput } from './validator';
import { renderScorecard } from './render';

export * from './metrics';
export { buildScorePrompt, renderTranscript, RubricOutputSchema } from './rubric';
export * from './validator';
export { renderScorecard } from './render';

const log = (msg: string) => console.log(`[scorer] ${msg}`);

// Metrics-only fallback: never ship fabricated quotes.
function fallbackResult(metrics: VoiceMetrics): { scorecard: Scorecard; spoken_debrief: string } {
  return {
    scorecard: { dimensions: [] },
    spoken_debrief: [
      'I owe you an apology — the detailed rubric evaluation did not pass our evidence checks, so rather than risk misquoting you, I am giving you the measured facts only.',
      `Here is what the numbers say: you reached ${metrics.insight_layers_reached} insight layer${metrics.insight_layers_reached === 1 ? '' : 's'}, used ${metrics.hints_consumed.count} hint${metrics.hints_consumed.count === 1 ? '' : 's'}, and your math record speaks for itself on the scorecard.`,
      'The written scorecard has the full metrics table — bring it to your next practice session and we will dig into the specifics together.',
    ].join('\n\n'),
  };
}

export interface ScoreDeps {
  evaluate?: typeof evaluateRubric;
  repair?: typeof repairRubric;
}

// Public interface — deterministic metrics first, LLM judgment second, with a
// validation gate and one repair round-trip between them.
export async function score(
  handoff: DebriefHandoff,
  deps: ScoreDeps = {},
): Promise<DebriefResult> {
  const metrics = computeMetrics(handoff);
  const evaluate = deps.evaluate ?? evaluateRubric;
  const repair = deps.repair ?? repairRubric;

  let output: RubricOutput;
  try {
    output = await evaluate(handoff, metrics);
  } catch (err) {
    log(`rubric evaluation failed (${(err as Error).message}) — metrics-only fallback`);
    return { ...fallbackResult(metrics), metrics };
  }

  let violations = validateRubricOutput(output, handoff, metrics);
  if (violations.length > 0) {
    log(`rubric output failed validation (${violations.join(' | ')}) — one repair pass`);
    try {
      output = await repair(handoff, metrics, output, violations);
      violations = validateRubricOutput(output, handoff, metrics);
    } catch (err) {
      violations = [`repair call failed: ${(err as Error).message}`];
    }
    if (violations.length > 0) {
      log(`rubric output REJECTED after repair (${violations.join(' | ')}) — metrics-only fallback`);
      return { ...fallbackResult(metrics), metrics };
    }
  }

  return { scorecard: output.scorecard, spoken_debrief: output.spoken_debrief, metrics };
}

export function scorecardMarkdown(result: DebriefResult, handoff: DebriefHandoff): string {
  const note =
    result.scorecard.dimensions.length === 0
      ? 'Rubric evaluation did not pass evidence validation; this scorecard shows measured metrics only.'
      : undefined;
  return renderScorecard(result.scorecard, result.metrics, handoff, note);
}
