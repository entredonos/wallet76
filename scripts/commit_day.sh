#!/usr/bin/env bash
# Wallet76 — Daily commit script
# Usage: bash scripts/commit_day.sh
# Add to cron or run manually at end of each session.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Wallet76 — Daily checkpoint commit"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Health check first
echo "▶ Running health check…"
python scripts/health.py --quiet
echo ""

# 2. Show what's changed
CHANGED=$(git status --short | grep -v "^$" || true)
if [ -z "$CHANGED" ]; then
  echo "✓ Nothing to commit — working tree clean."
  exit 0
fi

echo "Changed files:"
git status --short
echo ""

# 3. Stage everything
git add -A

# 4. Commit with date + summary
DATE=$(date "+%Y-%m-%d %H:%M")
FILE_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')

git commit -m "chore: daily checkpoint ${DATE} (${FILE_COUNT} files)"

echo ""
echo "✓ Committed ${FILE_COUNT} file(s) — $(git log -1 --format='%h %s')"
echo ""
