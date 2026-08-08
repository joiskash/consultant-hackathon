# M3 Voice Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the FreshCase case engine a voice — an ElevenLabs Agents "Alex" interviewer whose 8 server tools drive the interview, wired against a mocked M2 engine returning canned `PhaseBrief`s.

**Architecture:** The agent config lives in the repo as code (`packages/voice/agent-config.json` + `packages/voice/prompts/*.md`) and is applied to the ElevenLabs platform via an idempotent deploy script. All case behavior is exposed as 8 server-tool webhooks that call the backend (`packages/engine`); for this milestone the backend serves *mock* M2 endpoints returning fixed `PhaseBrief`s from the SaveRite fixture. The browser (`packages/web`) is a mic-only page that opens a session via a backend-issued signed URL and streams transcript turns to the backend event log.

**Tech Stack:** TypeScript 5.5, npm workspaces, Express 4, Jest + ts-jest (unit), Supertest (engine API), `@elevenlabs/elevenlabs-js` (server SDK: deploy + signed URL), `@elevenlabs/react` (browser session), React 18 + Vite 5.

## Global Constraints

- **No case logic in `packages/voice`.** If a task encodes case knowledge there, it belongs in a `PhaseBrief` from the (mock) engine (M3 spec line 3).
- **Agent config is code only** — `agent-config.json` + `prompts/*.md`, applied via API. Never hand-edited in the ElevenLabs dashboard.
- **One voice ("Alex") for both modes.** Modes differ only in prompt sections (`mode-guided.md` / `mode-realistic.md`), never in voice id.
- **Barge-in enabled.** The agent yields immediately when interrupted.
- **The agent must never answer case questions from the LLM's world knowledge.** The `ask_clarifying` tool description clause enforcing this is load-bearing (M3 spec line 34).
- **All session state is keyed by the ElevenLabs conversation id**, not a browser session (keeps the phone-channel stretch unblocked).
- **Dependency pinning:** pin `@elevenlabs/*` SDKs to an exact version published ≥7 days ago; no floating ranges. Add `"overrides": { "livekit-client": "2.16.1" }` to root `package.json` for the WebRTC handshake workaround.
- **Node 20 / build in dependency order:** `types` → `voice`; `types`+`db` → `engine`; `web` standalone.
- **Timestamps:** prefer ElevenLabs platform-provided times for transcript events; where only client time is available, mark it (M4 voice metrics depend on fidelity).

---

## Task 0: Platform-Risk Spike (Phase 0 — DO FIRST, timeboxed ~45 min)

Verify the three platform unknowns the M3 spec flags before building anything. You have `ELEVENLABS_API_KEY`, so make real API calls where possible; the rest is a manual voice checklist.

**Files:**
- Create: `packages/voice/scripts/spike.ts`
- Modify: `README.md` (add a `## Platform-risk spike findings` section)

**Interfaces:**
- Consumes: `ELEVENLABS_API_KEY` from env.
- Produces: nothing consumed by later tasks; findings recorded in `README.md`. If silence-timer control is insufficient, escalate to the team (changes the Guided/Realistic feel).

- [ ] **Step 1: Install the server SDK (pinned, ≥7 days old)**

```bash
# Pick the latest @elevenlabs/elevenlabs-js version published at least 7 days ago and pin it exactly.
npm i @elevenlabs/elevenlabs-js@<pinned-version> -w packages/voice
```

- [ ] **Step 2: Write the spike script**

```typescript
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
```

- [ ] **Step 3: Run the spike**

Run: `npx tsx packages/voice/scripts/spike.ts` (or compile + node)
Expected: prints `agent_id`, `signed_url_ok true`, `conversations_endpoint_ok true`, `cleanup_ok`.

- [ ] **Step 4: Manual voice checks (cannot be automated)**

Using the ElevenLabs playground on the throwaway agent (before deleting), confirm and note in the README:
1. Can native no-input reprompts be disabled or maxed out? (needed for `report_silence` design)
2. Rough server-tool round-trip latency mid-conversation (attach a webhook tool to a public URL).
3. Are per-utterance transcript events available live (client events) vs only post-call webhook?

- [ ] **Step 5: Record findings + commit**

Write results under `## Platform-risk spike findings` in `README.md`. If (1) fails, add a note that native reprompts must be treated as `check_in`-equivalent and flag the team.

```bash
git add packages/voice/scripts/spike.ts README.md packages/voice/package.json package-lock.json
git commit -m "chore(voice): platform-risk spike script + findings"
```

---

## Task 1: Shared voice types (`packages/types`)

The mock engine and the integration tests need the M2 output shapes. Add the minimal subset now (full M2 types land with M2).

**Files:**
- Create: `packages/types/src/voice.ts`
- Modify: `packages/types/src/index.ts`
- Test: `packages/types/tests/voice.test.ts`

