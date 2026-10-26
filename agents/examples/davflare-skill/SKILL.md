---
name: davflare-skill-install
description: Install the official Davflare agent skill from this repo. Prefer skills/davflare/SKILL.md via npx skills add.
---

# Install official Davflare skill

Do not duplicate the long playbook here. Use the canonical file:

- Repo: `skills/davflare/SKILL.md`
- Install: `npx skills add fanchenggang/Davflare --skill davflare` (optional `-g -a cursor`)
- Live drive: `#/settings` → **Agents skill** → copy / download `SKILL.md`

Then connect MCP (Settings → **Connect Claude / Cursor MCP**) with `${env:DAVFLARE_API_KEY}` only.

See [README.md](./README.md).
