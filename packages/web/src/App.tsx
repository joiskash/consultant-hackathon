import { useEffect, useState } from 'react';
import { InterviewClient, CaseItem } from './InterviewClient';

function App() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const agentId = import.meta.env.VITE_AGENT_ID_REALISTIC ?? '';

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL ?? '';
    fetch(`${apiUrl}/api/cases`)
      .then((res) => res.json())
      .then((data) => {
        // Menu shape is { cases: { items: [...] } } (M2) or { cases: [...] }.
        const raw = data.cases;
        setCases(Array.isArray(raw) ? raw : (raw?.items ?? []));
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1 className="brand">FreshCase</h1>
        <p className="tagline">Voice-first case interview practice — live cases from today’s headlines.</p>
      </header>
      {error && <p className="hint">{error}</p>}
      <InterviewClient agentId={agentId} cases={cases} />
    </div>
  );
}

export default App;
