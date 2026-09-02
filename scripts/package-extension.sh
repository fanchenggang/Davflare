#!/usr/bin/env bash
# Build both Chrome extension zips:
#   davflare-extension.zip         — toolbar + options only (no NTP override)
#   davflare-extension-newtab.zip  — default package + chrome_url_overrides.newtab
#
# Usage:
#   bash scripts/package-extension.sh [output-dir]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT}"
mkdir -p "$OUT"

DEFAULT_ZIP="$OUT/davflare-extension.zip"
NEWTAB_ZIP="$OUT/davflare-extension-newtab.zip"

test -f "$ROOT/extension/manifest.json"
test -f "$ROOT/extension-newtab/newtab.html"
test -f "$ROOT/extension-newtab/newtab.js"

node -e '
const fs = require("fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (Object.prototype.hasOwnProperty.call(manifest, "chrome_url_overrides")) {
  console.error("default extension/manifest.json must not contain chrome_url_overrides");
  process.exit(1);
}
' "$ROOT/extension/manifest.json"

rm -f "$DEFAULT_ZIP" "$NEWTAB_ZIP"
(cd "$ROOT/extension" && zip -r -X "$DEFAULT_ZIP" . -x "*.DS_Store" -x "*__MACOSX*")

STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

cp -a "$ROOT/extension/." "$STAGE/"
cp "$ROOT/extension-newtab/newtab.html" "$ROOT/extension-newtab/newtab.js" "$STAGE/"

node -e '
const fs = require("fs");
const p = process.argv[1];
const manifest = JSON.parse(fs.readFileSync(p, "utf8"));
manifest.name = "Davflare New Tab";
manifest.description = "Open your Davflare instance from the toolbar and as Chrome'\''s new tab.";
manifest.chrome_url_overrides = { newtab: "newtab.html" };
fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + "\n");
' "$STAGE/manifest.json"

(cd "$STAGE" && zip -r -X "$NEWTAB_ZIP" . -x "*.DS_Store" -x "*__MACOSX*")

echo "Wrote $DEFAULT_ZIP"
unzip -l "$DEFAULT_ZIP"
echo "Wrote $NEWTAB_ZIP"
unzip -l "$NEWTAB_ZIP"
