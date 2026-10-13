# Scheduled backup examples (davflare-cli sync)

Repo-only samples for Settings → **Scheduled backup**. Reuses `davflare sync push|pull` and the Open API — **no new MCP tools**.

| File | Purpose |
| --- | --- |
| [`crontab.example`](./crontab.example) | Lines to paste into `crontab -e` (no live keys) |
| [`env.example`](./env.example) | Optional `~/.config/davflare/env` template |
| [`github-actions-backup.yml`](./github-actions-backup.yml) | Copy into `.github/workflows/` — secrets `DAVFLARE_SERVER` + `DAVFLARE_KEY` |

## 10-minute free R2 backup

1. Install CLI: `npm i -g davflare-cli` (or build `cli/` from this repo).
2. **Preferred (laptop/VPS):** `davflare login --server https://<your-host>` → credentials in `~/.config/davflare/config.json` (0600). Copy a **push** / **pull** line from Settings (or `crontab.example`).
3. **CI / headless:** add repository secrets `DAVFLARE_SERVER` (e.g. `https://drive.example.com`) and `DAVFLARE_KEY` (`fd_…` from Settings → API Key). Use [`github-actions-backup.yml`](./github-actions-backup.yml).
4. Optional dry-run: `davflare sync push --dry-run ~/Documents backups/daily`.

Never put a live `fd_…` key into crontab, git, or the Settings copy text. Sync compares by size (see [cli/README.md](../../../cli/README.md)).

More: [docs/agents.md](../../../docs/agents.md) · Settings card on `#/settings`.
