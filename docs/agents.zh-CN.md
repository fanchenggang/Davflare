# Davflare Agent 目录约定（v1）

把 Cursor（以及后续 Codex / Claude / OpenCode）的 **skills**、**rules**、**MCP 片段**按固定目录放进 R2。v1 只是**约定 + 手动拉取/推送**：用现有 MCP 工具或网页端即可。不做文件监听。密钥不当文件存。

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

## Cursor 落地路径（v1）

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

## 手动拉取 / 推送（v1）

`GET /api/list` 和 MCP `list` 都是 **Depth 1**，要自己一层层走。

拉取（远端 → Cursor），先 project：

1. `list` `agents/cursor/<project>/skills/`（再 `rules/`、`mcp/`）→ `download` 到上表的项目 `.cursor/…`。
2. 再处理 `agents/cursor/{skills,rules,mcp}/` → 用户级路径。project 层已经有的同名文件跳过。
3. 最后 `agents/global/…`。

推送（Cursor → 远端）：先 `mkdir` 远端目录，再 `upload`（或网页端）。上传 `mcp.json` 前去掉密钥。MCP 上传超过 1 MiB 会自动分块（上限 25 MB）；再大走网页端或 davflare-cli。

v2 会加 `pull` / `push` 两个工具自动走这棵树。v3 再接其它 agent 和冲突策略。在此之前不要自动同步、不要监听本地磁盘。

## 网页端

文件浏览器可以直接建、改这套 `agents/…` 目录。这是不经过 MCP 客户端时的正式管理方式。
