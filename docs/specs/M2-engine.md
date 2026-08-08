# M2 — Interview Engine

Spec for the case state machine and session services. Written for a Devin session; assumes `types` (M0) and consumes `CasePack`s via M1's `getCasePack`. The voice layer (M3) is a thin client of this module: every behavior here is exposed through tool endpoints, and M3 contains **no case logic**.

Contract anchors: [`fixtures/saverite.json`](../../fixtures/saverite.json) for pack shape; [M1 spec](M1-generator.md) for menu/pack access.

## Purpose

Own everything a human case interviewer *decides*: what phase we're in, what information the candidate has earned, when to hint, how to react to silence and wrong math, and the event log the debrief (M4) scores from. The LLM speaks through M3; this module decides what it's allowed to say.

## Public interface (HTTP endpoints, consumed by M3's ElevenLabs server-tools)

```
POST /session            { mode: "guided" | "realistic" }        -> { session_id, menu }
POST /session/:id/select { case_id }                             -> { prompt_spoken, disclaimer_spoken }
POST /session/:id/ask    { question_text }                       -> ClarifyingAnswer (see Ledger below)
POST /session/:id/event  { type, payload }                       -> { ack }        // transcript turns, silence reports
POST /session/:id/advance{ to_phase?, reason }                   -> PhaseBrief     // next phase's interviewer briefing
POST /session/:id/quant  { candidate_math_text }                 -> QuantVerdict   // see Wrong math
GET  /session/:id/state                                          -> full session state (debug + M4)
POST /session/:id/debrief                                        -> handoff blob for M4 (transcript + events + pack)
```

`PhaseBrief` is the engine's core output pattern: for the current phase it returns what the interviewer may say (scripted `*_spoken` fields from the pack), what it must withhold, the phase's coaching policy for the active mode, and its soft time guidance. M3 injects the brief into the agent's context; the agent improvises *within* it.

## State machine

Phases: `menu → prompt → clarifying → structure → quant → brainstorm → recommendation → debrief`.

- **Candidate-led, no hard caps.** Transitions fire on candidate signals ("that's my framework", asks for data, "ready to conclude") detected by the agent and reported via `/advance`. The engine validates legality (e.g., no quant before structure) but **never force-advances on time**. Per-phase budgets exist only as *soft guidance strings* inside `PhaseBrief` (e.g., "quant is running long — consider offering the derived figure, IESE-style"), which the persona may act on or ignore.
- `config.strictTimeValves = false` and is the only supported value for MVP. The flag is reserved for a future "final-prep mode" (strict 2/1.5/2/2.5/1.5-minute budgets with valve enforcement) — the product distinction being *first-time practice* (loose, forgiving) vs *final interview prep* (exam conditions). Document the flag; do not implement enforcement.
- Every transition, hint, data release, and verdict is appended to an **event log** with timestamps — this log is M4's raw material. Design events first (see Types below); they are load-bearing.

## Silence policy (phase-dependent + announced thinking time)

Silence *detection* happens in M3 (ElevenLabs turn-taking); the engine owns *policy*, which M3 queries via `PhaseBrief`:

- **Announced thinking time**: if the candidate asks for time ("can I take a minute to structure?"), the interviewer grants it and stays silent up to 90s (structure/quant) — no check-ins. Expiry → gentle "where are you at?".
- **Unannounced silence**: dialogue phases (clarifying, brainstorm, recommendation) tolerate ~10s, then a natural check-in ("talk me through where your head's at"). Work phases (structure, quant) tolerate ~30s.
- **Escalation ladder** (per stall, resets on progress): check-in → orienting nudge (restate the task directive) → calibrated hint from the pack (see Hints). Never jumps straight to a hint.
- All thresholds in `config/silence.json`; log every threshold crossing as an event.

## Clarifying ledger + live fetch

