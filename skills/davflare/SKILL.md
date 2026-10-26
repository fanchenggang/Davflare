---
name: davflare
description: Use Davflare (Cloudflare Pages + R2 self-hosted drive) via same-origin MCP /mcp (~25 tools) and Open API — upload/download, shares, trash, publish_site to sites/{slug}/, image host. Use when the user mentions Davflare, FlareDrive, R2 drive MCP, static sites on SITES_HOST, or connecting Cursor/Claude to a personal drive.
---

# Davflare

Davflare is a self-hosted file drive on **Cloudflare Pages + R2**. One deployment serves:

- Web UI (file manager, Settings, Sites, Images)
- WebDAV at `/webdav`
- Streamable HTTP MCP at `POST /mcp` (~25 tools)
- Open API under `/api/*` (same auth as MCP)

**Do not invent APIs or MCP tools.** Only call what already exists on this drive.

## Auth

1. Open `https://<drive-origin>/#/settings`. Leave **API Key** and **MCP** on. Create a key (`fd_…`, shown once).
2. Clients authenticate with `Authorization: Bearer <apiKey>` or `X-Api-Key: <apiKey>`.
3. In Cursor `mcp.json` / skill files / R2 `agents/**/mcp/mcp.json`, use **only** `${env:DAVFLARE_API_KEY}` — never a raw `fd_…` key.
4. Set the env var before the client starts: `export DAVFLARE_API_KEY=fd_…`.

MCP depends on the API Key switch: if API Key is off, `/mcp` is **404** even when MCP is on.

## Connect MCP (Cursor)

Endpoint: `https://<drive-origin>/mcp`

```json
{
  "mcpServers": {
    "davflare": {
      "url": "https://<drive-origin>/mcp",
      "headers": {
        "Authorization": "Bearer ${env:DAVFLARE_API_KEY}"
      }
    }
  }
}
```

Save as `~/.cursor/mcp.json` or `<repo>/.cursor/mcp.json`, restart Cursor, then ask for `tools/list`.

Settings → **Connect Claude / Cursor MCP** exports the same configs (env placeholders). That card is for **client wiring**; this skill teaches **how to use** Davflare after MCP is connected — do not mix them up.

Claude Desktop is stdio-only: use the Settings MCP export (`mcp-remote` bridge) or see `agents/examples/mcp-export/`.

## Core MCP tools (~25)

File ops: `list`, `upload`, `download`, `mkdir`, `delete`, `search`, `move`, `copy`, `stat`, `zip`

Shares: `share_create`, `share_list`, `share_revoke`

Trash: `trash_list`, `trash_restore`, `trash_empty` (`delete` soft-deletes by default; `hard=true` permanent)

Sites: `sites_list`, `sites_config`, `sites_delete`, `publish_site`

Agents tree: `pull`, `push`

Image host: `image_upload`, `image_list`, `image_delete` → public `https://<SITES_HOST>/i/{id}`

Uploads over 1 MiB auto-chunk (cap 25 MB). Larger files: web UI or `davflare-cli`.

Open API mirrors these under `/api/*` (see `docs/API.md`). Prefer MCP tools when already connected.

## Agents R2 tree

Remote layout (merge **project > agent > global**):

```
agents/
  global/{skills|rules|mcp}/
  {agent}/                # cursor | claude | codex | opencode
    {skills|rules|mcp}/
    {project}/
      {skills|rules|mcp}/
```

- `pull` / `push` walk this tree (depth-1 `list` alone is not enough).
- `mcp.json` under `agents/**/mcp/` must use `${env:DAVFLARE_API_KEY}` placeholders — raw keys are rejected.
- Details: `docs/agents.md`.

## Common playbooks

### Publish a folder as a static site

1. Ensure **Sites** is on and Pages env `SITES_HOST` is the **hostname only** (e.g. `sites.example.com`), then redeploy.
2. Upload content into a drive folder (e.g. `examples/hello-site/`).
3. Call `publish_site` with `slug` + `source` (drive folder path).
4. Open `https://<SITES_HOST>/{slug}/`.

Reproducible demo: `agents/examples/hello-site/SKILL.md`.

### Image host (Markdown CDN)

1. **Image host** on + `SITES_HOST` set.
2. `image_upload` (base64 / file) → use returned URL / Markdown.
3. Public form: `https://<SITES_HOST>/i/{id}`.

### Share a file or folder

`share_create` with path + optional `expiresInHours` / `extractCode` → share URL. Manage with `share_list` / `share_revoke`.

### Store agent skills on R2

`push` files into `agents/cursor/<project>/skills/<name>/SKILL.md` (or global/agent layers), then `pull` on another machine. No local disk watcher.

## In-repo examples (prefer these over inventing steps)

| Example | Purpose |
| --- | --- |
| `agents/examples/hello-site/` | `publish_site` / optional `image_upload` |
| `agents/examples/mcp-export/` | Cursor / Claude Desktop MCP configs |
| `agents/examples/mobile-upload/` | Phone → `POST /api/upload` or `/api/images` |
| `agents/examples/image-host-export/` | ShareX / Typora |
| `agents/examples/backup-cron/` | `davflare sync` crontab + Actions |
| `agents/examples/davflare-skill/` | How to install **this** official skill |

## Install this skill

```bash
npx skills add fanchenggang/Davflare --skill davflare
# Cursor global:
npx skills add fanchenggang/Davflare --skill davflare -g -a cursor
```

Or copy `skills/davflare/SKILL.md` to `~/.cursor/skills/davflare/SKILL.md` or `<repo>/.agents/skills/davflare/SKILL.md`.

From a live drive: Settings → **Agents skill** → Copy / Download `SKILL.md` (placeholders or your origin filled in).

## Do not

- Do not invent MCP tool names or Open API routes.
- Do not store raw `fd_…` keys in files, git, or R2 `agents/**/mcp/`.
- Do not treat `SITES_HOST` as a full URL — hostname only.
- Do not rename the R2 binding / bucket; leave existing `webdav` binding as deployed.
- Do not confuse **Agents skill** (this playbook) with **Connect Claude / Cursor MCP** (mcp.json export only).

## Done when

`tools/list` returns the Davflare catalog, and a smoke action works (e.g. `list` on root, or `publish_site` for hello-site).
