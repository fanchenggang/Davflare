# 书签可移植性：格式、字段映射与冲突策略

> Davflare 扩展书签的进出通道：Netscape HTML、Davflare JSON 备份、浏览器书签栏、HamHome 同步目录。覆盖 issue #53、#65、#64 落地的能力（2026-09）。

## 文件一览

| 文件 | 角色 | 权威面 |
|------|------|--------|
| `bookmarks.html`（Netscape 格式） | 可被浏览器导入的导出文件，存于 WebDAV | 成员、标题、文件夹路径 |
| `bookmarks.json`（JSON sidecar） | WebDAV 上的富字段伴随文件 | 标签、备注、id、置顶、声明的空文件夹 |
| `davflare-bookmarks.json`（下载） | 手动迁移用完整备份 | 与 sidecar 相同 |
| `/HamHomeSync/bookmarks/meta.json` + `/HamHomeSync/categories.json` | HamHome 互操作 | HamHome 自身的 id / updatedAt |

`bookmarks.html` 始终是成员权威——浏览器能重新导入它，远端变更后库页也以它为准。JSON sidecar 补充 Netscape 装不下的字段（`adoptRichFields` 回填）：标签、备注、id、置顶（pinned/pinnedAt）与声明的空文件夹。

## 导入

`Bookmarks.importBackup(text, HamHome)` 在解析前先嗅探格式：

1. 以 `{` 或 `[` 开头的是 JSON。`sniffJsonImport` 按行键判断口味：出现 `categoryId` / `description` / `createdAt` → HamHome；出现 `folder` / `note` / `added` / `id` → Davflare。裸数组按 HamHome 形态处理。
2. 其余一律按 Netscape HTML 解析（有 DOMParser 用 DOMParser；MV3 Service Worker 无 DOM 时走内置分词器，#75）。

所有导入按 URL 合并：库里已有的条目获胜（base wins），导入不会重复、也不会覆盖现有数据。URL 判等会去掉 http(s) 链接的 `#hash`（`urlKey`）。

## 导出

- **HTML** —— 纯 Netscape 文件，文件夹渲染为 `<H3>`/`<DL>`（含声明的空文件夹），可被 Chrome/Firefox 重新导入。
- **JSON** —— `davflare-bookmarks.json`，完整模型 `{version, bookmarks, folders}`，再次导入可还原文件夹、标签、备注与置顶。
- **浏览器书签栏**（#64）—— 通过 `chrome.bookmarks` 把书签库写回 Chrome。选项：目标文件夹（来自浏览器书签树）、跳过重复（目标夹下已存在的 URL 不重建）、可选先清空目标文件夹（需确认，子项用 `removeTree` 移除）。创建顺序与 HTML 导出一致（先链接后子文件夹），空文件夹也会创建。
- **HamHome 写回**（#64）—— 合并写入已有 HamHome 远端（见下）；先写 `categories.json`、后写 `meta.json`，与 HamHome 自身的安全写序一致。

## HamHome 字段映射

Davflare 模型 → HamHome `meta.json` 行：

| Davflare | HamHome 字段 | 说明 |
|----------|--------------|------|
| `url` | `url` | |
| `title` | `title` | |
| `note` | `description` | |
| `tags` | `tags` | |
| `added` | `createdAt`（0 → 取当前时间） | |
| — | `updatedAt` | 每次写回打上当前时间 |
| `folder` 路径 | `categoryId` | `""`（未分类）→ `null`；路径 → 分类 id |
| — | `id` | 同 URL 命中时保留 HamHome 原 id；新行用 `dav-<urlhash>` |
| — | `hasSnapshot: false` | 快照留在 HamHome 本地 |
| `pinned` | — | 仅 Davflare 有，HamHome 无对应字段 |

HamHome `categories.json` → Davflare 文件夹路径：按 `parentId` 链把 `name` 段用 `/` 连接（`categoryPath`）。`isDeleted: true` 的行导入时跳过、写回时永不更新。

## 冲突策略

- **Davflare 书签库写入**带条件请求（html 的 `If-Match` ETag）。412 表示远端已更新：页面会重载远端副本并提示重试，不会静默覆盖。
- **HamHome 写回永不删除。** 远端有、Davflare 没有的行保持原样，HamHome 下一次基于 id 的 union 同步只会拉入新增/更新。同 URL 的行原地更新（保留 HamHome 的 id、`createdAt`、`favicon`），并推进 `updatedAt` 让 HamHome 视其为较新。
- **分类按签名合并。** 已存在相同 `name` + 父级的 HamHome 分类时复用其 id；否则把文件夹路径声明为新分类（`id` = 路径，`parentId` = 父路径映射的 id）。重复执行写回是幂等的。
- Netscape 文件始终是**成员权威**：任何远端变更后，成员以 html 为准，富字段从 JSON sidecar 回填。因此在 Davflare 删除一条书签会同时从 WebDAV 的 html/JSON 对中移除——但永远不影响 HamHome 自己的库。
