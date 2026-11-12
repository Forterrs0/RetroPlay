#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo 'Instale o Node.js 22 ou superior em https://nodejs.org/' && exit 1; fi
if (( $(node -p 'parseInt(process.versions.node)') < 22 )); then echo 'Node.js 22+ necessário.' && exit 1; fi
printf '\nIniciando Retro Play em http://127.0.0.1:4173\n'
if command -v xdg-open >/dev/null; then (sleep 2; xdg-open 'http://127.0.0.1:4173' >/dev/null 2>&1 || true) & fi
if command -v open >/dev/null; then (sleep 2; open 'http://127.0.0.1:4173' >/dev/null 2>&1 || true) & fi
exec node server/server.mjs
