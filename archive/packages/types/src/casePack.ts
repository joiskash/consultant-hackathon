import { z } from 'zod';

const DifficultySchema = z.object({
  qualitative: z.string(),
  quantitative: z.string(),
});

const MetaSchema = z.object({
  id: z.string().optional(),
  fixture: z.boolean().optional(),
  attribution: z.string(),
  source_headline: z.string().nullable(),
  source_urls: z.array(z.string()),
  company: z.string(),
  industry: z.string(),
  case_type: z.string(),
  difficulty: DifficultySchema,
});

const PromptSchema = z.object({
  spoken: z.string(),
  constraint: z.string().optional(),
});

const ClarifyingLedgerEntrySchema = z.object({
  topics: z.array(z.string()),
  answer: z.string(),
});

const FrameworkRubricSchema = z.object({
  expected_buckets: z.array(z.string()),
  acceptable_buckets: z.array(z.string()),
  buckets_to_avoid_dwelling_on: z.array(z.string()),
  great_candidate_signals: z.array(z.string()),
});

const WorkedSolutionSchema = z.record(z.string());

const FollowupDataDropSchema = z.object({
  trigger: z.string(),
  spoken: z.string(),
  takeaway: z.string(),
});

const QuantModuleSchema = z.object({
  delivery: z.literal('verbal'),
  setup_spoken: z.string(),
  expected_setup: z.string(),
  worked_solution: WorkedSolutionSchema,
  followup_data_drop: FollowupDataDropSchema,
});

const KickerSchema = z.object({
  trigger: z.string(),
  spoken: z.string(),
  insight: z.string(),
});

const HiddenInsightSchema = z.object({
  pattern: z.string(),
  layers: z.array(z.string()),
  kicker: KickerSchema,
  scoring: z.string(),
});

const BrainstormModuleSchema = z.object({
  prompt_spoken: z.string(),
  sample_answers: z.array(z.string()),
  note: z.string(),
});

const RecommendationKeySchema = z.object({
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
