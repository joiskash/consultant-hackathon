import { useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type TranscriptEntry = { role: 'agent' | 'candidate'; text: string };

function InterviewSession({ agentId }: { agentId: string }) {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const conversation = useConversation({
    // The installed @elevenlabs/react@1.12.0 exposes a single `onMessage`
    // callback (there is no separate `onUserTranscript`); agent vs candidate
    // turns are distinguished by the `role` field on the payload.
    onMessage: (msg) => {
      if (!msg || typeof msg.message !== 'string' || msg.message.length === 0) {
        return;
      }
      const role: TranscriptEntry['role'] =
        msg.role === 'agent' ? 'agent' : 'candidate';
      setTranscript((prev) => [...prev, { role, text: msg.message }]);
    },
  });

  async function start() {
    // Request mic permission up front so the session opens cleanly.
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const { signedUrl } = await fetch(
      `${API}/api/voice/signed-url?agentId=${agentId}`,
    ).then((r) => r.json());
    await conversation.startSession({ signedUrl });
  }

  const connected = conversation.status === 'connected';

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <p>Status: {conversation.status}</p>
      {connected ? (
        <button onClick={() => conversation.endSession()}>End interview</button>
      ) : (
        <button onClick={start} disabled={!agentId}>
          Start interview
        </button>
      )}
      {!agentId && (
        <p className="hint">VITE_AGENT_ID_REALISTIC is not set.</p>
      )}
      <ul>
        {transcript.map((entry, i) => (
          <li key={i}>
            <strong>{entry.role}:</strong> {entry.text}
          </li>
        ))}
      </ul>
      <div id="exhibit-screen" />{/* reserved for a future exhibit screen */}
    </section>
  );
}

export function InterviewClient({ agentId }: { agentId: string }) {
  // useConversation must be rendered inside a ConversationProvider.
  return (
    <ConversationProvider>
      <InterviewSession agentId={agentId} />
    </ConversationProvider>
  );
}
