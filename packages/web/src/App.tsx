import { useEffect, useState } from 'react';
import { InterviewClient } from './InterviewClient';

interface CaseMenuItem {
  id: string;
  company?: string;
  case_type?: string;
  spoken_teaser?: string;
}

function App() {
  const [cases, setCases] = useState<CaseMenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const agentId = import.meta.env.VITE_AGENT_ID_REALISTIC ?? '';

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL ?? '';
    fetch(`${apiUrl}/api/cases`)
      .then((res) => res.json())
      .then((data) => {
        // Menu shape is { cases: { items: [...] } } (M2) or { cases: [...] }.
        const raw = data.cases;
        const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
        setCases(items);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="app">
      <h1>FreshCase</h1>
      <p>Voice-first case interview practice</p>
      {error && <p className="error">{error}</p>}
      <ul>
        {cases.map((c) => (
          <li key={c.id}>
            <strong>{c.company ?? c.id}</strong>
            {c.case_type ? ` — ${c.case_type}` : ''}
            {c.spoken_teaser ? ` — ${c.spoken_teaser}` : ''}
          </li>
        ))}
      </ul>
      <InterviewClient agentId={agentId} />
    </div>
  );
}

export default App;
