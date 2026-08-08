import fs from 'fs';
import path from 'path';
import type { Mode } from '@freshcase/types';
import { composeSystemPrompt, FIRST_MESSAGE } from './prompts';
import { buildServerTools } from './tools';

export const AGENT_NAME = 'FreshCase — Alex';
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '../agent-config.json'), 'utf-8'));

// NOTE: the @elevenlabs/elevenlabs-js SDK validates conversationConfig with camelCase keys
// and silently DROPS unknown snake_case keys (which then default server-side — e.g. an empty
// first message and the default voice). Every multi-word key here MUST be camelCase.
export function buildConversationConfig(mode: Mode, backendUrl: string) {
  return {
    agent: {
      firstMessage: FIRST_MESSAGE,
      language: base.language,
      // Keep general barge-in (spec feature) but protect the greeting, which is
      // the most common false-interruption when the user is on speakers (echo).
      disableFirstMessageInterruptions: true,
      prompt: {
        prompt: composeSystemPrompt(mode),
        llm: 'gemini-2.0-flash',
        temperature: mode === 'guided' ? 0.5 : 0.3,
        tools: buildServerTools(backendUrl),
      },
    },
    tts: { voiceId: base.voice_id, modelId: base.tts_model_id },
    turn: {
      turnTimeout: base.turn.turn_timeout,
      turnEagerness: base.turn.turn_eagerness,
      silenceEndCallTimeout: base.turn.silence_end_call_timeout,
    },
    asr: { quality: base.asr.quality, keywords: base.asr.keywords },
  };
}
