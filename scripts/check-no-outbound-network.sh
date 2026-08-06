#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
FAILED=0

check_pattern() {
  pattern="$1"
  description="$2"
  if grep -RInE "$pattern" \
      "$ROOT/src/main/resources/static" \
      "$ROOT/src/main/java" \
      --exclude='OutboundNetworkGuard.java' \
      --exclude='OllamaClient.java' \
      --exclude='*.map' 2>/dev/null; then
    echo "Tiltott hálózati minta: $description" >&2
    FAILED=1
  fi
}

if grep -RInE 'https?://|wss?://' \
    "$ROOT/src/main/resources/static" "$ROOT/src/main/java" \
    --exclude='OutboundNetworkGuard.java' --exclude='OllamaClient.java' --exclude='*.map' 2>/dev/null \
    | grep -vE 'http://www\.w3\.org/2000/svg|http://apache\.org/xml/features/|http://xml\.org/sax/features/'; then
  echo "Tiltott hálózati minta: külső URL vagy websocket URL" >&2
  FAILED=1
fi

# OllamaClient is the only allowed backend HTTP client. It validates the configured URI as
# localhost/127.0.0.1/::1 before constructing any request.
if grep -nE 'https?://' "$ROOT/src/main/java/hu/sourcegraph/explorer/ai/OllamaClient.java"     | grep -vE 'http://127\.0\.0\.1:11434'; then
  echo "Tiltott hálózati minta: az Ollama kliensben nem helyi URL található" >&2
  FAILED=1
fi

check_pattern 'sendBeacon[[:space:]]*\(' 'navigator.sendBeacon'
check_pattern 'new[[:space:]]+WebSocket[[:space:]]*\(' 'WebSocket'
check_pattern 'new[[:space:]]+EventSource[[:space:]]*\(' 'EventSource'
check_pattern 'new[[:space:]]+XMLHttpRequest[[:space:]]*\(' 'XMLHttpRequest'
check_pattern 'java\.net\.http|HttpClient|URLConnection|RestTemplate|WebClient|OkHttpClient|new[[:space:]]+Socket[[:space:]]*\(' 'backend HTTP/socket kliens'

if [ "$FAILED" -ne 0 ]; then
  exit 1
fi

echo "Rendben: az alkalmazáskódban nincs engedélyezetlen kifelé irányuló hálózati kliens vagy külső URL."
