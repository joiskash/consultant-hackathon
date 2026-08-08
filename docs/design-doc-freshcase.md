# FreshCase — Design Doc

**Voice-first case interview practice, generated live from today's news.**
Dubai AI Hub Builder Lab 3 · Saturday 8 Aug 2026 · Team of 5 · Build window 10:00–15:00 (5 hours)

Working name "FreshCase" — rename freely on the day.

---

## 1. One-liner and pitch

> Every case prep tool sells you a canned case library. Candidates grind the same 50 cases, and interviewers know it. FreshCase generates a rigorous, casebook-quality mock case **from this morning's business news** — with real companies, real numbers fetched live mid-conversation — and runs it as a spoken interview that ends with evidence-backed coaching.

Why the sponsor stack is structural, not decorative:

- **context.dev** — the case *cannot exist* without live web data: headline pool, company numbers, and live answers to clarifying questions the case pack didn't anticipate.
- **ElevenLabs** — a case interview is a spoken performance: interruptions, thinking aloud, silence under pressure. The debrief measures things only voice can (silence gaps, time-to-framework, talk-time ratio).
- **Devin** — the entire codebase is Devin-built (five seats in parallel), with steering artifacts committed as first-class deliverables.

Competitive landscape (checked July 2026): CaseTutor, ConsultingPrepAI, CasePrepared, Soreno all do voice AI case interviews — **every one runs a static case library**. "A fresh case from today's news, unmemorizable by construction" is the wedge. Live-news grounding also trains the current-affairs fluency MBB partners actually probe in final rounds.

---

## 2. Product spec

### 2.1 The mini-case format (~8–10 min)

Compressed but complete arc, exercising every architectural component:

1. **Session setup (voice):** user picks mode — **Guided** (mid-case coaching, for first-timers) or **Realistic** (cold interviewer, calibrated hints only when stuck).
2. **Case menu:** agent offers 2–3 cases pre-generated from today's headlines ("I've got three from this morning: a Gulf airline's fleet decision, a retailer's margin collapse, an EV price war — pick one").
3. **Prompt:** 2–4 sentences — client, situation, explicit ask, optional constraint.
4. **Clarifying questions:** answers come from the case pack's ledger; questions outside the ledger trigger a **live context.dev fetch** ("Has the client's share been declining?" → agent actually looks it up).
5. **Structure:** candidate lays out a framework aloud; interviewer probes it.
6. **Quant module (verbal):** numbers read aloud, casebook-style ("Please read out the #'s; do not share this page" — Fuqua). One calculation chain with a pre-worked answer key.
7. **Recommendation:** elevator-pitch close — recommendation, risks + mitigations, next steps.
8. **Debrief:** spoken coaching + written scorecard (see §5).

**MVP is pure voice.** No screen. Case selection therefore *prefers* cases designed for verbal quant (parameter lists, sizing — see §3). **Stretch goal:** companion "handout" screen that renders an exhibit chart when the interviewer offers one — display only, no controls, so the voice-first claim survives.

### 2.2 Explicitly out of scope (MVP)

- Industry-on-request ("give me healthcare") — menu only.
- Charts/exhibits (stretch), accounts/history, multi-case progression tracking.

---

## 3. Case generation pipeline (news → case pack)

Runs at session start (and/or on a schedule) so the menu is instant and mid-case latency is tiny.

### 3.1 Sourcing

Source-agnostic fetch via context.dev over a configurable list. **Global business press** (Reuters, Bloomberg, FT, CNBC) guarantees supply of case-able stories with public numbers; **regional sources** (Gulf News, The National, Zawya) seeded so the demo can say "built from this morning's Gulf News."

### 3.2 Case-ability filter

Explicit, testable scoring step (headline → score), not vibes inside one big prompt. A story is case-able when it has:

- (a) a single client-like protagonist,
- (b) a quantifiable objective or constraint,
- (c) a decision or diagnosis (not just an event),
- (d) 2+ plausible segments/options so a hidden-insight pivot can be planted,
- (e) an industry with standard revenue/cost structures (retail, CPG, pharma, airlines, tech, FS, healthcare, O&G — the casebook industry-primer whitelist).

