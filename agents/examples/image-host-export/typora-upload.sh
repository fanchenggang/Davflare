#!/usr/bin/env bash
# Typora Custom Command helper — replace ORIGIN and YOUR_API_KEY, chmod +x, point Typora at this script.
# Usage: typora-upload.sh /path/to/image.png  → prints https://<SITES_HOST>/i/{id}
set -euo pipefail
ORIGIN="${DAVFLARE_SERVER:-https://drive.example.com}"
KEY="${DAVFLARE_API_KEY:-YOUR_API_KEY}"
FILE="${1:?usage: $0 <image-file>}"
curl -sS -X POST "${ORIGIN%/}/api/images" \
  -H "Authorization: Bearer ${KEY}" \
  -H "X-Api-Key: ${KEY}" \
  -H "X-File-Name: $(basename "$FILE")" \
  --data-binary @"$FILE" \
  | sed -n 's/.*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
