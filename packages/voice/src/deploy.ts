import type { Mode } from '@freshcase/types';
import { buildConversationConfig, AGENT_NAME } from './config';

const MODES: Mode[] = ['guided', 'realistic'];
const nameFor = (mode: Mode) => `${AGENT_NAME} (${mode})`;

export async function deployAgents(client: any, backendUrl: string): Promise<Record<Mode, string>> {
  const { agents } = await client.conversationalAi.agents.list();
  const out = {} as Record<Mode, string>;
  for (const mode of MODES) {
    const name = nameFor(mode);
    const conversationConfig = buildConversationConfig(mode, backendUrl);
    const existing = agents.find((a: any) => a.name === name);
    if (existing) {
      await client.conversationalAi.agents.update(existing.agentId, { conversationConfig });
      out[mode] = existing.agentId;
    } else {
      const created = await client.conversationalAi.agents.create({ name, conversationConfig });
      out[mode] = created.agentId;
    }
  }
  return out;
}

if (require.main === module) {
  (async () => {
    const { ElevenLabsClient } = await import('@elevenlabs/elevenlabs-js');
    const backendUrl = process.env.BACKEND_PUBLIC_URL;
    if (!backendUrl) throw new Error('BACKEND_PUBLIC_URL is required (must be reachable by ElevenLabs)');
    const ids = await deployAgents(new ElevenLabsClient(), backendUrl);
    console.log(JSON.stringify(ids, null, 2));
  })().catch((e) => { console.error(e); process.exit(1); });
}