**Preferred case types** (from analysis of Stern 2019 / Fuqua 2019–20 / IESE 2020 casebooks):

1. **Profitability / cost diagnosis** — most mechanical template (P = R − C tree → segment → one anomalous driver → fix + risks); maps directly to margin-pressure/earnings-miss headlines; the interview default "medium."
2. **Growth strategy / market entry** — largest category (~⅓ of casebook cases); news constantly supplies triggers; embeds verbal market sizing naturally.
3. **Investment go/no-go (incl. simple M&A)** — announced deals/capex convert cleanly to option comparison with designed twist.

Deprioritized: pure pricing and pure ops (need proprietary detail news rarely provides); standalone sizing (a module, not a case).

### 3.3 Case pack schema (adapted 9-part casebook skeleton)

```
CasePack {
  meta:            { source_headline, source_urls, company, industry, case_type,
                     difficulty: {qualitative, quantitative}, fixture? }
  prompt:          { spoken (2–4 sentences), constraint? }
  clarifying_ledger: [ { topics[], answer } ]   // topic TAGS, not literal questions —
                                               // the engine matches paraphrased questions to entries
  ledger_miss_policy:  live_fetch | improvise_neutral   // fixtures can't live-fetch
  framework_rubric:  { expected_buckets[], acceptable_buckets[],
                       buckets_to_avoid_dwelling_on[], great_candidate_signals[] }
  quant_module:    { delivery: "verbal", setup_spoken,   // numbers scripted AS SPEECH, not raw arrays
                     expected_setup, worked_solution,
                     followup_data_drop: { trigger, spoken, takeaway } }  // earned by asking
  hidden_insight:  { pattern, layers[],                  // insights are often 2-stage reveals
                     kicker: { trigger, spoken, insight }, scoring }
  brainstorm_module: { prompt_spoken, sample_answers[], note }   // real cases have one; ours must
  recommendation_key: { expected_recommendation, supporting_logic,
                        risks[], mitigations[], next_steps[] }
}
```

