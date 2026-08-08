// Server-tool definitions for the ElevenLabs "Alex" agent. These are consumed by the
// @elevenlabs/elevenlabs-js SDK, which validates the typed conversationConfig and expects
// camelCase keys (apiSchema, requestBodySchema, pathParamsSchema). Path parameters use
// {brace} templating; the session id ElevenLabs captures from start_session's response is
// substituted into the URL so it maps onto the engine's /session/:id/... routes.
export interface JsonProp {
  type: string;
  description: string;
  enum?: string[];
}

export interface ObjectSchema {
  type: 'object';
  properties: Record<string, JsonProp>;
  required?: string[];
}

export interface WebhookTool {
  type: 'webhook';
  name: string;
  description: string;
  responseTimeoutSecs?: number;
  apiSchema: {
    url: string;
    method: 'POST' | 'GET';
    pathParamsSchema?: Record<string, JsonProp>;
    requestBodySchema?: ObjectSchema;
  };
}

const obj = (properties: Record<string, JsonProp>, required: string[]): ObjectSchema => ({
  type: 'object',
  properties,
  required,
});

const SESSION_ID: JsonProp = { type: 'string', description: 'Active session id, from start_session' };

export function buildServerTools(backendUrl: string): WebhookTool[] {
  const url = (p: string) => `${backendUrl}${p}`;
  const withSession = { session_id: SESSION_ID };
  return [
    {
      type: 'webhook', name: 'start_session',
      description: 'Start a new interview session. Call once, on the first candidate turn, after they choose guided or realistic.',
      apiSchema: { url: url('/session'), method: 'POST',
        requestBodySchema: obj({ mode: { type: 'string', enum: ['guided', 'realistic'], description: 'Chosen interview mode' } }, ['mode']) },
    },
    {
      type: 'webhook', name: 'select_case',
      description: 'Record the case the candidate picked from the menu. Returns the spoken prompt and disclaimer to read verbatim.',
      apiSchema: { url: url('/session/{session_id}/select'), method: 'POST', pathParamsSchema: withSession,
        requestBodySchema: obj({ case_id: { type: 'string', description: 'Chosen case id, e.g. saverite' } }, ['case_id']) },
    },
    {
      type: 'webhook', name: 'get_phase_brief',
      description: 'Fetch the current phase briefing. ALWAYS call this before speaking in a new phase; speak only within the returned brief.',
      apiSchema: { url: url('/session/{session_id}/advance'), method: 'POST', pathParamsSchema: withSession,
        requestBodySchema: obj({ reason: { type: 'string', description: 'Why you are fetching the brief, e.g. "entering structure phase"' } }, ['reason']) },
    },
    {
      type: 'webhook', name: 'ask_clarifying',
      description: 'Whenever the candidate requests information about the client, market, or any case fact, ALWAYS call this rather than answering from your own knowledge. Returns the sanctioned answer or a miss.',
      apiSchema: { url: url('/session/{session_id}/ask'), method: 'POST', pathParamsSchema: withSession,
        requestBodySchema: obj({ question_text: { type: 'string', description: 'The candidate\u2019s question, verbatim' } }, ['question_text']) },
    },
    {
      type: 'webhook', name: 'report_advance',
      description: 'Report a candidate progression signal (framework done, ready to conclude, or a request for thinking time). Returns the next PhaseBrief.',
      apiSchema: { url: url('/session/{session_id}/advance'), method: 'POST', pathParamsSchema: withSession,
        requestBodySchema: obj({ reason: { type: 'string', description: 'Signal, e.g. "framework_complete" or "thinking_time"' } }, ['reason']) },
    },
    {
      type: 'webhook', name: 'submit_math',
      description: 'Submit the candidate\u2019s calculation for verdict. Returns correct | probe | reveal (with the correct figure).',
      apiSchema: { url: url('/session/{session_id}/quant'), method: 'POST', pathParamsSchema: withSession,
        requestBodySchema: obj({ candidate_math_text: { type: 'string', description: 'The candidate\u2019s stated calculation' } }, ['candidate_math_text']) },
    },
    {
      type: 'webhook', name: 'report_silence',
      description: 'Report silence past the detection window. Returns wait | check_in | nudge | hint; act accordingly. Do not reprompt on your own schedule.',
      apiSchema: { url: url('/session/{session_id}/event'), method: 'POST', pathParamsSchema: withSession,
        requestBodySchema: obj({ type: { type: 'string', description: 'Always "silence_report"' }, seconds: { type: 'string', description: 'Seconds of silence observed' } }, ['type', 'seconds']) },
    },
    {
      type: 'webhook', name: 'end_case',
      description: 'End the case and fetch the spoken debrief to deliver. Call after your natural closing line.',
      apiSchema: { url: url('/session/{session_id}/debrief'), method: 'POST', pathParamsSchema: withSession,
        requestBodySchema: obj({}, []) },
    },
  ];
}
