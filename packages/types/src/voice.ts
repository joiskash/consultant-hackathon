import { z } from 'zod';

export const PhaseSchema = z.enum([
  'menu', 'prompt', 'clarifying', 'structure', 'quant', 'brainstorm', 'recommendation', 'debrief',
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const ModeSchema = z.enum(['guided', 'realistic']);
export type Mode = z.infer<typeof ModeSchema>;

export const PhaseBriefSchema = z.object({
  phase: PhaseSchema,
  may_say: z.array(z.string()),
  must_withhold: z.array(z.string()),
  coaching_policy: z.string(),
  time_guidance: z.string(),
});
export type PhaseBrief = z.infer<typeof PhaseBriefSchema>;

export const ClarifyingAnswerSchema = z.object({
  answer: z.string().nullable(),
  live_fetched: z.boolean().optional(),
  source_url: z.string().optional(),
  miss: z.boolean().optional(),
});
export type ClarifyingAnswer = z.infer<typeof ClarifyingAnswerSchema>;

export const QuantVerdictSchema = z.discriminatedUnion('verdict', [
  z.object({ verdict: z.literal('correct') }),
  z.object({ verdict: z.literal('probe') }),
  z.object({ verdict: z.literal('reveal'), correct_figure: z.string() }),
]);
export type QuantVerdict = z.infer<typeof QuantVerdictSchema>;
