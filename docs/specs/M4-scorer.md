# M4 — Scorer & Debrief

Spec for the post-case evaluation module. Written for a Devin session; consumes M2's debrief handoff blob (transcript + event log + case pack) and produces the spoken debrief script (voiced by M3) and the written scorecard. Fully buildable against the SaveRite fixture plus a scripted transcript — no dependency on M1/M3 being live.

Contract anchors: [M2 spec](M2-engine.md) event types; [`fixtures/saverite.json`](../fixtures/saverite.json) answer keys; the rubric template below (derived from the team's real mock-interview feedback form).

## Purpose

Turn a finished case session into targeted, evidence-backed coaching: every claim quotes the candidate's actual words or cites a measured event — never vibes. This module is the product's second act; the demo's emotional payoff is hearing your own words quoted back.

## Public interface

```ts
score(handoff: DebriefHandoff): Promise<DebriefResult>
// DebriefResult = {
//   scorecard: Scorecard          // structured; also rendered to markdown
//   spoken_debrief: string        // Alex's script, 60–90s, top-3 findings
//   metrics: VoiceMetrics         // deterministic, computed before any LLM call
// }
```

## Two-stage design: deterministic metrics first, LLM judgment second

### Stage 1 — Deterministic metrics (no LLM; pure functions over the event log)

`VoiceMetrics` computed from timestamps and typed events:
- **time_to_framework**: prompt-end → candidate's structure presentation start (the form's "~2 min to create framework" line, automated).
- **silence profile**: count + total duration of unannounced `silence_crossing` events, per phase; announced thinking time reported separately (thinking time is GOOD — never penalized, listed as its own line).
- **talk_time_ratio**: candidate vs interviewer speaking time.
- **calc_elapsed**: quant data-drop end → verdict `correct`.
- **hints_consumed**: count + max ladder level, from `hint_given` events.
- **insight_layers_reached**: from `ledger_release` / data-drop / kicker events vs the pack's `hidden_insight.layers`.
- **math_record**: verdicts sequence incl. recovery (`probe` → self-corrected is a *positive* signal, surfaced as such).

These are facts. They are computed first, passed INTO the LLM stage as ground truth, and rendered on the scorecard verbatim. The LLM may interpret them, never restate them differently.

### Stage 2 — Rubric evaluation (one structured-output Claude call)

Input: transcript, metrics, and the pack's answer keys (`framework_rubric`, `worked_solution`, `hidden_insight.scoring`, `recommendation_key`, `brainstorm_module`). Output: `Scorecard`. The prompt (`prompts/score-case.md`, versioned, human-reviewed) instantiates the five-dimension rubric — each dimension is the feedback form's checklist, answered against evidence:

| Dimension | Checklist (each item answered: yes/no/partial + evidence) |
|---|---|
| **Structure** | Reiterated prompt? Case-specific clarifying questions? Framework logical + MECE? Tailored to the client, not cookie-cutter? Avoided the pack's buckets-to-avoid? |
| **Quantitative** | Correct setup? Arithmetic accuracy (from math_record — do not re-judge)? Reasonable pace (calc_elapsed)? Stated the takeaway, basic and second-order? |
| **Insight & Drive** | Layers reached (from metrics — do not re-judge)? Unprompted vs hinted (hints_consumed)? Drove the case forward or waited to be led? |
| **Closing** | Clear, concise recommendation? Justified from case evidence? Risks AND mitigations? Next steps? |
| **Communication** | Thought process narrated? Top-down synthesis? Silence profile (from metrics)? Concise vs rambling? |

**Hard output rules** (enforced by schema + validator, not just prompt):
- Band per dimension: `strength | on_track | needs_work`. **No numeric scores anywhere.**
- Every checklist answer carries `evidence`: a **verbatim transcript quote** (with timestamp) or a named metric. A claim without evidence fails validation.
- Every `needs_work` item carries a `drill`: one concrete practice action ("next case, before touching the numbers, say the takeaway you expect to find"), not generic advice ("improve your math").
- Where the event log already decided something (math verdicts, hint counts, layers reached), the LLM interprets significance but may not contradict the record.

### Validator (between LLM and output)

Programmatic checks mirroring M1's coherence guard: every quote actually appears in the transcript (fuzzy match ≥ 0.9 to tolerate ASR punctuation); every metric cited matches Stage 1's values; all five dimensions present; every needs_work has a drill. One repair round-trip on failure, then fall back to a metrics-only scorecard with an apology line (never ship fabricated quotes — this validator is the anti-hallucination story for the judges).

## Outputs

- **Written scorecard** (`scorecard.md`, rendered from the structure): header with case title, source headline + "generated from news published <date>", mode, duration; the five dimensions in feedback-form layout (band, checklist findings with quotes, drills); metrics table; footer noting figures were synthesized for the exercise. Layout mirrors the team's human feedback form — same section order, same guidance-question phrasing.
- **Spoken debrief script**: exactly three findings — the candidate's single best moment, then the two highest-leverage gaps — each with its quote spoken naturally ("at one point you said… — that's exactly the instinct we want") and its drill; closes by pointing to the written scorecard. 60–90 seconds when voiced; hard cap 200 words. Tone rules live in the prompt: direct, specific, warm on the strength, unsparing but constructive on gaps — never hedged filler ("overall pretty good!").

## Types (add to M0)

`DebriefHandoff`, `VoiceMetrics`, `Scorecard { dimensions: [{ name, band, findings: [{ item, answer, evidence, drill? }] }] }`, `DebriefResult`.

## Tests (acceptance criteria)

1. Metrics unit tests: hand-built event logs with known timings → exact expected `VoiceMetrics` (incl. thinking-time-not-penalized and probe-then-recovered cases).
2. Committed golden transcript: a full scripted SaveRite session (write one strong-candidate and one weak-candidate version) → snapshot-test the scorecard structure; assert the strong run yields ≥ 3 `strength` bands and the weak run's needs_work items all carry drills.
3. Validator tests: LLM output with a fabricated quote / contradicted metric / missing drill → each rejected; repair path exercised; fallback scorecard renders.
4. Spoken-debrief lint: ≤ 200 words, exactly 3 findings, no markdown syntax.

## Non-goals

Numeric scoring, cross-session progress tracking, PDF rendering (markdown is the artifact; nice-to-have later), scoring during the case (all post-hoc), interactive debrief Q&A (future — pairs with final-prep mode).
