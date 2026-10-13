# Connect Davflare MCP (Cursor / Claude Desktop)

Use when the user wants Cursor or Claude Desktop to call Davflare tools over `/mcp`.

1. Confirm API Key + MCP switches are on; create an API key if needed.
2. Prefer the Settings → **Connect Claude / Cursor MCP** export (env placeholders only).
3. Cursor: write `mcp.json` with `url` + `Authorization: Bearer ${env:DAVFLARE_API_KEY}`.
4. Claude Desktop: merge the `mcp-remote` bridge block into `claude_desktop_config.json`; set `DAVFLARE_API_KEY` in the environment before launch.
5. Never store a raw `fd_…` key in R2 `agents/**/mcp/mcp.json` or in git.
