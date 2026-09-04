# Davflare Agent 目录约定（v2）

仓库示例（不在 R2 树里）：[`agents/examples/hello-site/`](../agents/examples/hello-site/) —— 可复现的 `publish_site` / `image_upload` 剧本。

把 Cursor（以及后续 Codex / Claude / OpenCode）的 **skills**、**rules**、**MCP 片段**按固定目录放进 R2。v2 增加 MCP `pull` / `push` 自动走这棵树（网页端仍可用）。不做文件监听。密钥不当文件存。

同名文件的合并顺序：**project 覆盖 agent 覆盖 global**。

## 远端目录

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
    {project}/             # 仓库或工作区名，例如 Davflare
      skills/{name}/SKILL.md
      rules/
      mcp/
```

agent 用小写（`cursor`，不要 `Cursor`）。project 与仓库/工作区名一致。

| 类型 | 目录里放什么 |
| --- | --- |
| `skills/{name}/SKILL.md` | 每个技能一个子目录（可带辅助文件） |
| `rules/` | Cursor 的 `.mdc` 规则（或 `AGENTS.md`） |
| `mcp/` | 只放 `mcp.json` — **占位符，不要明文密钥** |

示例 key：

- `agents/global/skills/commit/SKILL.md`
- `agents/cursor/rules/typescript.mdc`
- `agents/cursor/mcp/mcp.json`
- `agents/cursor/Davflare/skills/pages-deploy/SKILL.md`
- `agents/cursor/Davflare/mcp/mcp.json`

## Cursor 落地路径

| 层 | skills | rules | mcp |
| --- | --- | --- | --- |
| global / agent | `~/.cursor/skills/<name>/SKILL.md` | `.mdc` 拷到 `~/.cursor/rules/`（或当作 User Rules） | `~/.cursor/mcp.json` |
| project | `<仓库>/.cursor/skills/<name>/SKILL.md` | `<仓库>/.cursor/rules/*.mdc` | `<仓库>/.cursor/mcp.json` |

Cursor 的 `mcp.json` 支持在 `headers` / `url` 里写 `${env:NAME}`。用这个。不要上传带 `Bearer fd_…` 或粘贴出来的 token 的文件。

远端应保存的安全示例（不要存活密钥）：

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

## pull / push（v2）

`GET /api/list` 和 MCP `list` 仍是 **Depth 1**。请用 `pull` / `push`，不必手走目录。

`pull` 参数：`agent`（可选，如 `cursor`）、`project`（可选；需要 `agent`）、`type` 可选过滤（`skills` | `rules` | `mcp`）。会走 `agents/{global|agent|agent/project}/{skills|rules|mcp}/`，返回目录树和文件内容。每个文件带 `layer`、`rel` 和远端 `key`。客户端合并顺序：**project 覆盖 agent 覆盖 global**。超过 1 MiB 的文件与 `download` 一样用 `part` / `partSize` 分页。

`push` 参数：同样的 `agent` / `project`，加上 `files: [{ path, content, encoding? }]`。路径相对该层根目录（两者都省略则写 `agents/global/`）。需要时自动建父目录。`mcp.json` 必须用 `${env:...}` 占位符——明文密钥（`fd_…`、不是 `${env:…}` 的 `Bearer`）会被拒绝。没有本地磁盘监听；由 agent 带着文件内容调用工具。

需要时仍可用 Depth-1 的 `list` + `download` / `upload`。MCP 上传超过 1 MiB 会自动分块（上限 25 MB）；再大走网页端或 davflare-cli。

v3 可能再接其它 agent 和冲突策略。不要自动同步、不要监听本地磁盘。

## 网页端

文件浏览器可以直接建、改这套 `agents/…` 目录。这是不经过 MCP 客户端时的正式管理方式。
