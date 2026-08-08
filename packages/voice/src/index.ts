export interface AgentConfig {
  mode: 'guided' | 'realistic';
  firstMessage: string;
  systemPrompt: string;
}

export function getAgentConfig(mode: 'guided' | 'realistic'): AgentConfig {
  const base =
    'You are a professional case interviewer conducting a spoken case interview.';
  const guided =
    'Provide brief, in-the-moment course corrections when the candidate is off track. Be supportive but rigorous.';
  const realistic =
    'Be professionally cold. Give calibrated hints only when the candidate is stuck. Do not offer mid-case feedback.';

  return {
    mode,
    firstMessage:
      'Welcome to FreshCase. I have three live cases from this morning\'s headlines. Which would you like to tackle?',
    systemPrompt: `${base} ${mode === 'guided' ? guided : realistic}`,
  };
}
