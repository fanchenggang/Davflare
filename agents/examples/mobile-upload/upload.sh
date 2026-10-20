#!/usr/bin/env bash
# Upload $1 to Davflare via Open API. Replace origin + YOUR_API_KEY first.
# Reuses POST /api/upload — no new APIs.
set -euo pipefail
FILE="${1:?usage: upload.sh <file>}"
ORIGIN="${DAVFLARE_ORIGIN:-https://drive.example.com}"
KEY="${DAVFLARE_API_KEY:-YOUR_API_KEY}"
FOLDER="${DAVFLARE_PATH:-mobile/}"
# ensure trailing slash for ?path=
case "$FOLDER" in
  */) ;;
  *) FOLDER="${FOLDER}/" ;;
esac
curl -sS -X POST "${ORIGIN}/api/upload?path=${FOLDER}" \
  -H "Authorization: Bearer ${KEY}" \
  -H "X-Api-Key: ${KEY}" \
  -H "X-File-Name: $(basename "$FILE")" \
  --data-binary @"$FILE"
echo