`/ask` resolution order:
1. **Topic match** against `clarifying_ledger[].topics` — one small LLM classification call (question_text → matching entry id or none). Exact-string matching is forbidden; candidates paraphrase.
2. **Ledger hit** → return the entry's `answer` + mark it released (an entry released twice is fine; log both).
3. **Ledger miss, generated pack** → live fetch: context.dev `/v1/web/scrape/markdown` on the pack's `source_urls` (warm cache — M1 scraped them) with one LLM extraction against the question; if the article lacks it, fall back to `/v1/web/search` scoped to the client's domain + press allowlist, `freshness: last_week`. Return `{ answer, live_fetched: true, source_url }` — M3's persona phrases the latency naturally ("let me check what we have on that…"). Timeout 8s → miss.
4. **Ledger miss, fixture pack or fetch empty** → `{ answer: null, miss: true }`; persona replies neutrally ("good question — we don't have that data, but note it as something you'd want").

Guardrail: live-fetched answers are **facts about the real world**, never numbers that interact with the synthesized quant module. If the question targets quant-module territory (revenue/cost figures), answer from the pack or miss — never fetch. (This is the real-name-client honesty boundary from M1; enforce it with a topic-category check, and test it.)

## Hints (stuck policy)

Hints come only from pack content, orchestrated in a fixed ladder per phase: restate task directive → point at the neglected dimension from `framework_rubric` / `worked_solution.takeaway_basic` → reveal the layer (e.g., the `followup_data_drop` unearned). Each hint level is logged (M4's Drive score = insight layers reached minus hint levels consumed). Realistic mode requires two full stalls before the first pack hint; Guided mode hints one level earlier and may add technique coaching ("try segmenting before averaging").

## Wrong math (Realistic: probe once, then reveal)

`/quant` compares candidate math against `worked_solution`:
- Correct → `{ verdict: "correct" }`, persona acknowledges neutrally.
- Wrong, first attempt → `{ verdict: "probe" }`: persona says "walk me through that calculation again." Self-correction is logged as recovered (scores well).
- Wrong, second attempt → `{ verdict: "reveal", correct_figure }`: persona supplies the number and moves on — the case must proceed on sound numbers. Error + recovery status logged for the debrief.
- Guided mode: correct on first error, with the technique note.
- Comparison must tolerate rounding and stated-approximation ("about 20%" vs 20.3%) — numeric tolerance ±5% relative, not string match.

## Modes (single state machine, two policy tables)

| Behavior | Realistic | Guided |
|---|---|---|
| Mid-case feedback | never | brief technique coaching at defined moments |
| Hint ladder entry | after 2 full stalls | after 1 stall |
| Wrong math | probe once → reveal | correct immediately + technique note |
| Time guidance | persona hint only | persona hint only (same) |
| Debrief | full rubric (M4) | full rubric (M4) |

## Types (add to M0)

`SessionState`, `Phase`, `PhaseBrief`, `ClarifyingAnswer`, `QuantVerdict`, and `EngineEvent` — a discriminated union: `phase_transition | ledger_release | live_fetch | ledger_miss | silence_crossing | thinking_time_granted | hint_given{level} | math_verdict | candidate_turn | interviewer_turn`. All timestamped; the event log is append-only.

## Storage

In-memory session map + JSON snapshot to disk per event batch (survives a backend restart mid-demo; no database).

## Tests (acceptance criteria)

1. State machine: legal/illegal transitions; full scripted walkthrough of `saverite.json` from menu to debrief handoff, asserting the event log matches an expected sequence.
2. Ledger matching: ≥ 10 paraphrased questions against SaveRite's ledger (committed test set — e.g., "is the whole industry feeling this?" → competition entry); plus quant-territory questions asserting the no-fetch guardrail.
3. Wrong-math ladder in both modes, incl. rounding tolerance and the self-correction path.
4. Silence policy: simulated silence-crossing events produce the correct escalation sequence and never skip ladder steps.
5. Live-fetch path with mocked context.dev: hit, empty, and timeout branches.

## Non-goals

Voice/turn-taking mechanics, persona wording, TTS (all M3); scoring and debrief content (M4); strict time-valve enforcement (future final-prep mode); multi-session persistence.
