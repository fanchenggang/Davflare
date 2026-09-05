#!/usr/bin/env bash
# Build the Chrome extension zip:
#   davflare-extension.zip — toolbar + in-shell settings + bookmark library + drive view
#
# Usage:
#   bash scripts/package-extension.sh [output-dir]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_ARG="${1:-$ROOT}"
mkdir -p "$OUT_ARG"
OUT="$(cd "$OUT_ARG" && pwd)"

DEFAULT_ZIP="$OUT/davflare-extension.zip"

test -f "$ROOT/extension/manifest.json"

# 网盘视图是 Web 端 React App 的 vite 构建产物,zip 前必须先构建
if [ ! -d "$ROOT/node_modules" ]; then
  echo "error: node_modules not found — run 'npm ci' first (drive view is bundled by vite)" >&2
  exit 1
fi
(cd "$ROOT" && npm run build:extension)
test -f "$ROOT/extension/drive/drive.js"

node -e '
const fs = require("fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (Object.prototype.hasOwnProperty.call(manifest, "chrome_url_overrides")) {
  console.error("extension/manifest.json must not contain chrome_url_overrides");
  process.exit(1);
}
if (Object.prototype.hasOwnProperty.call(manifest, "options_ui")) {
  console.error("extension/manifest.json must not contain options_ui (settings live in the shell page)");
  process.exit(1);
}
' "$ROOT/extension/manifest.json"

rm -f "$DEFAULT_ZIP"
(cd "$ROOT/extension" && zip -r -X "$DEFAULT_ZIP" . -x "*.DS_Store" -x "*__MACOSX*")

echo "Wrote $DEFAULT_ZIP"
unzip -l "$DEFAULT_ZIP"
