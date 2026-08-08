# M3 — Voice Layer (ElevenLabs Agents)

Spec for the conversational voice layer. Written for a Devin session; assumes M2's HTTP endpoints exist (fixture-driven — M2 can be mocked with canned `PhaseBrief`s until real). **This module contains no case logic.** If you find yourself encoding case knowledge here, it belongs in M2's `PhaseBrief` or the pack.

Contract anchors: [M2 spec](M2-engine.md) endpoint shapes; [`fixtures/saverite.json`](../fixtures/saverite.json) for the `*_spoken` fields the agent will voice.

## Purpose

Give the case engine a mouth and ears: an ElevenLabs Agents agent that conducts the interview using M2's briefings, handles turn-taking and barge-in natively, detects silence and reports it to M2, and streams the transcript into M2's event log.

## Channel

- **MVP: web page with mic** — minimal page served by the backend: talk button, session status line, case title once selected. No other controls; the page is a *handout stand*, not an interface (voice-first claim must survive judge scrutiny). Placeholder div reserved for the stretch exhibit screen.
- **Stretch (separate ticket, only if M3 lands early): inbound phone number** via ElevenLabs' Twilio integration — "call your interviewer" demo beat. Nothing in the MVP design may block this: keep all session logic keyed by ElevenLabs conversation id, not browser session.

## Agent configuration (as code)

Agent config lives in the repo (`voice/agent-config.json` + `voice/prompts/*.md`), applied via ElevenLabs API on deploy — **never hand-edited in their dashboard** (judged codebase: config drift = vibe coding).

- **Voice**: one named interviewer — working name **"Alex"** — for both modes. Pick a professional, warm-neutral voice from the library; pin the voice id in config. Modes differ in *behavior* (persona prompt sections), never in voice.
- **Model/latency**: default to ElevenLabs' recommended conversational model settings; prioritize low first-token latency over expressiveness (an interviewer speaks plainly).
- **Barge-in: enabled.** Candidates interrupting mid-question is realistic and a demo feature. When barged-in, the agent yields immediately; no "let me finish."

## System prompt structure (`voice/prompts/`)

Three layered parts, concatenated at session start; the dynamic brief arrives via tool results:

1. `persona.md` — Alex's identity: professional case interviewer, concise, natural spoken register (no lists, no markdown-speak, numbers read naturally), never breaks character, never mentions being an AI or the tooling. Includes latency-masking phrases for slow tool calls ("let me check what we have on that…") and the real-company disclaimer delivery.
2. `mode-guided.md` / `mode-realistic.md` — the behavior deltas only (coaching interjections allowed vs forbidden; hint timing per M2's policy table).
3. `protocol.md` — the tool protocol: **before speaking in a new phase, call `get_phase_brief`; speak only within the brief**; scripted fields (`prompt_spoken`, `setup_spoken`, data drops) are read faithfully with natural pacing, not paraphrased (the coherence guard validated those exact numbers); everything else is improvised in persona. Report candidate signals (`advance`), questions (`ask`), math (`quant`), and silence per the rules below.

## Server tools (ElevenLabs → backend webhooks)

Map 1:1 onto M2's endpoints — `start_session`, `select_case`, `get_phase_brief`, `ask_clarifying`, `report_advance`, `submit_math`, `report_silence`, `end_case`. Tool descriptions in config must tell the agent *when* to call each (e.g., `ask_clarifying`: "whenever the candidate requests information about the client, market, or case facts — always call this rather than answering from your own knowledge"). That last clause is load-bearing: **the agent must never answer case questions from the LLM's world knowledge** — with a real company as client, the model may genuinely know facts that contradict the pack.

## Silence handling (detection here, policy in M2)

Configure the agent's no-input behavior to *not* auto-reprompt on its own schedule. Instead: on silence past the platform's minimum detection window, call `report_silence { seconds }`; M2 returns `wait | check_in | nudge | hint {content}` per its phase-dependent ladder, and the agent acts accordingly. When the candidate requests thinking time, call `report_advance { reason: "thinking_time" }` and stay silent until they resume or M2's grant expires. If the platform's native silence timers can't be fully disabled, set them to the maximum and treat native reprompts as `check_in`-equivalent (document actual platform behavior in the README — this is the spec's biggest platform-risk unknown; verify it FIRST, before building anything else).

## Transcript + events

Every finalized user/agent utterance posts to M2 `/event` as `candidate_turn` / `interviewer_turn` with timestamps (ElevenLabs conversation events or post-call webhook; prefer live streaming so the debrief needs no post-processing wait). M4's voice metrics (silence gaps, talk-time ratio) derive from these events — timestamp fidelity matters; use platform-provided times, not server receipt times, where available.

## Session flow

1. Page load → `start_session` on first mic press → Alex greets, offers Guided/Realistic by voice, then the case menu (both from M2's brief).
2. Interview proceeds per M2 phases; Alex ends the case with a natural close ("that's everything from me — let's talk about how it went").
3. Debrief: Alex delivers M4's spoken debrief (fetched via `end_case`), then tells the candidate where the written scorecard is.

## Error handling

- Backend tool call fails/times out → Alex stays in character ("give me one second…" → retry once → "we're having a technical moment — let's pause here" rather than hallucinating case content).
- Session resume after page reload: out of scope; a dropped session restarts.

## Tests (acceptance criteria)

Voice UX is manual; the wiring is not:
1. Webhook-level integration: scripted tool-call sequences against real M2 with the SaveRite fixture — full case start→debrief driven via curl, asserting M2's event log is complete and ordered.
2. Config validation: agent config applies cleanly from the repo via API to a fresh agent (idempotent deploy script).
3. Manual test script (`voice/TESTING.md`): 10-minute checklist — barge-in during prompt, thinking-time request honored silently, paraphrased ledger question, an out-of-ledger question (verify live-fetch phrasing), deliberate wrong math (verify probe-then-reveal), full silence ladder.
4. Platform-risk spike (DO FIRST, timeboxed 45 min): confirm on the real platform (a) silence-timer control sufficient for the report_silence design, (b) server-tool round-trip latency mid-conversation, (c) transcript event availability. Findings go in the README; if (a) fails, escalate to the team immediately — the fallback (native reprompts as check-ins) changes the Guided/Realistic feel.

## Non-goals

Case logic of any kind (M2); scoring (M4); exhibit screen and phone channel (separate stretch tickets); multi-language; voice cloning.
