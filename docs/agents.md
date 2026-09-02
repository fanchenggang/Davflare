# Davflare agent layouts (v1)

Store Cursor (and later Codex / Claude / OpenCode) **skills**, **rules**, and **MCP** snippets on R2 using a fixed directory tree. v1 is a **convention + manual pull/push** with the existing MCP tools (or the web UI). No file watcher. Secrets are not stored as files.

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

## Cursor local paths (v1)

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

## Manual pull / push (v1)

`GET /api/list` and the MCP `list` tool are **depth 1**. Walk each folder yourself.

Pull (remote → Cursor), project first:

1. `list` `agents/cursor/<project>/skills/` (then `rules/`, `mcp/`) → `download` each file into the project `.cursor/…` paths above.
2. Same for `agents/cursor/{skills,rules,mcp}/` → user-level Cursor paths. Skip a file if the project layer already provided that name.
3. Same for `agents/global/…`.

Push (Cursor → remote): `mkdir` the remote folder, then `upload` (or the web UI). Strip secrets from `mcp.json` before upload. MCP uploads over 1 MiB auto-chunk (cap 25 MB); bigger files go through the web UI or davflare-cli.

v2 will add `pull` / `push` tools that walk this tree. v3 will add other agents and conflict policy. Until then, do not auto-sync and do not watch the local disk.

## Web UI

The file browser can create and edit the same `agents/…` tree. That is the supported way to manage these files without an MCP client.
