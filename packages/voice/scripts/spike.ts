// packages/voice/scripts/spike.ts
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

async function main() {
  const client = new ElevenLabsClient(); // reads ELEVENLABS_API_KEY

  // (a) Config schema acceptance + deploy path: create a throwaway agent.
  const agent = await client.conversationalAi.agents.create({
    name: 'FreshCase SPIKE (delete me)',
    conversationConfig: {
      agent: { first_message: 'Spike.', language: 'en',
        prompt: { prompt: 'You are a spike.', llm: 'gemini-2.0-flash' } },
      tts: { voice_id: 'JBFqnCBsd6RMkjVDRZzb', model_id: 'eleven_flash_v2_5' },
      turn: { turn_timeout: 7, silence_end_call_timeout: -1 }, // (b) silence-timer control surface
    },
  });
  console.log('agent_id', agent.agentId);

  // (c) Session start path: signed URL.
  const signed = await client.conversationalAi.conversations.getSignedUrl({ agentId: agent.agentId });
  console.log('signed_url_ok', Boolean(signed.signedUrl));

  // (c) Transcript event availability: inspect the conversations list/detail shape.
  const convos = await client.conversationalAi.conversations.list({ agentId: agent.agentId });
  console.log('conversations_endpoint_ok', Array.isArray(convos.conversations));

  await client.conversationalAi.agents.delete(agent.agentId); // clean up
  console.log('cleanup_ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
