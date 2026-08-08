import { z } from 'zod';

export const DifficultySchema = z.object({
  qualitative: z.enum(['easy', 'medium', 'hard']),
  quantitative: z.enum(['easy', 'medium', 'hard']),
});

export const MetaSchema = z.object({
  id: z.string(),
  fixture: z.boolean().optional(),
  attribution: z.string(),
  source_headline: z.string().nullable(),
  source_urls: z.array(z.string()),
  company: z.string(),
  industry: z.string(),
  case_type: z.string(),
  difficulty: DifficultySchema,
});

export const PromptSchema = z.object({
  spoken: z.string(),
  constraint: z.string().optional(),
});

export const ClarifyingLedgerEntrySchema = z.object({
  topics: z.array(z.string()),
  answer: z.string(),
});

export const FrameworkRubricSchema = z.object({
  expected_buckets: z.array(z.string()),
  acceptable_buckets: z.array(z.string()),
  buckets_to_avoid_dwelling_on: z.array(z.string()),
  great_candidate_signals: z.array(z.string()),
});

export const WorkedSolutionSchema = z.record(z.string());

export const FollowupDataDropSchema = z.object({
  trigger: z.string(),
  spoken: z.string(),
  takeaway: z.string(),
});

export const QuantModuleSchema = z.object({
  delivery: z.literal('verbal'),
  setup_spoken: z.string(),
  expected_setup: z.string(),
  worked_solution: WorkedSolutionSchema,
  followup_data_drop: FollowupDataDropSchema,
});

export const KickerSchema = z.object({
  trigger: z.string(),
  spoken: z.string(),
  insight: z.string(),
});

export const HiddenInsightSchema = z.object({
  pattern: z.string(),
  layers: z.array(z.string()),
  kicker: KickerSchema,
  scoring: z.string(),
});

export const BrainstormModuleSchema = z.object({
  prompt_spoken: z.string(),
  sample_answers: z.array(z.string()),
  note: z.string(),
});

export const RecommendationKeySchema = z.object({
  expected_recommendation: z.string(),
  supporting_logic: z.string(),
  risks: z.array(z.string()),
  mitigations: z.array(z.string()),
  next_steps: z.array(z.string()),
});

export const CasePackSchema = z.object({
  meta: MetaSchema,
  prompt: PromptSchema,
  clarifying_ledger: z.array(ClarifyingLedgerEntrySchema),
  ledger_miss_policy: z.string(),
  framework_rubric: FrameworkRubricSchema,
  quant_module: QuantModuleSchema,
  hidden_insight: HiddenInsightSchema,
  brainstorm_module: BrainstormModuleSchema,
  recommendation_key: RecommendationKeySchema,
});

export type CasePack = z.infer<typeof CasePackSchema>;
export type Meta = z.infer<typeof MetaSchema>;
export type Prompt = z.infer<typeof PromptSchema>;
export type ClarifyingLedgerEntry = z.infer<typeof ClarifyingLedgerEntrySchema>;
export type FrameworkRubric = z.infer<typeof FrameworkRubricSchema>;
export type QuantModule = z.infer<typeof QuantModuleSchema>;
export type FollowupDataDrop = z.infer<typeof FollowupDataDropSchema>;
export type HiddenInsight = z.infer<typeof HiddenInsightSchema>;
export type Kicker = z.infer<typeof KickerSchema>;
export type BrainstormModule = z.infer<typeof BrainstormModuleSchema>;
export type RecommendationKey = z.infer<typeof RecommendationKeySchema>;
