# Davflare agent layouts (v2)

Repo-only demos (not the R2 tree): [`agents/examples/hello-site/`](../agents/examples/hello-site/) — reproducible `publish_site` / `image_upload` playbook; [`agents/examples/obsidian-sync/`](../agents/examples/obsidian-sync/) — Obsidian (Remotely Save) sync setup and WebDAV self-check; [`agents/examples/mcp-export/`](../agents/examples/mcp-export/) — Cursor / Claude Desktop MCP client configs (env placeholders only).

Store Cursor (and later Codex / Claude / OpenCode) **skills**, **rules**, and **MCP** snippets on R2 using a fixed directory tree. v2 adds MCP `pull` / `push` that walk this tree (the web UI still works). No file watcher. Secrets are not stored as files.

Merge order when the same name exists at more than one layer: **project > agent > global**.

## Remote tree

```
agents/
  global/
    skills/{name}/SKILL.md
    rules/
    mcp/
  {agent}/                 # cursor | claude | codex | opencode
    skills/{name}/SKILL.md
    rules/
    mcp/
    {project}/             # repo or workspace name, e.g. Davflare
      skills/{name}/SKILL.md
      rules/
      mcp/
```

Slugs are lowercase (`cursor`, not `Cursor`). Project names match the repo/workspace name.

| Type | What lives in that folder |
| --- | --- |
| `skills/{name}/SKILL.md` | One directory per skill (optional helpers beside SKILL.md) |
| `rules/` | Cursor `.mdc` rule files (or `AGENTS.md`) |
| `mcp/` | `mcp.json` only — **placeholders, never raw keys** |

Example keys:

- `agents/global/skills/commit/SKILL.md`
- `agents/cursor/rules/typescript.mdc`
- `agents/cursor/mcp/mcp.json`
- `agents/cursor/Davflare/skills/pages-deploy/SKILL.md`
- `agents/cursor/Davflare/mcp/mcp.json`

## Cursor local paths

| Layer | skills | rules | mcp |
| --- | --- | --- | --- |
| global / agent | `~/.cursor/skills/<name>/SKILL.md` | copy `.mdc` into `~/.cursor/rules/` (or apply as User Rules) | `~/.cursor/mcp.json` |
| project | `<repo>/.cursor/skills/<name>/SKILL.md` | `<repo>/.cursor/rules/*.mdc` | `<repo>/.cursor/mcp.json` |

Cursor MCP also accepts `${env:NAME}` in `headers` / `url`. Use that. Do not upload a file that contains `Bearer fd_…` or a pasted token.

Safe remote `mcp.json` (store this, not a live key):

```json
{
  "mcpServers": {
    "davflare": {
      "url": "https://<your-domain.com>/mcp",
      "headers": {
        "Authorization": "Bearer ${env:DAVFLARE_API_KEY}"
      }
    }
  }
}
```

## pull / push (v2)

`GET /api/list` and the MCP `list` tool are still **depth 1**. Use `pull` / `push` instead of walking by hand.

`pull` args: `agent` (optional, e.g. `cursor`), `project` (optional; requires `agent`), `type` optional filter (`skills` | `rules` | `mcp`). It walks `agents/{global|agent|agent/project}/{skills|rules|mcp}/` and returns the tree plus file contents. Each file is tagged with `layer`, `rel`, and the remote `key`. Merge order for the client: **project > agent > global**. Files larger than 1 MiB page with `part` / `partSize` like `download`.

`push` args: the same `agent` / `project` plus `files: [{ path, content, encoding? }]`. Paths are relative to that layer root (omit both → `agents/global/`). Parents are created as needed. `mcp.json` must use `${env:...}` placeholders — raw API keys (`fd_…`, `Bearer` tokens that are not `${env:…}`) are rejected. No local disk watcher; the agent calls the tool with file contents.

The depth-1 `list` + `download` / `upload` recipe still works if you need it. MCP uploads over 1 MiB auto-chunk (cap 25 MB); bigger files go through the web UI or davflare-cli.

v3 may add other agents and conflict policy. Do not auto-sync and do not watch the local disk.


## 2 minutes: connect Davflare to an AI assistant

Use the existing same-origin `POST /mcp` and an API key. **No new APIs.** Prefer Settings → **Connect Claude / Cursor MCP** (copy or download). Keys stay in environment variables — never in the downloaded file.

1. Open `#/settings`. Leave **API Key** and **MCP** on. Create a key (shown once).
2. On the **Connect Claude / Cursor MCP** card:
   - **Cursor:** copy/download `mcp.json` → save as `~/.cursor/mcp.json` or `<repo>/.cursor/mcp.json`.
   - **Claude Desktop:** copy/download `claude_desktop_config.json` and merge the `davflare` entry into your Claude config (macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json`). Claude Desktop is stdio-only, so the export bridges remote `/mcp` with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote).
3. Set `DAVFLARE_API_KEY` to your key (`export DAVFLARE_API_KEY=fd_…` before launching the client). Cursor reads `${env:DAVFLARE_API_KEY}` from `mcp.json`; Claude Desktop / `mcp-remote` expands `${DAVFLARE_API_KEY}` in the header arg.
4. Fully restart the client. Ask it to list Davflare tools (`tools/list`) or open [`agents/examples/hello-site/`](../agents/examples/hello-site/).

Static samples: [`agents/examples/mcp-export/`](../agents/examples/mcp-export/). The in-browser playground at `#/mcp` still helps smoke-test a key before you wire a desktop client.

## Web UI

The file browser can create and edit the same `agents/…` tree. That is the supported way to manage these files without an MCP client.
