import { z } from 'zod';
import { PhaseSchema } from './engine';

// M4 — Scorer & Debrief types (docs/specs/M4-scorer.md)

// Deterministic metrics computed from the event log before any LLM call.
export const VoiceMetricsSchema = z.object({
  time_to_framework_seconds: z.number(),
  unannounced_silence: z.record(
    PhaseSchema,
    z.object({
      count: z.number().int(),
      total_duration_seconds: z.number(),
    }),
  ),
  announced_thinking_time_seconds: z.number(),
  talk_time_ratio: z.number(),
  calc_elapsed_seconds: z.number(),
  hints_consumed: z.object({
    count: z.number().int(),
    max_level: z.number().int(),
  }),
  insight_layers_reached: z.number().int(),
  math_record: z.array(
    z.object({
      verdict: z.enum(['correct', 'probe', 'reveal']),
      recovered: z.boolean().optional(),
    }),
  ),
});

export const FindingSchema = z.object({
  item: z.string(),
  answer: z.enum(['yes', 'no', 'partial']),
  evidence: z.string(),
  drill: z.string().optional(),
});

export const ScorecardDimensionSchema = z.object({
  name: z.string(),
  band: z.enum(['strength', 'on_track', 'needs_work']),
  findings: z.array(FindingSchema),
});

export const ScorecardSchema = z.object({
  dimensions: z.array(ScorecardDimensionSchema),
});

export const DebriefResultSchema = z.object({
  scorecard: ScorecardSchema,
  spoken_debrief: z.string(),
  metrics: VoiceMetricsSchema,
});

export type VoiceMetrics = z.infer<typeof VoiceMetricsSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type ScorecardDimension = z.infer<typeof ScorecardDimensionSchema>;
export type Scorecard = z.infer<typeof ScorecardSchema>;
export type DebriefResult = z.infer<typeof DebriefResultSchema>;
