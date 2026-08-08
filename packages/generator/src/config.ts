import fs from 'fs';
import path from 'path';

export interface CaseTypeRubric {
  priority: number;
  keywords: string[];
}

export interface CaseTriggersConfig {
  search_terms: string[];
  case_types: Record<string, CaseTypeRubric>;
  decision_signals: string[];
}

export interface IndustryEntry {
  name: string;
  naics_prefixes: string[];
  eic_tags: string[];
}

export interface GeneratorConfig {
  pressAllowlist: string[];
  caseTriggers: CaseTriggersConfig;
  industryWhitelist: IndustryEntry[];
}

const CONFIG_DIR = path.resolve(__dirname, '../../../config');

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, file), 'utf-8')) as T;
}

export function loadConfig(): GeneratorConfig {
  return {
    pressAllowlist: readJson<{ domains: string[] }>('press-allowlist.json').domains,
    caseTriggers: readJson<CaseTriggersConfig>('case-triggers.json'),
    industryWhitelist: readJson<{ industries: IndustryEntry[] }>('industry-whitelist.json')
      .industries,
  };
}
