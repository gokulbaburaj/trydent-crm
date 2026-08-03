#!/usr/bin/env bash
#
# ship.sh — verify, commit and push in one command.
#
#   ./ship.sh "Portal: invoices replace deal-derived payments"
#
# Runs the same three checks Claude runs before handing work over, and refuses
# to push if any fails. A broken push means a broken Vercel deploy, and it's
# much cheaper to catch it here than in production.
set -euo pipefail

cd "$(dirname "$0")"

MSG="${1:-}"
if [ -z "$MSG" ]; then
  echo "Usage: ./ship.sh \"your commit message\""
  exit 1
fi

if [ -z "$(git status --porcelain)" ]; then
  echo "Nothing to commit — working tree is clean."
  exit 0
fi

echo "→ Type-checking..."
npx tsc --noEmit

echo "→ Linting..."
npx eslint .

echo "→ Testing..."
npm test

echo "→ Committing..."
git add -A
git commit -m "$MSG"

echo "→ Pushing..."
git push

echo
echo "Done. Vercel will pick it up in a minute or two."
