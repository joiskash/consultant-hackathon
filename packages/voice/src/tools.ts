export interface WebhookTool {
  type: 'webhook';
  name: string;
  description: string;
  response_timeout_secs?: number;
  api_schema: {
    url: string;
    method: 'POST' | 'GET';
    request_body_schema?: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required?: string[];
    };
  };
}

type Properties = Record<string, { type: string; description: string; enum?: string[] }>;

const obj = (properties: Properties, required: string[]) => ({
  type: 'object' as const,
  properties,
  required,
});

export function buildServerTools(backendUrl: string): WebhookTool[] {
  const url = (p: string) => `${backendUrl}${p}`;
  return [
    {
      type: 'webhook', name: 'start_session',
      description: 'Start a new interview session. Call once, on the first candidate turn, after they choose guided or realistic.',
      api_schema: { url: url('/session'), method: 'POST',
        request_body_schema: obj({ mode: { type: 'string', enum: ['guided', 'realistic'], description: 'Chosen interview mode' } }, ['mode']) },
    },
    {
      type: 'webhook', name: 'select_case',
      description: 'Record the case the candidate picked from the menu. Returns the spoken prompt and disclaimer to read verbatim.',
      api_schema: { url: url('/session/:session_id/select'), method: 'POST',
        request_body_schema: obj({ session_id: { type: 'string', description: 'Active session id' }, case_id: { type: 'string', description: 'Chosen case id, e.g. saverite' } }, ['session_id', 'case_id']) },
    },
    {
      type: 'webhook', name: 'get_phase_brief',
      description: 'Fetch the current phase briefing. ALWAYS call this before speaking in a new phase; speak only within the returned brief.',
      api_schema: { url: url('/session/:session_id/advance'), method: 'POST',
        request_body_schema: obj({ session_id: { type: 'string', description: 'Active session id' }, reason: { type: 'string', description: 'Why you are fetching the brief, e.g. "entering structure phase"' } }, ['session_id', 'reason']) },
    },
    {
      type: 'webhook', name: 'ask_clarifying',
      description: 'Whenever the candidate requests information about the client, market, or any case fact, ALWAYS call this rather than answering from your own knowledge. Returns the sanctioned answer or a miss.',
      api_schema: { url: url('/session/:session_id/ask'), method: 'POST',
        request_body_schema: obj({ session_id: { type: 'string', description: 'Active session id' }, question_text: { type: 'string', description: 'The candidate\u2019s question, verbatim' } }, ['session_id', 'question_text']) },
    },
    {
      type: 'webhook', name: 'report_advance',
      description: 'Report a candidate progression signal (framework done, ready to conclude, or a request for thinking time). Returns the next PhaseBrief.',
      api_schema: { url: url('/session/:session_id/advance'), method: 'POST',
        request_body_schema: obj({ session_id: { type: 'string', description: 'Active session id' }, reason: { type: 'string', description: 'Signal, e.g. "framework_complete" or "thinking_time"' } }, ['session_id', 'reason']) },
    },
    {
      type: 'webhook', name: 'submit_math',
      description: 'Submit the candidate\u2019s calculation for verdict. Returns correct | probe | reveal (with the correct figure).',
      api_schema: { url: url('/session/:session_id/quant'), method: 'POST',
        request_body_schema: obj({ session_id: { type: 'string', description: 'Active session id' }, candidate_math_text: { type: 'string', description: 'The candidate\u2019s stated calculation' } }, ['session_id', 'candidate_math_text']) },
    },
    {
      type: 'webhook', name: 'report_silence',
      description: 'Report silence past the detection window. Returns wait | check_in | nudge | hint; act accordingly. Do not reprompt on your own schedule.',
      api_schema: { url: url('/session/:session_id/event'), method: 'POST',
        request_body_schema: obj({ session_id: { type: 'string', description: 'Active session id' }, type: { type: 'string', description: 'Always "silence_report"' }, seconds: { type: 'string', description: 'Seconds of silence observed' } }, ['session_id', 'type', 'seconds']) },
    },
    {
      type: 'webhook', name: 'end_case',
      description: 'End the case and fetch the spoken debrief to deliver. Call after your natural closing line.',
      api_schema: { url: url('/session/:session_id/debrief'), method: 'POST',
        request_body_schema: obj({ session_id: { type: 'string', description: 'Active session id' } }, ['session_id']) },
    },
  ];
}
