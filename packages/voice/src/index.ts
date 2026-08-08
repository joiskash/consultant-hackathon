import type { Mode } from '@freshcase/types';
import { composeSystemPrompt, FIRST_MESSAGE } from './prompts';

export { composeSystemPrompt, FIRST_MESSAGE } from './prompts';
export { buildServerTools } from './tools';
export type { WebhookTool } from './tools';
export { buildConversationConfig, AGENT_NAME } from './config';

export interface AgentConfig {
  mode: Mode;
  firstMessage: string;
  systemPrompt: string;
}

export function getAgentConfig(mode: Mode): AgentConfig {
  return {
    mode,
    firstMessage: FIRST_MESSAGE,
    systemPrompt: composeSystemPrompt(mode),
  };
}
