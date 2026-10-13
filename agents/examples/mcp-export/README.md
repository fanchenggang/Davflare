# MCP one-click export examples

Repo-only samples for the Settings → **Connect Claude / Cursor MCP** card. Replace `https://drive.example.com` with your Davflare origin. **Never** put a live `fd_…` key in these files.

| File | Client | Where it goes |
| --- | --- | --- |
| [`cursor.mcp.json`](./cursor.mcp.json) | Cursor | `~/.cursor/mcp.json` or `<repo>/.cursor/mcp.json` |
| [`claude_desktop_config.json`](./claude_desktop_config.json) | Claude Desktop | macOS `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows `%APPDATA%\Claude\claude_desktop_config.json` |

## 2-minute checklist

1. In Davflare `#/settings`, leave **API Key** and **MCP** on; create a key (shown once).
2. Export or copy the config from the Settings card (or use the files here with your origin).
3. Set `DAVFLARE_API_KEY` to that key:
   - **Cursor:** supported as `${env:DAVFLARE_API_KEY}` inside `mcp.json`.
   - **Claude Desktop:** export the env var in the shell/profile before launching the app (`mcp-remote` expands `${DAVFLARE_API_KEY}` in the header arg).
4. Restart the client and ask it to call Davflare `tools/list`.

More: [docs/agents.md](../../../docs/agents.md#2-minutes-connect-davflare-to-an-ai-assistant).
