#!/bin/zsh
set -e
cd "${0:A:h}"
export PATH="$HOME/.proto/shims:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "Cardrove needs Node.js 24 or newer and npm. Install them, then open this file again."
  read -r "reply?Press Enter to close. "
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  echo "This Node.js version is too old. Use Node.js 24 or newer."
  read -r "reply?Press Enter to close. "
  exit 1
fi
if curl --fail --silent --max-time 2 "http://localhost:${PORT:-4317}/api/session" >/dev/null; then
  open "http://localhost:${PORT:-4317}"
  exit 0
fi
if [[ ! -d node_modules ]]; then npm ci; fi
npm run build
node server/index.mjs &
cardrove_process=$!
trap 'kill "$cardrove_process" 2>/dev/null || true' EXIT INT TERM
for cardrove_attempt in {1..40}; do
  if curl --fail --silent --max-time 1 "http://localhost:${PORT:-4317}/api/session" >/dev/null; then
    open "http://localhost:${PORT:-4317}"
    break
  fi
  if ! kill -0 "$cardrove_process" 2>/dev/null; then break; fi
  sleep 0.25
done
echo "Cardrove is running. Keep this window open. Press Ctrl+C to stop."
wait "$cardrove_process"
