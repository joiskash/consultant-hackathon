import { z } from 'zod';
import { CasePackSchema } from './casePack';

// M2 — Interview Engine types (docs/specs/M2-engine.md)

export const PhaseSchema = z.enum([
  'menu',
  'prompt',
  'clarifying',
  'structure',
  'quant',
  'brainstorm',
  'recommendation',
  'debrief',
]);

export const ModeSchema = z.enum(['guided', 'realistic']);

export const ClarifyingAnswerSchema = z.object({
  answer: z.string().nullable(),
  miss: z.boolean().optional(),
  live_fetched: z.boolean().optional(),
  source_url: z.string().optional(),
});

export const QuantVerdictSchema = z.object({
  verdict: z.enum(['correct', 'probe', 'reveal']),
  correct_figure: z.string().optional(),
});

// What the interviewer may say for the current phase, what it must withhold,
// the coaching policy for the active mode, and soft time guidance.
export const PhaseBriefSchema = z.object({
  phase: PhaseSchema,
  may_say: z.array(z.string()),
  must_withhold: z.array(z.string()),
  coaching_policy: z.string(),
  time_guidance: z.string(),
});

const eventBase = { timestamp: z.number() };

export const EngineEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...eventBase,
    type: z.literal('phase_transition'),
    from: PhaseSchema,
    to: PhaseSchema,
    reason: z.string().optional(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('ledger_release'),
    entry_index: z.number().int(),
    answer: z.string(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('live_fetch'),
    question_text: z.string(),
    answer: z.string(),
    source_url: z.string(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('ledger_miss'),
    question_text: z.string(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('silence_crossing'),
    phase: PhaseSchema,
    seconds: z.number(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('thinking_time_granted'),
    seconds: z.number(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('hint_given'),
    level: z.number().int(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('math_verdict'),
    verdict: z.enum(['correct', 'probe', 'reveal']),
    correct_figure: z.string().optional(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('candidate_turn'),
    text: z.string(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('interviewer_turn'),
    text: z.string(),
  }),
]);

export const TranscriptTurnSchema = z.object({
  speaker: z.enum(['candidate', 'interviewer']),
  text: z.string(),
  timestamp: z.number(),
});

export const SessionStateSchema = z.object({
  session_id: z.string(),
  mode: ModeSchema,
  phase: PhaseSchema,
  case_pack: CasePackSchema.nullable(),
  events: z.array(EngineEventSchema),
  created_at: z.number(),
});

export const DebriefHandoffSchema = z.object({
  session_id: z.string(),
  mode: ModeSchema,
  case_pack: CasePackSchema,
  transcript: z.array(TranscriptTurnSchema),
  events: z.array(EngineEventSchema),
});

export type Phase = z.infer<typeof PhaseSchema>;
export type Mode = z.infer<typeof ModeSchema>;
export type ClarifyingAnswer = z.infer<typeof ClarifyingAnswerSchema>;
export type QuantVerdict = z.infer<typeof QuantVerdictSchema>;
export type PhaseBrief = z.infer<typeof PhaseBriefSchema>;
export type EngineEvent = z.infer<typeof EngineEventSchema>;
export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;
export type DebriefHandoff = z.infer<typeof DebriefHandoffSchema>;
