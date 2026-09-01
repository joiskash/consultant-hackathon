#!/usr/bin/env bash
# One-shot Fly.io deploy. Run from the repo root.
#
#   AMC_VENDOR_KEY=... TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... ./scripts/deploy.sh
#
# Reads from .env if the variables are not already exported.
set -euo pipefail

APP="${FLY_APP:-odyssey-watch}"
REGION="${FLY_REGION:-ewr}"

if [ -f .env ]; then set -a; . ./.env; set +a; fi

for v in AMC_VENDOR_KEY TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID; do
  if [ -z "${!v:-}" ]; then echo "ERROR: $v is not set (export it or put it in .env)"; exit 1; fi
done

command -v flyctl >/dev/null || { echo "ERROR: flyctl not found — https://fly.io/docs/flyctl/install/"; exit 1; }
flyctl auth whoami >/dev/null 2>&1 || { echo "ERROR: not logged in — run 'flyctl auth login'"; exit 1; }

echo "==> Running tests"
npm test

echo "==> Creating app $APP (ok if it already exists)"
flyctl apps create "$APP" 2>/dev/null || echo "    app already exists, continuing"

echo "==> Ensuring state volume in $REGION"
if ! flyctl volumes list -a "$APP" 2>/dev/null | grep -q odyssey_state; then
  flyctl volumes create odyssey_state --size 1 --region "$REGION" -a "$APP" --yes
else
  echo "    volume already exists"
fi

echo "==> Setting secrets"
flyctl secrets set -a "$APP" --stage \
  AMC_VENDOR_KEY="$AMC_VENDOR_KEY" \
  TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" \
  TELEGRAM_CHAT_ID="$TELEGRAM_CHAT_ID" \
  ${FORMAT_PATTERN:+FORMAT_PATTERN="$FORMAT_PATTERN"}

# --ha=false is essential: Fly otherwise starts two machines, which would mean
# two watchers double-alerting you and doubling the load on the AMC key.
echo "==> Deploying (single machine)"
flyctl deploy -a "$APP" --ha=false

echo
echo "Deployed. Watch it come up with:"
echo "    flyctl logs -a $APP"
echo
echo "You should get a Telegram message within ~30s confirming the watcher started."
echo "If you do not, something is wrong — check the logs."