Schema lessons from authoring the first fixture (SaveRite, below): the ledger needs **topic tags** (candidates paraphrase; exact-question matching would fail), verbal quant must be **scripted as speech** following a four-beat delivery pattern — *bridge-in* (tie to what the candidate just said), *orientation* (name what the data is before any numbers), *data* (paced, jot-down-able), *task directive* (what to extract and how it connects to the client's problem) — with a designed *earned* follow-up data drop, hidden insights are **layered reveals** with a kicker rather than one fact, and a **brainstorm module** was missing from the schema entirely despite appearing in every casebook case.

**First fixture:** [fixtures/saverite.json](../fixtures/saverite.json) — adapted from Fuqua's "Shop 'til you(r profits) drop" (SaveRite, pp. 33–41): profitability type (our #1 preferred), 3-year P&L compressible to verbal delivery, two-layer segmentation reveal (COGS → dry-commodities purchase price) with a private-brand kicker, and an explicit buckets-to-avoid rubric. Its three exhibits compress into `setup_spoken` + an earned `followup_data_drop`, validating the voice-only format. Attribution note in the file; test/fallback use only.

**Hidden-insight pattern menu** (generator picks one; never freestyles):

- *Segmentation reveal* — aggregate decline traces to one segment/brand/line item.
- *Sunk-cost trap* — an "already spent" number that must be excluded.
- *Identical financials, qualitative tiebreaker* — two options tie on math; strategic fit decides.
- *The gap* — the numbers reach only 80% of the target; noticing the shortfall unprompted is the insight.

Numbers are **synthesized to be clean and consistent** (casebook math-primer rule: pick numbers easy to work with; exactly one branch misbehaves), anchored to real magnitudes from the source story.

### 3.4 context.dev API mapping (researched 3 Aug 2026)

Their platform is broader than "scraping" — the pipeline should use five distinct services:

| Pipeline step | context.dev API | Cost |
|---|---|---|
| Headline pool | **Search API** — web search + scrape results in one call, domain-filterable to our press list | ~1 credit/page |
| Story facts | **Extract API** — pass a JSON schema, get schema-shaped data back; our `StoryFacts` schema (company, numbers, segments, decision) becomes an API call, not a hand-rolled LLM parse | 10 credits |
| Industry whitelist check | **Classification API** — NAICS/SIC/EIC codes per company; makes the case-ability filter's industry check (§3.2e) deterministic and unit-testable | ~10 credits |
| Company grounding | **Brand API** (`POST /brand/retrieve`) — firmographics, stock ticker/exchange, description; anchors synthesized numbers to real magnitudes. Logos/colors feed the stretch exhibit screen and the scorecard header (case branded with the real client's identity) | 10 credits |
| Clarifying live-fetch | **Scrape-to-Markdown** (`/web/scrape/markdown`) | 1 credit |

**Breaking-news refresh (Monitors API):** monitors watch a URL and fire a webhook on change. Pointed at press front pages, new headlines trigger case-pack regeneration through the day — the menu literally updates as news breaks ("this case is from a story published 40 minutes ago"). Cheap to add (webhook → re-run M1) and a strong Best-Use-of-Live-Web-Data beat; stretch, behind the exhibit screen in priority.

**Credit budget:** 50K credits/team. Full case generation ≈ 30–50 credits (search+scrapes+extract+classify+brand); a session with live clarifying fetches ≈ 5–10 more. Even regenerating the menu hourly all day burns <2K. Credits are not a constraint — design for quality, not thrift.

**Live API verification (free-tier key, 7 Aug 2026):**

- Base URL is **`https://api.context.dev/v1`** (requests without `/v1` fail with a misleading "API does not exist" 403 — remember this when Devin debugs).
- **Recency filtering: solved.** `POST /web/search` accepts `freshness: "last_24_hours" | "last_week" | "last_month" | "last_year"`, plus `includeDomains` allowlist, `country: "ae"` localization, Google-style operators in the query, and `queryFanout` for broader recall. Verified live: a 24-hour search over our press allowlist returned 10 genuinely fresh, mostly case-able stories for **1 credit** (search costs 1 credit per 10 results; scraping results to markdown via `markdownOptions.enabled` is what costs 1/page). Response includes per-result `relevance: high|medium|low` — free pre-filter signal for M1.
- **Caveat:** `/web/search` results carry **no published-at timestamp** (only url/title/description/relevance). For the "published 40 minutes ago" demo line, date the article from its content/URL, or use the News API (below).
- **Cache control:** `markdownOptions.maxAgeMs` (default 1 day) — set `0` to force a fresh scrape for clarifying fetches; leave default for generation. This plus `/utility/prefetch` implements our warm-cache strategy.
- **Undocumented-but-in-spec APIs** (found in their OpenAPI file): `POST /news/search` — entity-scoped company news (by name/domain/ticker/ISIN) with exact `published_at`, article-type filters (editorial/press-release/regulatory-filing), UAE publisher filter, story dedup — the ideal "step 2: deep-dive the chosen company" call and exact-timestamp source. **Returns 403 on the free tier**; ask the context.dev team on the day whether hackathon keys unlock it. Also in spec: `/web/competitors` (competitor discovery — could seed the case's competitive-dynamics facts) and a WebDBs API (schema-defined tables auto-maintained from web pages with webhooks — an alternative to Monitors for the self-refreshing menu).

**Integration constraints (from their docs):** API key is server-side only ("never call from a browser") — matches our backend-proxy architecture. 408 = cold-cache timeout, "retry once; the second hit is warm" — so the engine's live-fetch wraps one retry, and we **prefetch/warm the source pages at session start** so mid-case fetches hit warm cache. Official TypeScript SDK (`npm install context.dev`); MCP server available, meaning Devin can call context.dev directly while developing/testing M1.

### 3.5 Coherence guard

A validation pass checks the pack's numbers are internally consistent (ledger answers don't contradict the quant module; worked solution actually follows from the given data). Cheap to build, high value to judges — it's a *test for generated content*.

---

## 4. Interview engine

Server-side state machine behind tool endpoints; ElevenLabs Agents is the mouth and ears (§6).

- **Phases:** menu → prompt → clarifying → structure → quant → recommendation → debrief. The engine tracks current phase, releases ledger/quant data only when earned, and advances on candidate signals ("that's my framework" / interviewer judgment).
- **Clarifying escape hatch:** question outside the ledger → live context.dev fetch, answer cached into the session. (Also the demo's money moment.)
- **Stuck policy:** escalating calibrated hints after sustained flailing/silence — mirroring good human interviewers. Hint usage is logged and feeds the Drive score.
- **Personas:** same state machine, two intervention policies. *Realistic* — professionally cold, no mid-case feedback, hints only via stuck policy. *Guided* — brief in-the-moment course-corrections ("before we go on — is that structure MECE?"), for first-timers.
- **Time valves** (IESE convention): if the case is dragging, the interviewer can hand over a number instead of making the candidate derive it.

---

## 5. Debrief and scoring

**Rubric — five dimensions**, template drawn from our own human mock-interview feedback form (Ryan Mock Interviewer Feedback Form, NLCG):

| Dimension | Scorer checklist (answered against transcript, with quotes) |
|---|---|
| **Structure** | Reiterated prompt? Asked case-specific clarifying Qs? Framework logical, MECE, tailored (not cookie-cutter)? Avoided irrelevant buckets? |
| **Quantitative** | Correct setup? Arithmetic accuracy and speed? Sanity-checked? Found the exhibit/number takeaway? |
| **Insight & Drive** | Found the planted hidden insight — unprompted, hinted, or missed? Led the case or needed prompting? |
| **Closing** | Clear, concise recommendation? Justified? Risks *and* mitigations? Next steps? |
| **Communication** | Thought process narrated? Top-down synthesis? Awkward-silence level? |

**Mechanics:** scorer takes full transcript + the case pack's answer key. Because we authored the case, scoring is grounded ("the expected framework had a mix-shift branch; yours didn't") — not LLM vibes. Every finding must **quote the candidate verbatim** as evidence and attach a specific improvement drill.

**Voice-only metrics** (auto-computed; impossible in a text interface — say this in the pitch): time-to-framework, silence-gap count/duration, talk-time ratio, calculation elapsed time.

**Output:** spoken debrief highlights + a written scorecard (markdown/PDF) mirroring the feedback-form layout.

---

## 6. Architecture

```
┌─────────────────────┐   server tools (webhooks)   ┌──────────────────────────────┐
│ ElevenLabs Agents    │ ──────────────────────────► │ Backend (case engine)         │
│ (STT, TTS, turn-     │  get_case_menu              │  • interview state machine    │
│  taking, barge-in,   │  select_case                │  • case pack store (session)  │
│  persona prompt)     │  get_clarifying_answer      │  • live-fetch service ────────┼──► context.dev
│                      │  advance_phase              │  • scorer / debrief           │
│                      │  get_debrief                │  • case generator ────────────┼──► context.dev + LLM
└─────────────────────┘                              └──────────────────────────────┘
```

- **ElevenLabs Agents platform** (not roll-your-own STT/TTS): turn-taking and barge-in — the hardest voice UX — come free and polished. Candidates interrupting the interviewer is a feature, not a bug.
- **Latency posture:** case pack pre-generated at session start; mid-case tool calls are dictionary lookups except the clarifying live-fetch (which is allowed to say "let me check that for you" — realistic anyway).
- **Proposed stack** (team can veto on the day): TypeScript monorepo — small Node/Express (or Next.js API-routes) backend, Claude API for generation/scoring, ElevenLabs Agents config as code in the repo. One deploy (Railway/Render/Vercel + ngrok fallback for webhooks).

### 6.1 Module decomposition — five parallel Devin seats

Interfaces are the contract; modules touch only their own directory plus a shared `types` package defined **first**. Full Devin-ready tickets exist for every module in [`specs/`](specs/) (M0–M5).

| # | Module | Contents | Depends on |
|---|---|---|---|
| M0 | `types` + repo scaffold | CasePack schema, tool payloads, session state types | — (built first, ~30 min, all hands) |
| M1 | `generator` | news fetch, case-ability filter, pack synthesis, coherence guard | M0, context.dev |
| M2 | `engine` | state machine, ledger release, stuck policy, live-fetch service | M0, context.dev |
| M3 | `voice` | ElevenLabs agent config, persona prompts (both modes), webhook wiring | M0, M2's tool contract |
| M4 | `scorer` | rubric scorer, voice metrics, scorecard renderer, debrief script | M0 |
| M5 | `demo & glue` | deploy, seed scripts, fixture case packs, README, demo video assets | all |

Fixture case packs (2–3 hand-checked, committed) let M2–M4 build and test **without** waiting on M1 — the critical de-risking move.

---

## 7. Devin strategy and steering artifacts

Posture: **Devin as primary builder** (the hackathon's explicit intent; every builder has a Max seat). Humans architect, spec, review, and integration-test.

Committed steering artifacts — simultaneously the "Best Devin Use" case and the anti-vibe-coding evidence for codebase judges:

- This design doc in the repo root.
- Per-module spec tickets (`/specs/M1-generator.md`, …) — interface, acceptance criteria, test expectations — written before Devin starts.
- Devin's work lands as PRs, human-reviewed; PR history preserved, not squashed away.
- README section: which modules were Devin-built, how they were specified and steered, what was rejected/redone and why.
- Tests as part of every module spec (the coherence guard, filter scoring, state-machine transitions are all cheaply testable).

---

## 8. Prize mapping

| Prize | Our story |
|---|---|
| Best Use of Live Web Data (context.dev) | **Primary target.** Five distinct services used structurally (§3.4): Search for the headline pool, schema Extract for story facts, Classification for the case-ability filter, Brand for real-magnitude anchoring, Scrape for live clarifying answers — plus Monitors-driven breaking-news menu refresh as stretch. |
| Best Project built with ElevenLabs | Agents platform used deeply (barge-in, personas, server tools), plus voice-native metrics in the debrief. |
| Best Devin Use | Five-seat parallel build with committed steering artifacts (§7). |
| Winning team / codebase health | Modular decomposition, typed contracts, tests, generated-content validation, spec-first workflow. |

---

## 9. Day-of plan (build 10:00–15:00)

| Time | Milestone |
|---|---|
| 10:00–10:30 | All hands: agree names/stack, commit design doc + `types` + module specs; create fixture case packs from a casebook example |
| 10:30–12:30 | Five Devin seats on M1–M5 in parallel; humans review PRs continuously |
| 12:30–13:30 | Integration: voice ↔ engine on a fixture pack (first end-to-end spoken case) |
| 13:30–14:15 | Live generation path in (M1 → menu); debrief wired; stretch: exhibit screen only if green |
| 14:15–15:00 | Record demo video (one full mini-case + debrief), polish README, submit |

**Team roles (5):** 1 architect/integrator (owns contracts + merges), 1 voice lead (M3 + ElevenLabs account), 1 data lead (M1 + context.dev), 1 engine/scorer lead (M2/M4 review), 1 product/demo lead (M5, video, pitch — also the demo candidate, ideally with case experience).

### Demo plan

- **3pm video:** one complete mini-case arc (compressed with cuts) + the scorecard moment.
- **Live demo (if shortlisted):** the bulletproof 90 seconds live — case menu built from headlines *published during the hackathon*, take the prompt, ask one clarifying question that visibly triggers a live fetch — then jump to the debrief beat. Full-case-live is the fallback-up option if rehearsals feel solid; team decides on the day.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| ElevenLabs webhook/tool latency mid-case | Pre-generated packs; only the clarifying fetch is live, masked by natural interviewer speech |
| Generated case is incoherent on demo day | Coherence guard + hand-checked fixture packs as guaranteed fallback menu items |
| No case-able headlines that morning | Global press pool makes this near-impossible; fixtures as last resort |
| Devin stalls on ElevenLabs integration | M3 is the riskiest module — voice lead pairs closely; fixture-driven contract lets everything else proceed |
| Venue noise breaks live demo | Directional mic; the 90-second live beat is short; video carries the full arc |
| Team wants a different idea at formation | This doc is the pitch; §1 is rehearsed as a 60-second spiel |

## 11. Open questions for team formation day

- Stack veto (TS vs Python) based on team fluency.
- Who's the demo candidate (needs case-interview comfort — Abdullah default).
- ElevenLabs voice selection: one interviewer voice or distinct Guided/Realistic voices.
- Name. (FreshCase, CaseWire, DayCase, …)
