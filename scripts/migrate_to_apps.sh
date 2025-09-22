#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

say(){ printf "\033[1;36m==>\033[0m %s\n" "$*"; }

mkdir -p apps/api/src apps/web public infra scripts

BACKEND_DIR=""
FRONTEND_DIR=""

# Detect backend
if [ -f "requirements.txt" ]; then
  if grep -qiE 'fastapi|flask' requirements.txt; then
    BACKEND_DIR="."
  fi
fi
for d in backend server api; do
  [ -z "$BACKEND_DIR" ] && [ -d "$d" ] && BACKEND_DIR="$d"
done

# Detect frontend
if [ -f "package.json" ]; then
  if grep -q '"next"' package.json || grep -q '"react"' package.json; then
    FRONTEND_DIR="."
  fi
fi
for d in frontend client web ui; do
  [ -z "$FRONTEND_DIR" ] && [ -d "$d" ] && FRONTEND_DIR="$d"
done

say "Detected backend at: ${BACKEND_DIR:-<none>}"
say "Detected frontend at: ${FRONTEND_DIR:-<none>}"

say "[DRY RUN] Planned moves:"
if [ -n "$BACKEND_DIR" ]; then
  echo "  git mv $BACKEND_DIR apps/api (selected files)"
fi
if [ -n "$FRONTEND_DIR" ]; then
  echo "  git mv $FRONTEND_DIR apps/web (selected files)"
fi

say "To execute for real, re-run with: bash scripts/migrate_to_apps.sh --apply"
