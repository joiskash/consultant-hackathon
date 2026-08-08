import { useEffect, useState } from 'react';

interface CaseMenuItem {
  id: string;
  company: string;
  industry: string;
  case_type: string;
  prompt: string;
}

function App() {
  const [cases, setCases] = useState<CaseMenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    fetch(`${apiUrl}/api/cases`)
      .then((res) => res.json())
      .then((data) => setCases(data.cases ?? []))
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
            <strong>{c.company}</strong> — {c.case_type}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
