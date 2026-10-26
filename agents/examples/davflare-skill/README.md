# Official Davflare Agent Skill

Teach Cursor / Claude / Codex how to use Davflare over existing **MCP `/mcp`** (~25 tools) and **Open API** — files, shares, `publish_site`, image host. **No new APIs.**

Canonical skill: [`skills/davflare/SKILL.md`](../../../skills/davflare/SKILL.md)  
Settings card: `#/settings` → **Agents skill (official)** (copy / download `SKILL.md`)

> Separate from Settings → **Connect Claude / Cursor MCP** (that card only exports `mcp.json` wiring).

## 30-second install

```bash
npx skills add fanchenggang/Davflare --skill davflare
# Cursor, global:
npx skills add fanchenggang/Davflare --skill davflare -g -a cursor
```

Manual copy:

| Target | Path |
| --- | --- |
| Cursor user skill | `~/.cursor/skills/davflare/SKILL.md` |
| Project / agents | `<repo>/.agents/skills/davflare/SKILL.md` or `.cursor/skills/davflare/SKILL.md` |

Or open your live drive → `#/settings` → **Agents skill** → **Copy skill** / **Download SKILL.md**, then paste into one of the paths above.

## What the skill covers

- What Davflare is (Pages + R2; Web UI / WebDAV / MCP / Open API)
- Auth with `${env:DAVFLARE_API_KEY}` only (never raw `fd_…` in files)
- Core MCP tools + agents R2 tree (`pull` / `push`)
- Playbooks: `publish_site`, image host, shares
- Pointers to in-repo examples (`hello-site`, `mcp-export`, …)

## Prerequisites

1. Davflare deployed; `#/settings` leaves **API Key** + **MCP** on; create a key.
2. Wire MCP first (Settings → **Connect Claude / Cursor MCP**, or [`../mcp-export/`](../mcp-export/)).
3. Optional: `SITES_HOST` (hostname only) for sites / image host.

More: [docs/agents.md](../../../docs/agents.md).
