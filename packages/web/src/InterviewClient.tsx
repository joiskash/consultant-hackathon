import { useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';

const API = import.meta.env.VITE_API_URL ?? '';

type Turn = { role: 'alex' | 'you'; text: string };
type Event = { at: string; kind: string; text: string };

export interface CaseItem {
  id: string;
  company?: string;
  case_type?: string;
  spoken_teaser?: string;
}

function InterviewSession({ agentId, cases }: { agentId: string; cases: CaseItem[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  const logEvent = (kind: string, text: string) => {
    // eslint-disable-next-line no-console
    console.log(`[interview] ${kind}: ${text}`);
    setEvents((p) => [...p, { at: new Date().toLocaleTimeString(), kind, text }]);
  };

  const conversation = useConversation({
    onConnect: () => logEvent('connect', 'websocket connected'),
    onDisconnect: (d: unknown) => logEvent('disconnect', safe(d)),
    onError: (e: unknown) => logEvent('error', safe(e)),
    onStatusChange: (s: unknown) => logEvent('status', safe(s)),
    onModeChange: (m: unknown) => logEvent('mode', safe(m)),
    onDebug: (d: unknown) => logEvent('debug', safe(d)),
    onMessage: (msg: { message?: string; role?: string }) => {
      if (!msg || typeof msg.message !== 'string' || !msg.message.length) return;
      setTurns((p) => [...p, { role: msg.role === 'agent' ? 'alex' : 'you', text: msg.message! }]);
    },
  });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns]);

  async function start() {
    setTurns([]); setEvents([]);
    try {
      logEvent('mic', 'requesting microphone…');
      await navigator.mediaDevices.getUserMedia({ audio: true });
      logEvent('mic', 'granted');
    } catch (err) { logEvent('error', `microphone denied/failed: ${safe(err)}`); return; }
    try {
      logEvent('signed-url', `fetching for ${agentId}…`);
      const res = await fetch(`${API}/api/voice/signed-url?agentId=${agentId}`);
      if (!res.ok) { logEvent('error', `signed-url HTTP ${res.status}`); return; }
      const { signedUrl } = await res.json();
      if (!signedUrl) { logEvent('error', 'missing signedUrl'); return; }
      logEvent('signed-url', 'connecting…');
      await conversation.startSession({ signedUrl });
    } catch (err) { logEvent('error', `start failed: ${safe(err)}`); }
  }

  const status = conversation.status;
  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const pillClass = connected ? 'pill--connected' : connecting ? 'pill--connecting'
    : status === 'error' ? 'pill--error' : '';
  const speaking = connected && conversation.isSpeaking;

  return (
    <div className="panel">
      {!connected && !connecting ? (
        <>
          <p className="section-title">Today’s live cases</p>
          <div className="cases">
            {cases.length === 0 && <p className="empty">Loading fresh cases from this week’s headlines…</p>}
            {cases.map((c) => (
              <div className="case-card" key={c.id}>
                <div className="case-badge">{(c.company ?? c.id).charAt(0)}</div>
                <div>
                  <div className="case-company">{c.company ?? c.id}</div>
                  {c.spoken_teaser && <div className="case-meta">{c.spoken_teaser}</div>}
                  {c.case_type && <span className="case-type">{c.case_type}</span>}
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn--start" onClick={start} disabled={!agentId}>
            Start voice interview
          </button>
          {!agentId && <p className="hint">VITE_AGENT_ID_REALISTIC is not set.</p>}
        </>
      ) : (
        <>
          <div className="statusbar">
            <span className={`pill ${pillClass}`}>
              <span className="dot" />
              {connecting ? 'Connecting…' : 'Connected'}
            </span>
            <span className="live">
              <span className={`wave ${speaking ? 'speaking' : ''}`}><span /><span /><span /><span /></span>
              {speaking ? 'Alex speaking' : 'Listening'}
            </span>
          </div>

          <div className="transcript">
            {turns.length === 0 && <p className="empty">Say hello — Alex will greet you.</p>}
            {turns.map((t, i) => (
              <div className={`bubble bubble--${t.role}`} key={i}>
                <span className="who">{t.role === 'alex' ? 'Alex' : 'You'}</span>
                {t.text}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <button className="btn btn--end" onClick={() => conversation.endSession()}>
            End interview
          </button>
        </>
      )}

      <details className="diagnostics">
        <summary>Diagnostics ({events.length})</summary>
        <div className="diag-log">
          {events.length === 0 && <div className="diag-line">No events yet.</div>}
          {events.map((e, i) => (
            <div className="diag-line" key={i}>
              <span className="t">{e.at} </span>
              <span className={`k-${e.kind}`}>{e.kind}</span>: {e.text}
            </div>
          ))}
        </div>
      </details>

      <div id="exhibit-screen" />{/* reserved for a future exhibit screen */}
    </div>
  );
}

function safe(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.message;
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function InterviewClient({ agentId, cases = [] }: { agentId: string; cases?: CaseItem[] }) {
  return (
    <ConversationProvider>
      <InterviewSession agentId={agentId} cases={cases} />
    </ConversationProvider>
  );
}
