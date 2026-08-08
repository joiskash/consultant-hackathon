import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { DebriefHandoff, ScorecardSchema, VoiceMetrics, callClaude } from '@freshcase/types';

// Stage 2 — one structured-output LLM call: transcript + metrics + answer keys
// in, scorecard + spoken debrief out.

const PROMPT_PATH = path.resolve(__dirname, '../../../prompts/score-case.md');

export const RubricOutputSchema = z.object({
  scorecard: ScorecardSchema,
  spoken_debrief: z.string(),
});
export type RubricOutput = z.infer<typeof RubricOutputSchema>;

export function renderTranscript(handoff: DebriefHandoff): string {
  return handoff.transcript
    .map((t) => `[${new Date(t.timestamp).toISOString()}] ${t.speaker.toUpperCase()}: ${t.text}`)
    .join('\n');
}

export function buildScorePrompt(handoff: DebriefHandoff, metrics: VoiceMetrics): string {
  const pack = handoff.case_pack;
  const answerKeys = {
    framework_rubric: pack.framework_rubric,
    worked_solution: pack.quant_module.worked_solution,
    hidden_insight_scoring: pack.hidden_insight.scoring,
    recommendation_key: pack.recommendation_key,
    brainstorm_module: pack.brainstorm_module,
  };
  return fs
    .readFileSync(PROMPT_PATH, 'utf-8')
    .replace('{{METRICS}}', JSON.stringify(metrics, null, 2))
    .replace('{{ANSWER_KEYS}}', JSON.stringify(answerKeys, null, 2))
    .replace('{{MODE}}', handoff.mode)
    .replace('{{TRANSCRIPT}}', renderTranscript(handoff));
}

export async function evaluateRubric(
  handoff: DebriefHandoff,
  metrics: VoiceMetrics,
): Promise<RubricOutput> {
  return callClaude(buildScorePrompt(handoff, metrics), RubricOutputSchema);
}

export async function repairRubric(
  handoff: DebriefHandoff,
  metrics: VoiceMetrics,
  previous: RubricOutput,
  violations: string[],
): Promise<RubricOutput> {
  const prompt = [
    buildScorePrompt(handoff, metrics),
    '',
    'Your previous output failed validation. Fix ONLY what the violations require and return the full corrected JSON object.',
    'Violations:',
    ...violations.map((v) => `- ${v}`),
    '',
    'Previous output:',
    JSON.stringify(previous, null, 2),
  ].join('\n');
  return callClaude(prompt, RubricOutputSchema);
}
