#!/usr/bin/env bash
# "Deploy to Davflare Site" GitHub Action 入口（见仓库根 action.yml）。
# 包装 `davflare sites publish <path> --slug <slug>`（CLI 源码在 cli/，运行时从 action 目录构建）。
#
# 输入（环境变量，由 action.yml 从 inputs 传入）：
#   INPUT_PATH      构建产物目录（相对 $GITHUB_WORKSPACE / 当前目录）
#   INPUT_SLUG      站点 slug（[a-z0-9][a-z0-9-]{0,62}，自动转小写）
#   INPUT_URL       Davflare 实例地址（如 https://drive.example.com）
#   INPUT_API_KEY   API 密钥（只经环境变量传给 CLI，绝不进 argv / 日志）
# 可选：
#   DAVFLARE_ACTION_PATH  action 根目录（默认本脚本上一级）
#   DAVFLARE_CLI_BIN      直接指定已构建的 cli/dist/index.js（测试用，跳过构建）
#
# 安全：禁止 set -x；GitHub Actions 中先 ::add-mask:: 再做任何事。
set -euo pipefail
set +x

in_actions() { [ "${GITHUB_ACTIONS:-}" = "true" ]; }

fail() {
  if in_actions; then
    echo "::error title=Deploy to Davflare Site::$1"
  else
    echo "Error: $1" >&2
  fi
  exit 1
}

# ---- 1) 读取并立刻屏蔽密钥；从环境中移除，后续只在调用 CLI 时注入 ----
api_key="${INPUT_API_KEY:-}"
unset INPUT_API_KEY DAVFLARE_KEY
if in_actions && [ -n "$api_key" ]; then
  # 逐行 mask（多行值每行单独注册），此命令行本身由 runner 消费、不会显示
  while IFS= read -r line; do
    [ -n "$line" ] && echo "::add-mask::$line"
  done <<<"$api_key"
fi

site_path="${INPUT_PATH:-}"
slug="$(printf '%s' "${INPUT_SLUG:-}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
server="$(printf '%s' "${INPUT_URL:-}" | tr -d '[:space:]')"
server="${server%/}"

# ---- 2) 校验输入 ----
[ -n "$server" ] || fail "Input 'url' is empty — set it to your Davflare instance URL, e.g. url: \${{ secrets.DAVFLARE_URL }} (is the DAVFLARE_URL secret defined?)"
[ -n "$api_key" ] || fail "Input 'api-key' is empty — pass it from a secret, e.g. api-key: \${{ secrets.DAVFLARE_API_KEY }} (is the DAVFLARE_API_KEY secret defined?)"
[ -n "$site_path" ] || fail "Input 'path' is empty — set it to your build output directory, e.g. path: dist"
[ -n "$slug" ] || fail "Input 'slug' is empty — set the site slug, e.g. slug: my-site"
[[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || fail "Invalid slug '$slug' — must match [a-z0-9][a-z0-9-]{0,62}"
case "$server" in
  http://* | https://*) ;;
  */*) fail "Invalid url '$server' — expected something like https://drive.example.com" ;;
  *) server="https://$server" ;;
esac
[ -d "$site_path" ] || fail "Build directory '$site_path' not found (did the build step run? path is relative to the workspace)"
if [ -z "$(find "$site_path" -type f ! -name .DS_Store -print -quit)" ]; then
  fail "Build directory '$site_path' is empty — nothing to publish"
fi

command -v node >/dev/null 2>&1 || fail "Node.js >= 18 is required on the runner (add actions/setup-node before this action)"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 18 ] || fail "Node.js >= 18 is required (found $(node -v)); add actions/setup-node with node-version: 20"

# ---- 3) 准备 CLI（从 action 目录源码构建，不依赖 npm 发布） ----
action_root="${DAVFLARE_ACTION_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cli_bin="${DAVFLARE_CLI_BIN:-$action_root/cli/dist/index.js}"
if [ ! -f "$cli_bin" ]; then
  in_actions && echo "::group::Build davflare-cli"
  echo "Building davflare-cli from $action_root/cli …" >&2
  (
    cd "$action_root/cli"
    npm ci --no-audit --no-fund --ignore-scripts --loglevel=error >&2
    npm run --silent build >&2
  ) || { in_actions && echo "::endgroup::"; fail "Failed to build davflare-cli (npm ci / tsc in $action_root/cli)"; }
  in_actions && echo "::endgroup::"
fi

# ---- 4) 发布（密钥只经环境变量传入 node 子进程） ----
echo "Publishing '$site_path' → Davflare site '$slug' …"
out_file="$(mktemp)"
err_file="$(mktemp)"
trap 'rm -f "$out_file" "$err_file"' EXIT

set +e
# stdout（站点 URL）→ out_file；stderr 实时显示并 tee 到 err_file 供错误分类
{ DAVFLARE_SERVER="$server" DAVFLARE_KEY="$api_key" \
    node "$cli_bin" sites publish "$site_path" --slug "$slug" 2>&1 1>&3 3>&- | tee "$err_file" >&2; } 3>"$out_file"
status=${PIPESTATUS[0]}
set -e

if [ "$status" -ne 0 ]; then
  if grep -q "Davflare API key rejected" "$err_file"; then
    code="$(grep -oE 'HTTP (401|403)' "$err_file" | head -n1 | cut -d' ' -f2)"
    fail "Davflare API key rejected (${code:-401/403}) — check the DAVFLARE_API_KEY secret (correct, not expired/revoked, API keys enabled in Settings) and that 'url' points to the right instance"
  fi
  if grep -qiE "fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT" "$err_file"; then
    fail "Cannot reach Davflare instance at $server — check the 'url' input / DAVFLARE_URL secret"
  fi
  fail "davflare sites publish failed (exit $status) — see the log above"
fi

site_url="$(grep -E '^https?://' "$out_file" | tail -n1 || true)"

# ---- 5) 输出 ----
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "url=$site_url" >>"$GITHUB_OUTPUT"
fi

if [ -z "$site_url" ]; then
  if in_actions; then
    echo "::warning title=Deploy to Davflare Site::Published '$slug', but the instance has no SITES_HOST configured, so there is no public URL (see docs/sites.md)"
  else
    echo "Warning: published '$slug', but the instance has no SITES_HOST configured, so there is no public URL" >&2
  fi
  exit 0
fi

echo ""
echo "✅ Davflare site published: $site_url"
if in_actions; then
  echo "::notice title=Davflare site published::$site_url"
fi
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### 🚀 Deployed to Davflare"
    echo ""
    echo "- Slug: \`$slug\`"
    echo "- URL: $site_url"
  } >>"$GITHUB_STEP_SUMMARY"
fi
