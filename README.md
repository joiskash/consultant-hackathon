# odyssey-watch

Alerts you on Telegram the moment IMAX 70mm tickets for *The Odyssey* open up at
**AMC Lincoln Square 13** for showings between **2026-09-01 and 2026-09-06**.

Zero runtime dependencies (Node 20+ built-in `fetch` only).

---

## What counts as "tickets opening up"

Three different things, all of which fire an alert:

| Event | Meaning |
|---|---|
| `NEW_ONSALE` | A showtime we've never seen, already purchasable |
| `EMBARGO_LIFTED` | AMC had it scheduled but not on sale — it just went on sale |
| `BACK_IN_STOCK` | Was sold out, seats came back (expired holds / returns) |
| `NOW_BUYABLE` | A tracked showtime gained a working purchase link |

Plus two quiet, non-buzzing notices: `NEW_EMBARGOED` (a show is scheduled but not
yet on sale — your early warning) and `NEW_UNAVAILABLE`.

A showtime that simply *stays* available never re-alerts, so the bot doesn't cry wolf.

---

## Setup

### 1. Telegram credentials

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token.
2. Send your new bot any message (it can't message you first).
3. Get your chat id:
   ```sh
   curl "https://api.telegram.org/bot<TOKEN>/getUpdates" | grep -o '"id":[0-9-]*' | head -1
   ```

### 2. Configure

```sh
cp .env.example .env    # fill in AMC_VENDOR_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```

### 3. Preflight — do this before trusting it

```sh
npm run check
```

Validates the vendor key, resolves the theatre id, confirms the showtimes
endpoint and date format, checks embargoed-feed access, and sends a test alert.
**If the test message doesn't arrive on your phone, nothing else matters.**

### 4. Confirm the format matcher against real data

```sh
npm run discover
```

Prints every `premiumFormat`, attribute code and auditorium name AMC actually
returns for Odyssey at this theatre, and which ones matched. If AMC labels the
70mm print in some way the default regex misses, set `FORMAT_PATTERN` in `.env`
to a regex that matches what you see.

> This matters: a too-narrow matcher fails **silently**. It looks healthy while
> tracking nothing. The heartbeat reports the tracked count for this reason.

---

## Running

### Fly.io (primary, always-on)

```sh
fly launch --no-deploy --name odyssey-watch
fly volumes create odyssey_state --size 1 --region ewr
fly secrets set AMC_VENDOR_KEY=... TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=...
fly deploy
fly logs
```

Deliberately has no `[http_service]` block, so Fly cannot scale it to zero — a
stopped machine is a missed drop.

### Docker (equivalent, on any always-on machine)

```sh
docker compose up -d --build && docker compose logs -f
```

### GitHub Actions (backup)

Already wired in `.github/workflows/watch.yml`, running every 5 minutes. Add
three repo secrets under **Settings → Secrets and variables → Actions**:
`AMC_VENDOR_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

Actions cron has a 5-minute floor, frequently runs 10–20 minutes late, and can
skip runs under load — so treat it strictly as a backstop behind Fly. Its alerts
are tagged `(backup watcher)`. It dedupes through the Actions cache; a cache miss
costs you a duplicate alert, never a missed one.

---

## Reliability

The failure that actually costs you a ticket is a *silent* one, so:

- **Atomic state writes** (temp file + rename) — a crash mid-write can't corrupt state, and restarts neither replay old alerts nor miss transitions
- **Heartbeat** every 6h: "alive, tracking N showtimes" — silence is diagnosable, and tracking zero showtimes warns explicitly
- **Fail-loud**: 5 consecutive errors (or an immediately-fatal 401/403) sends an alert; recovery sends an all-clear
- **On-disk outbox**: a Telegram outage queues the alert instead of dropping it, and it flushes on the next poll
- **Urgent alerts send 3×** — one missed buzz is a missed ticket
- **Backoff**: honours `Retry-After` on 429, exponential + jitter on 5xx/network, no retry on 401/403/404
- **Adaptive cadence**: 60s baseline, tightening to 15s for 10 minutes after any detected change, since drops arrive in bursts

Roughly 12 requests per poll (6 dates × live + embargoed feeds) — polite for a
courtesy vendor key.

---

## Tests

```sh
npm test
```

23 tests over the transition logic, the format matcher, and the full poll
pipeline against canned AMC payloads. They cover the cases that matter: steady
state stays silent, embargo→onsale fires exactly once, selling out isn't an
alert but re-opening is, and IMAX Laser never masquerades as IMAX 70mm.

---

## Layout

| Path | |
|---|---|
| `src/watch.js` | main loop: poll, alert, heartbeat, failure handling |
| `src/poll.js` | one sweep of the watch window |
| `src/amc.js` | AMC client: auth, HAL pagination, retry/backoff, date-format probing |
| `src/state.js` | atomic persistence + the transition diff |
| `src/match.js` | movie and IMAX 70mm matching |
| `src/telegram.js` | delivery with retry, message rendering |
| `src/preflight.js` | `npm run check` |
| `src/discover.js` | `npm run discover` |
| `src/once.js` | single pass for the Actions backup |

The previous contents of this repository are preserved on the **`bkp`** branch.
