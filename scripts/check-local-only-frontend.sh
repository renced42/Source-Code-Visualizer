#!/usr/bin/env sh
set -eu

ROOT="${1:-src/main/resources/static}"
FAILED=0

check_pattern() {
  pattern="$1"
  description="$2"
  matches=$(grep -RInE "$pattern" "$ROOT" --include='*.html' --include='*.js' --include='*.css' 2>/dev/null | grep -v "http://www.w3.org/2000/svg" || true)
  if [ -n "$matches" ]; then
    echo "ERROR: $description" >&2
    echo "$matches" >&2
    FAILED=1
  fi
}

check_pattern 'https?://|//[A-Za-z0-9.-]+/' 'külső vagy protokollfüggetlen URL található a frontendben'
check_pattern '\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b' 'tiltott hálózati API található a frontendben'
check_pattern '\b(importScripts|SharedWorker|Worker)\s*\(' 'tiltott worker betöltés található a frontendben'

# A saját backend felé irányuló relatív fetch engedélyezett. Minden abszolút fetch tiltott.
absolute_fetch=$(grep -RInE "fetch\s*\(\s*['\"](https?:)?//" "$ROOT" --include='*.js' 2>/dev/null || true)
if [ -n "$absolute_fetch" ]; then
  echo "ERROR: abszolút külső fetch hívás található" >&2
  echo "$absolute_fetch" >&2
  FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
  exit 1
fi

echo "OK: a frontend nem tartalmaz külső URL-t vagy tiltott hálózati API-t."
