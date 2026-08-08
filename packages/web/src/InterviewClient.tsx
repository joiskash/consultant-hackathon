import { useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';

const API = import.meta.env.VITE_API_URL ?? '';

type LogEntry = { at: string; kind: string; text: string };

function InterviewSession({ agentId }: { agentId: string }) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const add = (kind: string, text: string) => {
    // Mirror to the browser console so it also shows up in captures.
    // eslint-disable-next-line no-console
    console.log(`[interview] ${kind}: ${text}`);
    setLog((prev) => [...prev, { at: new Date().toLocaleTimeString(), kind, text }]);
  };

  const conversation = useConversation({
    onConnect: () => add('connect', 'websocket connected'),
    onDisconnect: (d: unknown) => add('disconnect', safe(d)),
    onError: (e: unknown) => add('error', safe(e)),
    onStatusChange: (s: unknown) => add('status', safe(s)),
    onModeChange: (m: unknown) => add('mode', safe(m)),
    onDebug: (d: unknown) => add('debug', safe(d)),
    onMessage: (msg: { message?: string; role?: string }) => {
      if (!msg || typeof msg.message !== 'string' || msg.message.length === 0) return;
      add(msg.role === 'agent' ? 'alex' : 'you', msg.message);
    },
  });

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  async function start() {
    setLog([]);
    try {
      add('mic', 'requesting microphone…');
      await navigator.mediaDevices.getUserMedia({ audio: true });
      add('mic', 'granted');
    } catch (err) {
      add('error', `microphone denied/failed: ${safe(err)}`);
      return;
    }
    try {
      add('signed-url', `fetching for ${agentId}…`);
      const res = await fetch(`${API}/api/voice/signed-url?agentId=${agentId}`);
      if (!res.ok) {
        add('error', `signed-url HTTP ${res.status}: ${await res.text()}`);
        return;
      }
      const { signedUrl } = await res.json();
      add('signed-url', signedUrl ? 'got signed url, connecting…' : 'MISSING signedUrl in response');
      if (!signedUrl) return;
      await conversation.startSession({ signedUrl });
      add('session', 'startSession returned');
    } catch (err) {
      add('error', `start failed: ${safe(err)}`);
    }
  }

  const connected = conversation.status === 'connected';

  return (
    <section style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <strong>Status:</strong>
        <span>{conversation.status}</span>
        {connected && <span>· {conversation.isSpeaking ? '🔊 Alex speaking' : '🎙️ listening'}</span>}
      </div>

      {connected ? (
        <button onClick={() => conversation.endSession()}>End interview</button>
      ) : (
        <button onClick={start} disabled={!agentId}>Start interview</button>
      )}
      {!agentId && <p style={{ color: 'crimson' }}>VITE_AGENT_ID_REALISTIC is not set.</p>}

      <div style={{ fontFamily: 'monospace', fontSize: 12, background: '#111', color: '#ddd',
        padding: 12, borderRadius: 6, height: 320, overflowY: 'auto' }}>
        {log.length === 0 && <div style={{ opacity: 0.6 }}>Click “Start interview”. Events + transcript appear here.</div>}
        {log.map((e, i) => (
          <div key={i}>
            <span style={{ opacity: 0.5 }}>{e.at} </span>
            <span style={{ color: color(e.kind) }}>{e.kind}</span>: {e.text}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      <div id="exhibit-screen" />{/* reserved for a future exhibit screen */}
    </section>
  );
}

function color(kind: string): string {
  if (kind === 'error') return '#ff6b6b';
  if (kind === 'alex') return '#4dd0e1';
  if (kind === 'you') return '#a5d6a7';
  if (kind === 'connect' || kind === 'session') return '#ffd54f';
  return '#9e9e9e';
}

function safe(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.message;
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function InterviewClient({ agentId }: { agentId: string }) {
  // useConversation must be rendered inside a ConversationProvider.
  return (
    <ConversationProvider>
      <InterviewSession agentId={agentId} />
    </ConversationProvider>
  );
}
