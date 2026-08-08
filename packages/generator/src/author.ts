import fs from 'fs';
import path from 'path';
import { CasePack, CasePackSchema, StoryFacts, callClaude } from '@freshcase/types';

// Stage 4 — Case authoring: one structured-output LLM call per story.

const PROMPT_PATH = path.resolve(__dirname, '../../../prompts/author-case.md');

export function buildAuthorPrompt(
  facts: StoryFacts,
  caseType: string,
  caseId: string,
  sourceUrl: string,
): string {
  const template = fs.readFileSync(PROMPT_PATH, 'utf-8');
  // Cap article length so one long feature piece can't blow the context window.
  const cappedFacts = { ...facts, article_md: facts.article_md.slice(0, 12000) };
  return template
    .replace('{{CASE_TYPE}}', caseType)
    .replace('{{STORY_FACTS}}', JSON.stringify(cappedFacts, null, 2))
    .replace('{{CASE_ID}}', caseId)
    .replace('{{SOURCE_URL}}', sourceUrl);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function authorCase(
  facts: StoryFacts,
  caseType: string,
  sourceUrl: string,
): Promise<CasePack> {
  const date = new Date().toISOString().slice(0, 10);
  const caseId = `gen-${slugify(facts.company)}-${date}`;
  const prompt = buildAuthorPrompt(facts, caseType, caseId, sourceUrl);
  return callClaude(prompt, CasePackSchema);
}