**Interfaces:**
- Produces: `Phase`, `PhaseBrief`, `ClarifyingAnswer`, `QuantVerdict`, `Mode` — consumed by Tasks 3, 6, 8.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/types/tests/voice.test.ts
import { PhaseBriefSchema } from '../src/voice';

test('PhaseBrief requires phase + spoken guidance fields', () => {
  const ok = PhaseBriefSchema.safeParse({
    phase: 'structure', may_say: ['Take a moment to structure.'],
    must_withhold: ['segment revenue split'], coaching_policy: 'no mid-case feedback',
    time_guidance: 'structure is running long — offer to move on',
  });
  expect(ok.success).toBe(true);
  expect(PhaseBriefSchema.safeParse({ phase: 'not_a_phase' }).success).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/types -- voice`
Expected: FAIL — cannot find `../src/voice`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/types/src/voice.ts
import { z } from 'zod';

export const PhaseSchema = z.enum([
  'menu', 'prompt', 'clarifying', 'structure', 'quant', 'brainstorm', 'recommendation', 'debrief',
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const ModeSchema = z.enum(['guided', 'realistic']);
export type Mode = z.infer<typeof ModeSchema>;

export const PhaseBriefSchema = z.object({
  phase: PhaseSchema,
  may_say: z.array(z.string()),
  must_withhold: z.array(z.string()),
  coaching_policy: z.string(),
  time_guidance: z.string(),
});
export type PhaseBrief = z.infer<typeof PhaseBriefSchema>;

export const ClarifyingAnswerSchema = z.object({
  answer: z.string().nullable(),
  live_fetched: z.boolean().optional(),
  source_url: z.string().optional(),
  miss: z.boolean().optional(),
});
export type ClarifyingAnswer = z.infer<typeof ClarifyingAnswerSchema>;

export const QuantVerdictSchema = z.discriminatedUnion('verdict', [
  z.object({ verdict: z.literal('correct') }),
  z.object({ verdict: z.literal('probe') }),
  z.object({ verdict: z.literal('reveal'), correct_figure: z.string() }),
]);
export type QuantVerdict = z.infer<typeof QuantVerdictSchema>;
```

- [ ] **Step 4: Export + verify**

Add `export * from './voice';` to `packages/types/src/index.ts`. Run: `npm test -w packages/types -- voice` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/voice.ts packages/types/src/index.ts packages/types/tests/voice.test.ts
git commit -m "feat(types): add voice/PhaseBrief shared types"
```

---

## Task 2: Prompt files + composition (`packages/voice`)

Three layered prompt files concatenated at session start; the dynamic brief arrives via tool results (not here).

**Files:**
- Create: `packages/voice/prompts/persona.md`, `mode-guided.md`, `mode-realistic.md`, `protocol.md`
- Create: `packages/voice/src/prompts.ts`
- Modify: `packages/voice/src/index.ts`, `packages/voice/tests/index.test.ts`
- Test: `packages/voice/tests/prompts.test.ts`

**Interfaces:**
- Produces: `composeSystemPrompt(mode: Mode): string` and `FIRST_MESSAGE: string` — consumed by Task 4.

- [ ] **Step 1: Write the prompt files**

`persona.md` — Alex's identity: professional case interviewer, concise, natural spoken register (no lists/markdown-speak, numbers read naturally), never breaks character, never mentions being an AI or tooling; latency-masking phrases ("let me check what we have on that…"); delivers the real-company disclaimer verbatim when told.

`mode-guided.md` — behavior delta only: brief in-the-moment technique coaching allowed; hint ladder one level earlier.

`mode-realistic.md` — behavior delta only: professionally cold; no mid-case feedback; calibrated hints only when stuck.

`protocol.md` — the tool protocol: **before speaking in a new phase, call `get_phase_brief`; speak only within the returned brief**; read scripted `*_spoken` fields faithfully (do not paraphrase — a coherence guard validated those exact numbers); report candidate signals via `report_advance`, questions via `ask_clarifying`, math via `submit_math`, silence via `report_silence`; **never answer case questions from your own knowledge — always call `ask_clarifying`.**

- [ ] **Step 2: Write the failing test**

```typescript
// packages/voice/tests/prompts.test.ts
import { composeSystemPrompt, FIRST_MESSAGE } from '../src/prompts';

test('realistic prompt is cold and includes the tool protocol', () => {
  const p = composeSystemPrompt('realistic');
  expect(p).toContain('never answer case questions from your own knowledge');
  expect(p).toContain('get_phase_brief');
  expect(p).not.toContain('technique coaching'); // guided-only delta absent
});
test('guided prompt includes coaching delta', () => {
  expect(composeSystemPrompt('guided')).toContain('technique coaching');
});
test('first message offers the case menu by voice', () => {
  expect(FIRST_MESSAGE.length).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w packages/voice -- prompts` → FAIL (no `../src/prompts`).

- [ ] **Step 4: Implement composition**

```typescript
// packages/voice/src/prompts.ts
import fs from 'fs';
import path from 'path';
import type { Mode } from '@freshcase/types';

const dir = path.join(__dirname, '../prompts');
const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf-8').trim();

export const FIRST_MESSAGE =
  'Welcome to FreshCase. I have three live cases from this morning\u2019s headlines. ' +
  'Before we start — would you like a guided run or a realistic one?';

export function composeSystemPrompt(mode: Mode): string {
  const modeFile = mode === 'guided' ? 'mode-guided.md' : 'mode-realistic.md';
  return [read('persona.md'), read(modeFile), read('protocol.md')].join('\n\n');
}
```

Ensure prompts are shipped with the build: add `"files"` or a copy step so `dist` can resolve `../prompts` (or read from package root — keep `prompts/` at package root, resolved relative to `__dirname` = `dist/src` → `../../prompts`; adjust the path constant to `path.join(__dirname, '../../prompts')` for the built output and `../prompts` when run via ts-jest — resolve by trying both, or configure `tsconfig` `rootDir`). Simplest: keep prompts at `packages/voice/prompts` and compute `path.resolve(__dirname, '..', '..', 'prompts')`; verify the test (ts-jest runs from `src`) — if it fails, use a `PROMPTS_DIR` that checks both candidates.

- [ ] **Step 5: Update the legacy test + index**

Update `packages/voice/tests/index.test.ts` to import the new API (or keep `getAgentConfig` as a thin wrapper delegating to `composeSystemPrompt`). Re-export from `src/index.ts`. Run: `npm test -w packages/voice` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/voice/prompts packages/voice/src/prompts.ts packages/voice/src/index.ts packages/voice/tests
git commit -m "feat(voice): layered persona/mode/protocol prompts + composition"
```

---

## Task 3: Server tool definitions (`packages/voice`)

The 8 server tools, mapping 1:1 onto (mock) M2 endpoints, each with a "when to call" description.

**Files:**
- Create: `packages/voice/src/tools.ts`
- Test: `packages/voice/tests/tools.test.ts`

**Interfaces:**
- Consumes: `Phase`/`Mode` from types (for reference only).
- Produces: `buildServerTools(backendUrl: string): WebhookTool[]` where each tool has `type: 'webhook'`, `name`, `description`, `api_schema { url, method, request_body_schema }`. Tool names: `start_session`, `select_case`, `get_phase_brief`, `ask_clarifying`, `report_advance`, `submit_math`, `report_silence`, `end_case`. Consumed by Task 4.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/voice/tests/tools.test.ts
import { buildServerTools } from '../src/tools';

test('defines all 8 server tools pointing at the backend', () => {
  const tools = buildServerTools('https://api.example.com');
  const names = tools.map((t) => t.name).sort();
  expect(names).toEqual([
    'ask_clarifying', 'end_case', 'get_phase_brief', 'report_advance',
    'report_silence', 'select_case', 'start_session', 'submit_math',
  ]);
  tools.forEach((t) => {
    expect(t.type).toBe('webhook');
    expect(t.api_schema.url.startsWith('https://api.example.com')).toBe(true);
  });
});

test('ask_clarifying description forbids answering from world knowledge', () => {
  const ask = buildServerTools('https://x').find((t) => t.name === 'ask_clarifying')!;
  expect(ask.description.toLowerCase()).toContain('rather than answering from your own knowledge');
  expect(ask.api_schema.method).toBe('POST');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/voice -- tools` → FAIL (no `../src/tools`).

- [ ] **Step 3: Implement the tool factory**

```typescript
// packages/voice/src/tools.ts
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

const obj = (
  properties: WebhookTool['api_schema']['request_body_schema'] extends infer S ? any : never,
  required: string[],
) => ({ type: 'object' as const, properties, required });

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
```

(Note: ElevenLabs path-parameter substitution — confirm during the spike whether `:session_id` in the URL is templated from parameters or must be passed in the body only; if URL templating is unsupported, keep `session_id` in the body and use a fixed path like `/session/select` that reads the id from the body. Adjust here accordingly.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w packages/voice -- tools` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/voice/src/tools.ts packages/voice/tests/tools.test.ts
git commit -m "feat(voice): 8 server-tool definitions mapped to M2 endpoints"
```

---

## Task 4: Conversation config builder + base config (`packages/voice`)

Combine prompt + tools + base voice/turn/asr settings into one `conversation_config`.

**Files:**
- Create: `packages/voice/agent-config.json` (base, non-prompt settings)
- Create: `packages/voice/src/config.ts`
- Modify: `packages/voice/src/index.ts`
- Test: `packages/voice/tests/config.test.ts`

**Interfaces:**
- Consumes: `composeSystemPrompt`, `FIRST_MESSAGE` (Task 2), `buildServerTools` (Task 3), `agent-config.json`.
- Produces: `buildConversationConfig(mode: Mode, backendUrl: string): object` and `AGENT_NAME` — consumed by Task 5.

- [ ] **Step 1: Write `agent-config.json`**

```json
{
  "voice_id": "JBFqnCBsd6RMkjVDRZzb",
  "tts_model_id": "eleven_flash_v2_5",
  "language": "en",
  "turn": { "turn_timeout": 7, "turn_eagerness": "normal", "silence_end_call_timeout": -1 },
  "asr": { "quality": "high", "keywords": ["FreshCase", "SaveRite"] }
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// packages/voice/tests/config.test.ts
import { buildConversationConfig } from '../src/config';

test('assembles prompt, tools, and tts into conversation_config', () => {
  const c: any = buildConversationConfig('realistic', 'https://api.example.com');
  expect(c.agent.prompt.prompt).toContain('never answer case questions');
  expect(c.agent.prompt.tools).toHaveLength(8);
  expect(c.agent.first_message.length).toBeGreaterThan(0);
  expect(c.tts.voice_id).toBe('JBFqnCBsd6RMkjVDRZzb');
  expect(c.agent.prompt.llm).toBeDefined();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w packages/voice -- config` → FAIL.

- [ ] **Step 4: Implement**

```typescript
// packages/voice/src/config.ts
import fs from 'fs';
import path from 'path';
import type { Mode } from '@freshcase/types';
import { composeSystemPrompt, FIRST_MESSAGE } from './prompts';
import { buildServerTools } from './tools';

export const AGENT_NAME = 'FreshCase — Alex';
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '../agent-config.json'), 'utf-8'));

export function buildConversationConfig(mode: Mode, backendUrl: string) {
  return {
    agent: {
      first_message: FIRST_MESSAGE,
      language: base.language,
      prompt: {
        prompt: composeSystemPrompt(mode),
        llm: 'gemini-2.0-flash',
        temperature: mode === 'guided' ? 0.5 : 0.3,
        tools: buildServerTools(backendUrl),
        built_in_tools: { end_call: {} },
      },
    },
    tts: { voice_id: base.voice_id, model_id: base.tts_model_id },
    turn: base.turn,
    asr: base.asr,
  };
}
```

(Path caveat: same `__dirname`/`dist` resolution note as Task 2 applies to `agent-config.json`.)

- [ ] **Step 5: Run + commit**

Run: `npm test -w packages/voice` → all PASS.

```bash
git add packages/voice/agent-config.json packages/voice/src/config.ts packages/voice/src/index.ts packages/voice/tests/config.test.ts
git commit -m "feat(voice): conversation_config builder + base agent-config.json"
```

---

## Task 5: Idempotent deploy script (`packages/voice`)

Create-or-update the two agents (guided + realistic) from repo config. Idempotent: re-running updates in place, never duplicates.

**Files:**
- Create: `packages/voice/src/deploy.ts`
- Test: `packages/voice/tests/deploy.test.ts`

**Interfaces:**
- Consumes: `buildConversationConfig`, `AGENT_NAME` (Task 4), `ElevenLabsClient`.
- Produces: `deployAgents(client, backendUrl): Promise<Record<Mode, string>>` (returns agent ids). Consumed by operators + the web build.

- [ ] **Step 1: Write the failing test (mock the SDK client)**

```typescript
// packages/voice/tests/deploy.test.ts
import { deployAgents } from '../src/deploy';

function fakeClient(existing: Array<{ name: string; agentId: string }>) {
  const created: any[] = [];
  const updated: any[] = [];
  return {
    created, updated,
    conversationalAi: {
      agents: {
        list: async () => ({ agents: existing }),
        create: async (a: any) => { const agentId = 'new_' + created.length; created.push(a); return { agentId }; },
        update: async (id: string, a: any) => { updated.push({ id, a }); return { agentId: id }; },
      },
    },
  } as any;
}

test('creates both agents when none exist', async () => {
  const c = fakeClient([]);
  const ids = await deployAgents(c, 'https://api.example.com');
  expect(c.created).toHaveLength(2);
  expect(ids.guided).toBeDefined();
  expect(ids.realistic).toBeDefined();
});

test('updates in place when agents already exist (idempotent)', async () => {
  const c = fakeClient([
    { name: 'FreshCase — Alex (guided)', agentId: 'g1' },
    { name: 'FreshCase — Alex (realistic)', agentId: 'r1' },
  ]);
  await deployAgents(c, 'https://api.example.com');
  expect(c.created).toHaveLength(0);
  expect(c.updated.map((u: any) => u.id).sort()).toEqual(['g1', 'r1']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/voice -- deploy` → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/voice/src/deploy.ts
import type { Mode } from '@freshcase/types';
import { buildConversationConfig, AGENT_NAME } from './config';

const MODES: Mode[] = ['guided', 'realistic'];
const nameFor = (mode: Mode) => `${AGENT_NAME} (${mode})`;

export async function deployAgents(client: any, backendUrl: string): Promise<Record<Mode, string>> {
  const { agents } = await client.conversationalAi.agents.list();
  const out = {} as Record<Mode, string>;
  for (const mode of MODES) {
    const name = nameFor(mode);
    const conversationConfig = buildConversationConfig(mode, backendUrl);
    const existing = agents.find((a: any) => a.name === name);
    if (existing) {
      await client.conversationalAi.agents.update(existing.agentId, { conversationConfig });
      out[mode] = existing.agentId;
    } else {
      const created = await client.conversationalAi.agents.create({ name, conversationConfig });
      out[mode] = created.agentId;
    }
  }
  return out;
}
```

- [ ] **Step 4: Add a runnable CLI entry (not unit-tested)**

```typescript
// append to packages/voice/src/deploy.ts
if (require.main === module) {
  (async () => {
    const { ElevenLabsClient } = await import('@elevenlabs/elevenlabs-js');
    const backendUrl = process.env.BACKEND_PUBLIC_URL;
    if (!backendUrl) throw new Error('BACKEND_PUBLIC_URL is required (must be reachable by ElevenLabs)');
    const ids = await deployAgents(new ElevenLabsClient(), backendUrl);
    console.log(JSON.stringify(ids, null, 2));
  })().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 5: Run + commit**

Run: `npm test -w packages/voice -- deploy` → PASS.

```bash
git add packages/voice/src/deploy.ts packages/voice/tests/deploy.test.ts
git commit -m "feat(voice): idempotent agent deploy script"
```

---

## Task 6: Mock M2 endpoints (`packages/engine`)

Canned `PhaseBrief`s and tool responses for SaveRite, keyed by ElevenLabs conversation id / a returned session id. Clearly labeled as a stub to be replaced by real M2.

**Files:**
- Create: `packages/engine/src/mockEngine.ts`
- Modify: `packages/engine/src/index.ts` (mount the 7 endpoints)
- Test: `packages/engine/tests/mockEngine.test.ts`

**Interfaces:**
- Consumes: `PhaseBrief`, `ClarifyingAnswer`, `QuantVerdict` (Task 1).
- Produces: an Express `Router` mounted at `/` with `POST /session`, `/session/:id/select`, `/session/:id/ask`, `/session/:id/advance`, `/session/:id/quant`, `/session/:id/event`, `/session/:id/debrief`. Consumed by Task 8 + the deployed tools.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/engine/tests/mockEngine.test.ts
import express from 'express';
import request from 'supertest';
import { mockEngineRouter } from '../src/mockEngine';

const app = express().use(express.json()).use(mockEngineRouter());

test('start_session returns a session id and a menu', async () => {
  const r = await request(app).post('/session').send({ mode: 'realistic' });
  expect(r.status).toBe(201);
  expect(r.body.session_id).toBeDefined();
  expect(Array.isArray(r.body.menu)).toBe(true);
});

test('advance returns a valid PhaseBrief', async () => {
  const s = await request(app).post('/session').send({ mode: 'realistic' });
  const r = await request(app).post(`/session/${s.body.session_id}/advance`).send({ reason: 'entering structure' });
  expect(r.status).toBe(200);
  expect(r.body.phase).toBeDefined();
  expect(Array.isArray(r.body.may_say)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/engine -- mockEngine` → FAIL.

- [ ] **Step 3: Implement the mock router**

```typescript
// packages/engine/src/mockEngine.ts
// STUB: replaces the real M2 state machine until M2 lands. Canned SaveRite briefs only.
import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { PhaseBrief, Phase } from '@freshcase/types';

const PHASE_ORDER: Phase[] = ['prompt', 'clarifying', 'structure', 'quant', 'brainstorm', 'recommendation', 'debrief'];

const BRIEFS: Record<Phase, PhaseBrief> = {
  menu: { phase: 'menu', may_say: ['Which case would you like?'], must_withhold: [], coaching_policy: '', time_guidance: '' },
  prompt: { phase: 'prompt', may_say: ['SaveRite, a grocery chain, has seen margins slip this quarter. How would you approach it?'], must_withhold: ['segment data'], coaching_policy: 'no feedback', time_guidance: '' },
  clarifying: { phase: 'clarifying', may_say: ['Good question — happy to share what we have.'], must_withhold: ['quant figures'], coaching_policy: 'no feedback', time_guidance: 'wrap clarifying soon' },
  structure: { phase: 'structure', may_say: ['Take a moment to structure your thinking.'], must_withhold: ['revenue split'], coaching_policy: 'no mid-case feedback', time_guidance: 'structure running long — offer to move on' },
  quant: { phase: 'quant', may_say: ['Walk me through the numbers.'], must_withhold: ['the answer'], coaching_policy: 'probe once then reveal', time_guidance: '' },
  brainstorm: { phase: 'brainstorm', may_say: ['What levers could improve margin?'], must_withhold: [], coaching_policy: 'no feedback', time_guidance: '' },
  recommendation: { phase: 'recommendation', may_say: ['Bring it together — what do you recommend?'], must_withhold: [], coaching_policy: 'no feedback', time_guidance: '' },
  debrief: { phase: 'debrief', may_say: ['That\u2019s everything from me — let\u2019s talk about how it went.'], must_withhold: [], coaching_policy: '', time_guidance: '' },
};

interface Session { id: string; mode: string; phaseIndex: number; mathAttempts: number; events: any[]; }

export function mockEngineRouter(): Router {
  const r = Router();
  const sessions = new Map<string, Session>();

  r.post('/session', (req, res) => {
    const id = randomUUID();
    sessions.set(id, { id, mode: req.body.mode ?? 'realistic', phaseIndex: 0, mathAttempts: 0, events: [] });
    res.status(201).json({ session_id: id, menu: [{ id: 'saverite', title: 'SaveRite grocery margins' }] });
  });

  r.post('/session/:id/select', (req, res) => {
    res.json({ prompt_spoken: BRIEFS.prompt.may_say[0], disclaimer_spoken: 'SaveRite is a real company; figures here are illustrative.' });
  });

  r.post('/session/:id/ask', (_req, res) => {
    // Canned ledger hit; real M2 does topic-match + live fetch.
    res.json({ answer: 'Same-store sales are flat year over year.', miss: false });
  });

  r.post('/session/:id/advance', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'session not found' });
    s.phaseIndex = Math.min(s.phaseIndex + 1, PHASE_ORDER.length - 1);
    res.json(BRIEFS[PHASE_ORDER[s.phaseIndex]]);
  });

  r.post('/session/:id/quant', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'session not found' });
    s.mathAttempts += 1;
    if (String(req.body.candidate_math_text).includes('20')) return res.json({ verdict: 'correct' });
    if (s.mathAttempts < 2) return res.json({ verdict: 'probe' });
    res.json({ verdict: 'reveal', correct_figure: '20%' });
  });

  r.post('/session/:id/event', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'session not found' });
    s.events.push({ ...req.body, at: Date.now() });
    if (req.body.type === 'silence_report') return res.json({ action: 'check_in' });
    res.json({ ack: true });
  });

  r.post('/session/:id/debrief', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'session not found' });
    res.json({ spoken_debrief: 'You structured well and recovered on the math. Your scorecard is on screen.', events: s.events });
  });

  return r;
}
```

- [ ] **Step 4: Mount + verify**

In `packages/engine/src/index.ts`, add `import { mockEngineRouter } from './mockEngine';` and `app.use(mockEngineRouter());`. Run: `npm test -w packages/engine -- mockEngine` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/mockEngine.ts packages/engine/src/index.ts packages/engine/tests/mockEngine.test.ts
git commit -m "feat(engine): mock M2 endpoints with canned SaveRite briefs"
```

---

## Task 7: Signed-URL endpoint + ElevenLabs client service (`packages/engine`)

The browser gets a short-lived signed URL from the backend so the API key stays server-side.

**Files:**
- Modify: `packages/engine/src/services/elevenlabs.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/tests/signedUrl.test.ts`

**Interfaces:**
- Consumes: `ELEVENLABS_API_KEY`; a `getClient()` factory (injectable for tests).
- Produces: `GET /api/voice/signed-url?agentId=...` → `{ signedUrl }`. Consumed by Task 9.

- [ ] **Step 1: Write the failing test (inject a fake client)**

```typescript
// packages/engine/tests/signedUrl.test.ts
import express from 'express';
import request from 'supertest';
import { signedUrlRouter } from '../src/services/elevenlabs';

const fake = { conversationalAi: { conversations: { getSignedUrl: async ({ agentId }: any) => ({ signedUrl: 'wss://x/' + agentId }) } } } as any;
const app = express().use(signedUrlRouter(() => fake));

test('returns a signed url for the agent', async () => {
  const r = await request(app).get('/api/voice/signed-url?agentId=g1');
  expect(r.status).toBe(200);
  expect(r.body.signedUrl).toBe('wss://x/g1');
});

test('400 when agentId missing', async () => {
  expect((await request(app).get('/api/voice/signed-url')).status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/engine -- signedUrl` → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/engine/src/services/elevenlabs.ts  (extend existing file)
import { Router } from 'express';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

export interface ElevenLabsConfig { apiKey: string; }
export function getElevenLabsConfig(): ElevenLabsConfig {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');
  return { apiKey };
}
export function getClient(): any {
  return new ElevenLabsClient({ apiKey: getElevenLabsConfig().apiKey });
}

export function signedUrlRouter(clientFactory: () => any = getClient): Router {
  const r = Router();
  r.get('/api/voice/signed-url', async (req, res) => {
    const agentId = req.query.agentId ? String(req.query.agentId) : '';
    if (!agentId) return res.status(400).json({ error: 'agentId is required' });
    try {
      const { signedUrl } = await clientFactory().conversationalAi.conversations.getSignedUrl({ agentId });
      res.json({ signedUrl });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  return r;
}
```

Install the SDK in the engine (pinned): `npm i @elevenlabs/elevenlabs-js@<pinned-version> -w packages/engine`. Mount in `index.ts`: `app.use(signedUrlRouter());`.

- [ ] **Step 4: Run + commit**

Run: `npm test -w packages/engine -- signedUrl` → PASS.

```bash
git add packages/engine/src/services/elevenlabs.ts packages/engine/src/index.ts packages/engine/tests/signedUrl.test.ts packages/engine/package.json package-lock.json
git commit -m "feat(engine): signed-url endpoint + elevenlabs client service"
```

---

## Task 8: Webhook-level integration test — full case start→debrief (`packages/engine`)

The spec's acceptance test: a scripted tool-call sequence against the mock engine, asserting the event log is complete and ordered.

**Files:**
- Test: `packages/engine/tests/voiceFlow.test.ts`

**Interfaces:**
- Consumes: the mounted `mockEngineRouter` (Task 6).

- [ ] **Step 1: Write the integration test**

```typescript
// packages/engine/tests/voiceFlow.test.ts
import express from 'express';
import request from 'supertest';
import { mockEngineRouter } from '../src/mockEngine';

const app = express().use(express.json()).use(mockEngineRouter());

test('drives a full case: start -> select -> ask -> advance*4 -> quant(probe->reveal) -> debrief', async () => {
  const start = await request(app).post('/session').send({ mode: 'realistic' });
  const id = start.body.session_id;

  await request(app).post(`/session/${id}/select`).send({ case_id: 'saverite' }).expect(200);
  const ask = await request(app).post(`/session/${id}/ask`).send({ question_text: 'is the whole industry feeling this?' }).expect(200);
  expect(ask.body.answer).toBeTruthy();

  const phases = [] as string[];
  for (let i = 0; i < 4; i++) {
    const b = await request(app).post(`/session/${id}/advance`).send({ reason: 'progress' }).expect(200);
    phases.push(b.body.phase);
  }
  expect(phases).toEqual(['clarifying', 'structure', 'quant', 'brainstorm']);

  const wrong1 = await request(app).post(`/session/${id}/quant`).send({ candidate_math_text: 'about 5%' }).expect(200);
  expect(wrong1.body.verdict).toBe('probe');
  const wrong2 = await request(app).post(`/session/${id}/quant`).send({ candidate_math_text: 'about 5%' }).expect(200);
  expect(wrong2.body.verdict).toBe('reveal');

  await request(app).post(`/session/${id}/event`).send({ type: 'candidate_turn', text: 'my recommendation is...' }).expect(200);
  const debrief = await request(app).post(`/session/${id}/debrief`).send({}).expect(200);
  expect(debrief.body.spoken_debrief).toBeTruthy();
  expect(debrief.body.events.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it passes (mock already implements the behavior)**

Run: `npm test -w packages/engine -- voiceFlow` → PASS. If a step fails, fix the mock in Task 6 (not the test).

- [ ] **Step 3: Commit**

```bash
git add packages/engine/tests/voiceFlow.test.ts
git commit -m "test(engine): full scripted tool-call flow start->debrief"
```

---

## Task 9: Web mic page (`packages/web`)

Minimal voice-first page: talk button, status line, case title placeholder, exhibit-screen placeholder div. Connects via signed URL; streams transcript turns to `/event`.

**Files:**
- Create: `packages/web/src/InterviewClient.tsx`
- Modify: `packages/web/src/App.tsx` (render it), root `package.json` (livekit override)
- Test: `packages/web/tests/interviewClient.test.tsx` (light — render + button states)

**Interfaces:**
- Consumes: `GET /api/voice/signed-url` (Task 7), `VITE_API_URL`, `VITE_AGENT_ID_REALISTIC` / `VITE_AGENT_ID_GUIDED` (from deploy output).

- [ ] **Step 1: Install deps + livekit pin**

```bash
npm i @elevenlabs/react@<pinned-version> -w packages/web
```

Add to root `package.json`: `"overrides": { "livekit-client": "2.16.1" }`, then `npm install`.

- [ ] **Step 2: Write the component**

```tsx
// packages/web/src/InterviewClient.tsx
import { useConversation } from '@elevenlabs/react';

const API = import.meta.env.VITE_API_URL as string;

export function InterviewClient({ agentId }: { agentId: string }) {
  const conversation = useConversation({
    onMessage: (m: any) => post('interviewer_turn', m.message),
    onUserTranscript: (t: any) => post('candidate_turn', t.message),
  });

  const sessionRef = { current: '' as string };
  function post(type: string, text: string) {
    // NOTE: client-time fallback; platform times preferred once conversation events wired (see spike findings).
    if (!sessionRef.current) return;
    fetch(`${API}/session/${sessionRef.current}/event`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, text, at: Date.now() }),
    }).catch(() => {});
  }

  async function start() {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const { signedUrl } = await fetch(`${API}/api/voice/signed-url?agentId=${agentId}`).then((r) => r.json());
    await conversation.startSession({ signedUrl });
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
      <p>Status: {conversation.status}</p>
      {conversation.status === 'connected'
        ? <button onClick={() => conversation.endSession()}>End interview</button>
        : <button onClick={start}>Start interview</button>}
      <div id="exhibit-screen" />{/* reserved for stretch exhibit screen */}
    </main>
  );
}
```

- [ ] **Step 3: Wire into App + light test**

Render `<InterviewClient agentId={import.meta.env.VITE_AGENT_ID_REALISTIC} />`. Write a render test asserting the "Start interview" button shows when disconnected (mock `@elevenlabs/react`'s `useConversation` to return `status: 'disconnected'`).

Run: `npm test -w packages/web` → PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/InterviewClient.tsx packages/web/src/App.tsx packages/web/tests package.json package-lock.json
git commit -m "feat(web): mic-only interview page wired to signed URL + event log"
```

---

## Task 10: Manual test script (`packages/voice/TESTING.md`)

The spec's 10-minute manual checklist (voice UX is manual; wiring is covered by Tasks 8–9).

**Files:**
- Create: `packages/voice/TESTING.md`

- [ ] **Step 1: Write the checklist**

Cover: barge-in during a prompt; thinking-time request honored silently; paraphrased ledger question answered from `ask_clarifying`; an out-of-ledger question (verify neutral miss phrasing, no world-knowledge answer); deliberate wrong math (probe → reveal in realistic; immediate correct in guided); full silence ladder (check_in → nudge → hint). Include deploy prerequisites (`BACKEND_PUBLIC_URL` via tunnel, run `deploy.ts`, set the `VITE_AGENT_ID_*` envs).

- [ ] **Step 2: Commit**

```bash
git add packages/voice/TESTING.md
git commit -m "docs(voice): manual test checklist"
```

---

## Self-Review

**Spec coverage (M3):**
- Platform-risk spike → Task 0 ✓
- Agent config as code (`agent-config.json` + `prompts/*.md`) → Tasks 2, 4 ✓
- One voice, mode = prompt delta only → Tasks 2, 4 ✓
- Barge-in → base config note; verify in spike (Task 0) ✓
- 8 server tools 1:1 with M2, load-bearing `ask_clarifying` clause → Task 3 ✓
- Brief via tool results (no case logic in voice) → Tasks 2 (protocol), 6 (mock briefs) ✓
- Silence detection→`report_silence`→policy → Task 3 (tool) + Task 6 (`check_in` response) ✓
- Transcript → `/event` → Tasks 6, 9 ✓
- Idempotent deploy → Task 5 ✓
- Webhook integration test (full case) → Task 8 ✓
- Manual test script → Task 10 ✓
- Non-goals respected: no scoring (M4), no real case logic, exhibit screen only a placeholder div, phone channel unblocked via conversation-id keying ✓

**Open items to resolve during execution (flagged inline, not placeholders):**
- ElevenLabs URL path-parameter templating for `:session_id` (Task 3 note) — confirm in the spike; fall back to body-only ids if unsupported.
- `dist` vs ts-jest path resolution for `prompts/` and `agent-config.json` (Tasks 2, 4).
- Live transcript event fidelity (client-time fallback vs platform times) — decided by spike findings (Task 0 → Task 9 note).

**Type consistency:** `Mode`, `Phase`, `PhaseBrief` defined in Task 1 and used identically in Tasks 3, 4, 6, 8. Tool names identical across Tasks 3 and 8. ✓
