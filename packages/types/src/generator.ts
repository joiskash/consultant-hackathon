import { z } from 'zod';

// M1 — Case Generator types (docs/specs/M1-generator.md)

export const CaseMenuItemSchema = z.object({
  id: z.string(),
  spoken_teaser: z.string(),
  case_type: z.string(),
  company: z.string(),
  source_published_hint: z.string().nullable(),
});

export const CaseMenuSchema = z.object({
  items: z.array(CaseMenuItemSchema),
  degraded: z.boolean().optional(),
});

export const StoryFactsSchema = z.object({
  company: z.string(),
  domain: z.string(),
  headline: z.string(),
  article_md: z.string(),
  published_at: z.string().optional(),
  anchor_facts: z.record(z.unknown()),
});

// Stage-2 case-ability filter: 0–5, one point per criterion.
export const CaseabilityScoreSchema = z.object({
  headline: z.string(),
  score: z.number().int().min(0).max(5),
  criteria: z.object({
    single_company_protagonist: z.boolean(),
    decision_or_diagnosis: z.boolean(),
    preferred_case_type: z.boolean(),
    high_relevance: z.boolean(),
    whitelisted_industry: z.boolean(),
  }),
});

export type CaseMenuItem = z.infer<typeof CaseMenuItemSchema>;
export type CaseMenu = z.infer<typeof CaseMenuSchema>;
export type StoryFacts = z.infer<typeof StoryFactsSchema>;
export type CaseabilityScore = z.infer<typeof CaseabilityScoreSchema>;
