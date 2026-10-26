# Davflare 官方 Agents 技能

教 Cursor / Claude / Codex 用现有 **MCP `/mcp`**（约 25 个工具）与 **Open API**：存文件、建分享、`publish_site`、图床。**不新增接口。**

权威文案：[`skills/davflare/SKILL.md`](../../../skills/davflare/SKILL.md)  
设置页：`#/settings` → **Agents 技能（官方 skill）**（复制 / 下载 `SKILL.md`）

> 与设置页 → **接入 Claude / Cursor MCP** 分开：那边只导出 `mcp.json` 接线。

## 30 秒安装

```bash
npx skills add fanchenggang/Davflare --skill davflare
# Cursor 全局：
npx skills add fanchenggang/Davflare --skill davflare -g -a cursor
```

手动拷贝：

| 目标 | 路径 |
| --- | --- |
| Cursor 用户技能 | `~/.cursor/skills/davflare/SKILL.md` |
| 项目 / agents | `<仓库>/.agents/skills/davflare/SKILL.md` 或 `.cursor/skills/davflare/SKILL.md` |

或打开你的网盘 → `#/settings` → **Agents 技能** → **复制 skill** / **下载 SKILL.md**，粘到上表路径之一。

## 技能覆盖

- Davflare 是什么（Pages + R2；Web UI / WebDAV / MCP / Open API）
- 鉴权只用 `${env:DAVFLARE_API_KEY}`（文件里不要明文 `fd_…`）
- 核心 MCP 工具 + agents R2 目录（`pull` / `push`）
- 剧本：`publish_site`、图床、分享
- 指向仓库内示例（`hello-site`、`mcp-export` 等）

## 前置

1. 已部署 Davflare；`#/settings` 保持 **API Key** + **MCP** 开启并创建密钥。
2. 先接好 MCP（设置页 → **接入 Claude / Cursor MCP**，或 [`../mcp-export/`](../mcp-export/)）。
3. 可选：配置 `SITES_HOST`（只要主机名）以使用站点 / 图床。

更多：[docs/agents.zh-CN.md](../../../docs/agents.zh-CN.md)。
