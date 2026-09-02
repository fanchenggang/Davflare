# Davflare

[English](README.md) | [中文](README.zh-CN.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/Davflare)

基于 Cloudflare Pages + Workers 的 R2 网盘 —— 免费 10 GB 存储、每天 10 万次 Worker 调用。[R2 定价](https://developers.cloudflare.com/r2/platform/pricing/)

## 截图

网格浅色：

![网格浅色](docs/screenshots/grid-light.png)

网格深色：

![网格深色](docs/screenshots/grid-dark.png)

图片预览：

![图片预览](docs/screenshots/preview.png)

分享（有效期 + 提取码）：

![分享（有效期 + 提取码）](docs/screenshots/share.png)

## 功能

- 网页端分片上传大文件
- 文件夹、搜索、拖放，以及图片 / 视频 / PDF 缩略图
- 分享链接（限时或永久）、提取码、文件夹 zip 下载
- 回收站，由 `TRASH_RETENTION_DAYS` 控制（默认 30 天；`-1` 关闭；打开回收站时惰性清理最多 200 项）
- WebDAV Class 1/2，路径 `/webdav`（可关闭，不影响网页端文件管理）
- API Key，可用于脚本上传、下载与双向同步
- 远程 MCP，路径 `/mcp`（15 个工具：文件、搜索、移动/复制、分享、站点）。上传超过 1 MiB 自动分块，上限 25 MB；下载用 `part` 分页。**MCP 依赖 API Key**：若 API Key 开关关闭，即使 MCP 开关打开，`/mcp` 也是 404
- 网页端站点管理（`#/sites`）：zip 一键部署、SPA 开关、按站删除
- 静态站点走单独域名（`SITES_HOST` + `sites/{slug}/`）；[docs/sites.zh-CN.md](docs/sites.zh-CN.md)
- 图床走同一站点域名的 `/i/{id}`（对象存在 `_$flaredrive$/img/`，不与 `sites/` 或分享链接混用）
- 拥有者设置页（`#/settings`）五个功能开关（默认全部开启，持久化到 R2）
- `davflare-cli`：login / ls / mkdir / rm / mv / cp / sync（[cli/README.md](cli/README.md)）
- Agent 目录约定：`agents/{global|agent|agent/project}/{skills|rules|mcp}/`（手动拉取/推送，见 [docs/agents.zh-CN.md](docs/agents.zh-CN.md)）
- 中 / 英界面（标题栏地球图标；默认跟随浏览器语言，并保存在本地）

## 跟着做

三条短路径。请用**你自己绑定的域名**——没有别人能打开的公开演示站。

### 用 Cursor 对话发布静态站

1. 在 `#/settings` 保持 **API Key** 和 **MCP** 打开。创建一把密钥（账号菜单 → 开放接口），按 [MCP](#mcp) 写进 Cursor 的 `mcp.json`。
2. 对 Cursor 说（可直接粘贴）：

   ```
   把这个文件夹上传到 Davflare 的 sites/hello/（自动建父目录，同名覆盖）。如果是 SPA，再对 slug hello 调用 sites_config。
   ```

3. 在你绑到**本** Pages 项目的主机上打开 `https://<SITES_HOST>/hello/`。未设置 `SITES_HOST` 并重新部署之前，这个地址打不开。

### 图床拖放并复制链接

1. 打开网盘里的 `#/images`。
2. 把图片拖到页面上（或点上传）。
3. 点 **复制链接** 或 **复制 Markdown**（`![](https://<SITES_HOST>/i/{id})`）。公开地址只有在绑定自定义域并设置 Pages 环境变量 `SITES_HOST`（只要主机名）之后才可用。

### 设置里的五个开关

1. 从账号菜单打开 `#/settings`。
2. 五个开关是 WebDAV、MCP、API Key、静态站点、图床（默认全部开启）。关闭开关不会删除已有文件。
3. MCP 依赖 API Key：Key 关闭时，即使 MCP 打开，`/mcp` 也是 404。站点和图床的公开地址还需要 `SITES_HOST`。

## 部署

一键部署：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/Davflare)

你需要一个已绑定支付方式、并已开通 R2 的 [Cloudflare](https://dash.cloudflare.com/) 账号（至少创建一个 bucket）。

首次部署之后：

1. 将 R2 bucket 绑定到 `BUCKET` 变量
2. 设置 `WEBDAV_USERNAME` 和 `WEBDAV_PASSWORD`
3. 可选：`WEBDAV_PUBLIC_READ=1` 开启公开读取；`TRASH_RETENTION_DAYS`（默认 `30`，`-1` 关闭清理）
4. 可选静态站点：把 `sites.<你的域>` 绑到同一个 Pages 项目，并设置 `SITES_HOST=sites.<你的域>`
5. 重新部署，使绑定和环境变量生效
6. 可选：给网盘界面绑自定义域名

### 手动部署 Cloudflare Pages

- 框架预设：**None（React CRA，不是 Docusaurus）**
- 输出目录：`build`
- 然后绑定 `BUCKET`、设置上述环境变量，并重新部署

### Wrangler CLI

`wrangler.toml` 将 R2 绑定为 `BUCKET`（默认 bucket 名为 `webdav`）。如有需要，把 `bucket_name` 改成你的 bucket。

```bash
npm run build
npx wrangler pages deploy build
```

## WebDAV

地址：`https://<your-domain.com>/webdav`

可用任意 WebDAV 客户端（例如 [Cx File Explorer](https://play.google.com/store/apps/details?id=com.cxinventor.file.explorer) 或 [BD File Manager](https://play.google.com/store/apps/details?id=com.liuzho.file.explorer)）。填入上述地址以及你设置的用户名和密码。

Cloudflare Workers 单次 PUT 上限为 **128 MB**。超限会返回 **HTTP 413**（提示使用网页上传）。大文件请走网页端分片上传。

应用内 WebDAV 面板会显示 URL、用户名，以及是否开启公开读取。**不会**显示密码。

## 开放接口

在网页端「API」 / 「开放接口」创建密钥。鉴权：`Authorization: Bearer <apiKey>` 或 `X-Api-Key: <apiKey>`。完整请求示例见 [开放接口文档](docs/API.zh-CN.md)。

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET / PATCH | `/api/config` | 会话：用户名、公开读取、sitesHost、功能开关。PATCH 仅 Basic |
| GET / POST / DELETE | `/api/images` | 图床（会话）：列出、上传、删除。公开字节在 `SITES_HOST /i/{id}` |
| GET / POST / DELETE | `/api/keys` | 创建、列出、作废密钥（需网页登录会话） |
| POST / PUT / DELETE | `/api/upload` | 上传文件（multipart / 原始 body / 覆盖 / >100MB 分片） |
| GET | `/api/list` | 列出当前目录（size、uploaded、etag） |
| GET | `/api/download` | 下载单个文件（Range / 206 断点续传） |
| POST | `/api/mkdir` | 创建文件夹（自动补齐父目录） |
| POST | `/api/rename` | 重命名 / 移动文件或文件夹 |
| POST | `/api/copy` | 复制文件 |
| GET | `/api/stat` | 对象元数据 |
| GET | `/api/search` | 按文件名子串搜索 |
| POST | `/api/backup` | 冲突时把远端改名为 `name.conflict-<UTC>` |
| DELETE | `/api/delete` | 硬删除，或 `soft=1` 进回收站 |
| POST | `/api/shares` | 分享文件或文件夹（文件夹为 zip） |
| GET / POST / DELETE | `/api/sites` | 列出、配置 SPA、删除静态站 |
| POST | `/mcp` | 远程 MCP（JSON-RPC 2.0；同一把 API 密钥；15 个工具） |

同一把密钥可做双向同步（本地优先，冲突时先备份远端）。详见 [开放接口文档](docs/API.zh-CN.md)。

`GET /api/config`（网页会话）返回用户名、公开读取、`sitesHost` 以及五个功能开关。`PATCH /api/config` 更新开关，**仅允许网页会话（Basic）**，API Key 不能改开关。

## 功能开关

拥有者在设置页（`#/settings`，账号菜单）开关五项能力。配置存在 R2 的 `_$flaredrive$/config.json`，部署后仍保留，**不要**写进 `wrangler.toml`。默认全部**开启**。

| 开关 | 关闭后 |
| --- | --- |
| WebDAV | 隐藏 WebDAV 按钮/面板。客户端无法挂载 `/webdav`（404）。网页端文件管理仍走会话接口。 |
| MCP | `POST /mcp` → 404；隐藏 API 面板里的 MCP 说明。 |
| API Key | 隐藏密钥管理。Bearer / `X-Api-Key` 开放接口返回 401。网页会话接口不受影响。**MCP 也会 404/不可用**（因为它用 API Key 鉴权）。 |
| 静态站点 | 隐藏 `#/sites`。`SITES_HOST` 上的 slug 站点 404。不会删除 `sites/` 下的对象。 |
| 图床 | 隐藏图床界面。`SITES_HOST` 上的 `/i/*` 404。不会删除已存图片。 |

`SITES_HOST` 为空时，基础设施层仍不对外提供站点/图床。绑定主机后，站点与图床开关是额外的产品开关。

## MCP

同源 Model Context Protocol（Streamable HTTP），路径 `POST /mcp`。鉴权与开放接口相同（`Authorization: Bearer <apiKey>` 或 `X-Api-Key`）。**MCP 依赖 API Key：API Key 开关关闭后，即使 MCP 开关仍打开也无法使用。**

工具（15 个）：`list`、`upload`、`download`、`mkdir`、`delete`、`search`、`move`、`copy`、`stat`、`share_create`、`share_list`、`share_revoke`、`sites_list`、`sites_config`、`sites_delete`。

不超过 1 MiB 的上传走内联；更大内容自动分块（上限 **25 MB**）。再大请用网页端或 `davflare-cli`。下载超过 1 MiB 用 `part` / `partSize` 分页。`delete` 默认进回收站，`hard=true` 永久删除。把文件上传到 `sites/{slug}/` 即发布静态站，需要 SPA 回退再调 `sites_config`。详见 [docs/API.zh-CN.md](docs/API.zh-CN.md)。

Cursor（`mcp.json`）：

```json
{
  "mcpServers": {
    "davflare": {
      "url": "https://<your-domain.com>/mcp",
      "headers": {
        "Authorization": "Bearer <apiKey>"
      }
    }
  }
}
```

## 静态站点

`sites/{slug}/` 下的 HTML 只在**单独域名**（`SITES_HOST`）上提供。同一个 Worker，按 Host 分流，不是网盘源上的 `/sites`。

网页端「站点」（`#/sites`）可看每个 slug 的统计、zip 一键部署、SPA 开关和删除。MCP 的 `sites_list` / `sites_config` / `sites_delete` 包装同一套 `/api/sites`。详见 [docs/sites.zh-CN.md](docs/sites.zh-CN.md)。

## 命令行

[`davflare-cli`](cli/README.md) 是开放接口的命令行客户端：`login`、`ls`、`mkdir`、`rm`、`mv`、`cp`、`sync`。超过 100 MB 自动分块上传，下载支持 HTTP Range 断点续传。安装与同步语义见 `cli/README.md`。

## 图床

在网盘界面（`#/images`）拖放上传图片，复制公开 URL 或 Markdown `![](url)`，列出并删除。对象存在 `_$flaredrive$/img/{id}`，`{id}` 为不可猜测的随机值，不是原文件名。公开地址仅为 `https://<SITES_HOST>/i/{id}`（`SITES_HOST` 不含协议）。SVG 以附件下发（`Content-Disposition: attachment` + `nosniff`），不会当成可执行页面打开。

站点域名上先匹配 `/i/{id}`，再走 slug 静态站。图床开关与站点开关独立：站点关、图床开 → slug 404 但 `/i/{id}` 可用；图床关 → 即使站点开，`/i/*` 也是 404。未配置 `SITES_HOST` 时开关仍在，界面会提示先绑定该域名。

## Agent 目录

skills / rules / MCP 片段放在 R2 的 `agents/` 下。v1 只是目录约定 + 用现有 MCP 工具（或网页端）手动拉取/推送。合并顺序：project 覆盖 agent 覆盖 global。`mcp.json` 里不要存明文密钥，用 `${env:DAVFLARE_API_KEY}`。Cursor 落地路径和走目录步骤见 [docs/agents.zh-CN.md](docs/agents.zh-CN.md)。

## 开发与测试

```bash
npm install

npm run typecheck   # tsc --noEmit (covers src/ and functions/)
npm test            # Jest unit tests (interactive watch)
npm run test:ci     # Jest unit tests, single CI-friendly run
npm run build       # production build into build/

npm run test:e2e    # one-shot API regression: build → wrangler pages dev (local miniflare R2) → scripts/api-e2e.sh
SKIP_BUILD=1 npm run test:e2e   # reuse an existing build/ for faster iterations
```

`test:e2e` 会在缺少时创建本地 `.dev.vars`（已 gitignore）写入开发凭据，在 8788 端口启动 `wrangler pages dev`（可用 `PORT` 覆盖），等待就绪后跑约 79 条断言，再关掉服务。数据在 `.wrangler/state/` —— 删除该目录即可重置本地 bucket。完整验证记录见 [TESTING.md](./TESTING.md)，手工 GUI 用例库见 [TEST_CASES.md](./TEST_CASES.md)。

## 致谢

- [longern/FlareDrive](https://github.com/longern/FlareDrive) by [longern](https://github.com/longern) —— 最初的 fork 来源；本项目此后已全面重写。内部对象前缀仍为 `_$flaredrive$/`。
- [r2-webdav](https://github.com/abersheeran/r2-webdav) by [abersheeran](https://github.com/abersheeran) —— WebDAV 实现。

## 许可证

[MIT](./LICENSE)
