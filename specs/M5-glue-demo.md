# M5 — Glue, Deploy & Demo

Owned by the product/demo lead's Devin session, but active all day: this ticket is the integration heartbeat, the submission package, and the demo. Least code, most coordination.

## Deploy

- One deployable: M2's server (which imports generator + scorer) + M3's static page, on Railway or Render; `ngrok` fallback ready if the platform fights us (ElevenLabs webhooks need a public URL — get this working by 11:00 with a stub endpoint, before the real engine exists).
- Deploy script + health endpoint (`/healthz` returns build sha + fixture count + last menu generation status).
- Secrets set in platform dashboard from `.env`; verify the context.dev key is NOT in the client bundle (grep the built page).

## Integration milestones (the day's heartbeat — M5 drives these, whole team swarms if one slips)

| Target | Milestone |
|---|---|
| 11:00 | Public URL live; ElevenLabs agent deployed from config; says hello via stub PhaseBrief |
| 12:30 | Full SaveRite fixture case speakable end-to-end (M2+M3 real, M1 fixtures-only, M4 stub) |
| 13:30 | Live-generated menu in (M1 real); debrief spoken + scorecard rendered (M4 real) |
| 14:15 | Feature freeze; record demo video; README polish |

## Submission package (due 15:00)

1. **Repo** — README front-loads the judging story: what it is (3 sentences), architecture diagram (the doc's §6 ASCII art is fine), **AI-engineering section**: link to specs/, note that all modules were Devin-built from these tickets, PR list per module, what was rejected/redone and why. Steering artifacts ARE the codebase-health pitch — make them impossible to miss.
2. **Demo video** (~3 min) — shot list:
   - (0:00) One-line pitch over the landing page: "case prep tools sell canned libraries — FreshCase generates a rigorous case from this morning's news, and runs it out loud."
   - (0:20) Session start: mode choice by voice, then the menu — camera on the phone/screen, TODAY's real headlines audible. Cut to the actual news article in a browser tab for one beat.
   - (0:50) Case excerpts, jump-cut: a clarifying question answered from the ledger; the candidate asking something unanticipated → "let me check what we have on that…" → live-fetched answer (subtitle: "live context.dev fetch, mid-conversation").
   - (1:40) Quant beat: the four-beat verbal data delivery + candidate barge-in ("sorry, can you repeat COGS?") to show interruption handling.
   - (2:10) The insight moment: candidate lands the hidden insight, Alex's acknowledgment.
   - (2:25) Debrief: Alex quoting the candidate's own words back with a drill; pan to the written scorecard; end on the metrics table (time-to-framework, silence profile — "feedback only a voice interface can give").
   - (2:55) Close: sponsor-stack line + team name.
   - Record TWO full takes with different team members as candidate; edit from the better one. Record before 14:30 — no exceptions.
3. **Live-demo prep** (if shortlisted): the 90-second live beat from the design doc §9; assign the demo candidate + a backup; pre-open the source-article tab; venue-noise test the mic during lunch.

## Day-of runbook (README appendix)

- 8:30 setup: redeem all sponsor credits; ask ElevenLabs booth the silence-timer question (M3 spike); ask context.dev booth whether hackathon keys unlock `/news/search`.
- Fallback ladder if things break, worst-first: generation flaky → fixture menu (`degraded: true` is designed-for); live-fetch flaky → ledger-only (misses answer neutrally); voice platform down → nothing to demo, so this is the ONLY component with no fallback — hence M3's platform spike runs first.
- Keep one hand-verified generated pack from the morning saved as `fixtures/generated-<date>.json` — the demo's "generated today" case should be one we've seen run once, freshly generated ≠ never rehearsed.

## Non-goals

Auth, analytics, custom domain, mobile layout polish, anything not visible in a 3-minute video or a judge's 10-minute codebase read.
