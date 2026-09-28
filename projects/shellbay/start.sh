#!/usr/bin/env sh
set -eu

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18 or newer is required."
  exit 1
fi
if ! command -v ssh >/dev/null 2>&1; then
  echo "OpenSSH client is required (install openssh-client with your Linux package manager)."
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required for the local pseudo-terminal bridge."
  exit 1
fi
if [ ! -f "$(dirname "$0")/node_modules/@xterm/xterm/lib/xterm.js" ]; then
  echo "Run 'npm install' in this directory before starting Shellbay."
  exit 1
fi

exec node "$(dirname "$0")/server.mjs"
