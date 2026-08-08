import fs from 'fs';
import path from 'path';
import type { Mode } from '@freshcase/types';
import { composeSystemPrompt, FIRST_MESSAGE } from './prompts';
import { buildServerTools } from './tools';

export const AGENT_NAME = 'FreshCase — Alex';
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '../agent-config.json'), 'utf-8'));

export function buildConversationConfig(mode: Mode, backendUrl: string) {
  return {
    agent: {
      first_message: FIRST_MESSAGE,
      language: base.language,
      prompt: {
        prompt: composeSystemPrompt(mode),
        llm: 'gemini-2.0-flash',
        temperature: mode === 'guided' ? 0.5 : 0.3,
        tools: buildServerTools(backendUrl),
        built_in_tools: { end_call: {} },
      },
    },
    tts: { voice_id: base.voice_id, model_id: base.tts_model_id },
    turn: base.turn,
    asr: base.asr,
  };
}
