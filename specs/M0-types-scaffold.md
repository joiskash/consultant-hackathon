# M0 — Types & Repo Scaffold

Built FIRST, all hands, target ≤ 30 minutes on the day. Everything here is the contract the other four Devin sessions build against; after M0 merges, changes to `types` require the architect's sign-off (interface changes mid-build are how parallel sessions collide).

## Repo layout (TypeScript monorepo, npm workspaces)

```
freshcase/
  design-doc-freshcase.md      # this project's design doc, committed at root
  specs/                       # M0–M5 tickets (these files)
  packages/
    types/                     # THIS module: shared types + zod schemas, zero runtime deps
    generator/                 # M1
    engine/                    # M2  (owns the HTTP server; generator + scorer are libraries it imports)
    voice/                     # M3  (agent config, prompts, deploy script, web page)
    scorer/                    # M4
  fixtures/                    # saverite.json + future fixture packs + golden transcripts
  config/                      # press-allowlist.json, case-triggers.json, industry-whitelist.json, silence.json
  prompts/                     # author-case.md, score-case.md (versioned, human-reviewed)
  .env.example                 # CONTEXT_DEV_API_KEY, ANTHROPIC_API_KEY, ELEVENLABS_API_KEY
```

## Types package contents

All types defined as **zod schemas** with inferred TS types (runtime validation is load-bearing: M1's coherence guard, M4's validator, and webhook payload parsing all use them).

From the design doc §3.3 (fixture-shaped): `CasePack` and all sub-objects (`Meta`, `Prompt`, `ClarifyingLedgerEntry`, `FrameworkRubric`, `QuantModule`, `FollowupDataDrop`, `HiddenInsight`, `Kicker`, `BrainstormModule`, `RecommendationKey`).
From M1: `CaseMenu`, `CaseMenuItem`, `StoryFacts`, `CaseabilityScore`.
From M2: `SessionState`, `Phase` (enum), `PhaseBrief`, `ClarifyingAnswer`, `QuantVerdict`, `EngineEvent` (discriminated union — copy variant list from M2 spec), `Mode` (`guided | realistic`), `DebriefHandoff`.
From M4: `VoiceMetrics`, `Scorecard`, `ScorecardDimension`, `Finding`, `DebriefResult`.

**Acceptance test (the only M0 test that matters):** `CasePackSchema.parse(saveriteFixture)` passes, and a mutated copy (missing `brainstorm_module`) fails. If the fixture doesn't parse, fix the schema, not the fixture — the fixture is the contract.

## Conventions (README section, enforced in review)

- Modules import from `@freshcase/types` only — never from each other's internals; M1/M4 expose the single-function interfaces named in their specs.
- All LLM calls go through one thin `callClaude(prompt, schema)` helper in types/llm (structured output + one retry); no SDK calls scattered through modules.
- Every module: `npm test` green before PR; PRs reference their spec file.
- No secrets outside `.env`; `.env.example` kept current.
