# M1 — Case Generator

Spec for the news→CasePack pipeline. Written for a Devin session; assumes the shared `types` package (M0) exists. Target output format: a `CasePack` exactly shaped like [`fixtures/saverite.json`](../../fixtures/saverite.json) — that file is the contract; when this spec and the fixture disagree, the fixture wins.

## Purpose

Turn this morning's business news into 2–3 casebook-quality practice case packs ("the menu"). Runs at session start and on demand; must complete a full menu in ≤ 90 seconds.

## Public interface

```ts
// the only two functions other modules may import
generateMenu(opts?: { count?: number /* default 3 */ }): Promise<CaseMenu>
// CaseMenu = { items: [{ id, spoken_teaser, case_type, company, source_published_hint }] }

getCasePack(id: string): Promise<CasePack>   // includes fixture ids, always available
```

Fixture packs from `fixtures/` are always loaded and available by id, and are the fallback if generation fails or yields < 2 viable packs (log the fallback loudly — never silently).

## Pipeline stages

Each stage is a separate, individually-testable function. No stage may call the LLM except Stage 4.

### Stage 1 — Headline pool (context.dev `/web/search`)

- `POST https://api.context.dev/v1/web/search` — **note the `/v1`**: without it the API returns a misleading "API does not exist" 403.
- Params: `freshness: "last_24_hours"`, `numResults: 30`, `country: "ae"`, `includeDomains` from `config/press-allowlist.json` (Reuters, Bloomberg, CNBC, FT + Gulf News, The National, Zawya), query = OR-set of case-trigger terms (earnings, profit, margin, expansion, acquisition, launch, prices, restructuring).
- Do NOT enable `markdownOptions` at this stage (keeps it 3 credits for 30 results); scraping happens only for selected stories.
- Verified live 7 Aug 2026: this exact call returned 10/10 fresh stories for 1 credit.

### Stage 2 — Case-ability filter (no LLM; cheap heuristics + one classification call)

Score each headline 0–5, one point each:
1. Names a single company protagonist (title/description regex + Brand API resolvability).
2. Signals a decision or diagnosis, not just an event (trigger-term category match).
3. Maps to a preferred case type — profitability > growth/market-entry > investment go/no-go (keyword rubric in `config/case-triggers.json`).
4. Result `relevance: high` from search.
5. Industry on the supported whitelist — resolve via `POST /v1/web/naics` (or the EIC tags returned inline by Brand API); whitelist codes in `config/industry-whitelist.json` (retail, CPG, pharma, airlines, tech, financial services, healthcare, O&G).

Take the top N=4 (one spare). Emit the scored list to the log — judges should be able to see why stories won.

### Stage 3 — Story grounding (context.dev scrape + brand)

Per selected story:
- Scrape the article: `POST /v1/web/scrape/markdown` with `useMainContentOnly: true` (1 credit). Extract publication date from article content/URL when present (search results carry no timestamp).
- `POST /v1/brand/retrieve` on the company domain (10 credits): firmographics, EIC industry, stock ticker/exchange, description → becomes `anchor_facts`.
- Output per story: `StoryFacts { company, domain, headline, article_md, published_at?, anchor_facts }`.

### Stage 4 — Case authoring (single Claude call per story, `claude-sonnet-5`)

One structured-output call: `StoryFacts` in, draft `CasePack` out. Prompt requirements (prompt lives in `prompts/author-case.md`, versioned, reviewed by a human before merge):

- **Case type**: the Stage-2 assigned type; **difficulty fixed at "medium"** (one two-layer insight; clean arithmetic ~5%-vs-20% contrast style).
- **Client naming**: the REAL company is the client. Real figures from `anchor_facts` go in `meta.anchor_facts`; all quant-module numbers are SYNTHESIZED but magnitude-anchored (within ~2x of real scale where known). The pack must include a one-line spoken disclaimer for the interviewer: figures are simplified for the exercise.
- **Hidden insight**: pick ONE pattern from the menu — segmentation reveal / sunk cost / identical-financials tiebreaker / the gap — and construct numbers so exactly that insight emerges. Never freestyle a twist.
- **Quant delivery**: verbal only, scripted as speech in the four-beat pattern (bridge-in → orientation → paced data → task directive), ≤ 5 line items × ≤ 3 periods, round jot-down-able numbers, plus one *earned* `followup_data_drop`.
- **Ledger**: 5–8 entries with topic tags; facts from the article go in the ledger verbatim-faithful (no invented real-world claims — synthesized numbers live only in the quant module).
- **Every section** of the fixture schema populated: rubric with buckets-to-avoid, layered insight with kicker + scoring line, brainstorm module, recommendation with risks AND mitigations AND next steps.

### Stage 5 — Coherence guard (no LLM for checks; one LLM repair pass max)

Programmatic checks on the draft pack:
- Quant arithmetic: recompute `worked_solution` from `setup_spoken`'s numbers (parse the scripted speech); totals/growth rates must match.
- Exactly one anomalous driver: the insight's target line item must be the only one deviating from trend.
- Ledger consistency: no ledger answer contradicts quant numbers or the prompt.
- Completeness: every required schema field non-empty; risks/mitigations/next_steps each ≥ 2.
- Speech lint: no markdown syntax, digits-heavy tables, or URLs inside any `*_spoken` field.

On failure: one repair round-trip to the LLM with the specific violations; if still failing, drop the pack (spare story from Stage 2 backfills). Log every rejection with reasons.

## Credits budget

Per menu of 3: ~3 (search) + 3×1 (scrape) + 3×10 (brand) + 3×10 (classify) ≈ **70 credits**. Hourly regeneration all day ≈ 700. Non-issue against 50K; do not micro-optimize.

## Configuration

`.env`: `CONTEXT_DEV_API_KEY` (server-side only — never ship to a browser bundle), `ANTHROPIC_API_KEY`. All allowlists/trigger terms under `config/` as JSON, not hardcoded.

## Error handling

- context.dev 408 = cold cache: retry once (docs: "the second hit is warm"). 429: respect `Retry-After`.
- Any story failing any stage is dropped and logged, never patched by hand-waving.
- `generateMenu` must never throw to callers: worst case returns fixture-only menu with `degraded: true`.

## Tests (acceptance criteria)

1. Unit: case-ability scorer on a committed fixture set of ~10 real headlines (captured from the 7 Aug live test) with expected scores.
2. Unit: coherence-guard checks against (a) `fixtures/saverite.json` → all pass; (b) committed mutated copies (broken arithmetic, two anomalous drivers, empty risks) → each specific check fails.
3. Integration (mocked context.dev): full pipeline over a canned search response → ≥ 2 valid packs.
4. Live smoke (manual, on the day): `generateMenu()` against real API, human-skims one pack.

## Non-goals

Industry-on-request, difficulty selection, exhibit/chart generation, Monitors-driven refresh (stretch, separate ticket), `/news/search` (403 on free tier — ask sponsor; if unlocked, it replaces Stage 3's date extraction and adds press-release filtering, behind an env flag).

## Open questions for the team

- Model access: assumes an Anthropic key is available on the day; else swap Stage 4 to whatever LLM the team standardizes on (prompt is provider-agnostic).
- Whether hourly background regeneration runs during the hackathon or menu is generated on each session start only (default: on session start).
