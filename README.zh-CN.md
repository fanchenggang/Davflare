# Davflare

[English](README.md) | [中文](README.zh-CN.md)

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy%20to%20Cloudflare-Pages-F38020?logo=cloudflare&logoColor=white)](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create) · [部署说明](docs/deploy.zh-CN.md)

基于 **Cloudflare Pages**（API 走 Pages Functions）的 R2 网盘 —— 免费 10 GB 存储、每天 10 万次调用。[R2 定价](https://developers.cloudflare.com/r2/platform/pricing/)

> **这是 Pages，不是 Workers。** 本仓库在 `wrangler.toml` 里配置了 `pages_build_output_dir`，没有 Worker `main`。请**不要**用 [Workers 一键部署按钮](https://deploy.workers.cloudflare.com/) 或 `wrangler deploy`——那会去找 Worker 入口，并报 «entry point not configured / entry point 没有配置」。

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

- 网页端分片上传、文件夹、搜索、拖放，以及图片 / 视频 / PDF 缩略图
- 分享链接（限时或永久）、提取码、文件夹 zip，以及零脚本落地页
- 回收站，保留天数可配（`TRASH_RETENTION_DAYS`）
- WebDAV Class 1/2，路径 `/webdav`（可关闭，不影响网页端）
- API Key 支持脚本上传 / 下载 / 同步，远程 MCP 在 `/mcp`（25 个工具）
- 静态站点与图床走单独域名（`SITES_HOST`），并提供 GitHub Action 从 CI 一步发布
- 拥有者设置页五个持久化功能开关
- `davflare-cli`、可选 Chrome MV3 扩展，以及 R2 上的 Agent 目录约定
- 中 / 英界面

## 快速开始

1. 打开 [Workers & Pages → Create](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create) → **Pages** → **Connect to Git**，选择本仓库（需要已开通 R2、并绑定支付方式的 Cloudflare 账号）。
2. 框架预设选 **None**，构建命令 `npm run build`，输出目录 `build`（也可直接用 `wrangler.toml` 里的 `pages_build_output_dir`）。
3. 将 R2 bucket 绑定到 `BUCKET`，设置 `WEBDAV_USERNAME` 和 `WEBDAV_PASSWORD`，然后重新部署。
4. 可选：`WEBDAV_PUBLIC_READ=1`、`TRASH_RETENTION_DAYS`（默认 `30`，`-1` 关闭）；公开站点/图床请绑 `sites.<你的域>` 并设 `SITES_HOST=sites.<你的域>`。
5. 可选：给网盘界面绑自定义域名。

完整 Pages / Wrangler 步骤与五个功能开关见 [docs/deploy.zh-CN.md](docs/deploy.zh-CN.md)。

## 10 分钟搭一个免费的 Obsidian 同步

用 Obsidian 社区插件 [Remotely Save](https://github.com/remotely-save/remotely-save) 把库同步到 Davflare 的 WebDAV（`/webdav`），多台设备共用一份，不用额外服务器。

1. 按上面「快速开始」部署 Davflare，`#/settings` 里 WebDAV 开关保持打开（默认开）。
2. 打开网盘 → 顶栏 **WebDAV** → **Obsidian 同步** 卡片，点「复制服务器地址」（形如 `https://<你的域名>/webdav/`）和「复制用户名」。密码就是 `WEBDAV_PASSWORD`（网页登录密码），卡片里不显示。
3. Obsidian → 设置 → 第三方插件。新建的库要先关闭**安全模式**（开启社区插件），之后才会出现「**浏览**」按钮；点「浏览」，搜索安装并启用 **Remotely Save**。
4. Remotely Save 设置里：
   - 选择远程服务：**Webdav**
   - 服务器地址 / 用户名 / 密码：填第 2 步的内容
   - 鉴权类型：**basic**
   - 发送到服务器的 Depth header：保持默认 **只支持 depth='1'**
   - 远端基文件夹：留空（默认用库名，在 WebDAV 根目录下建同名文件夹）；两台设备库名不同时，改成同一个名字（单层，不能含 `/`），改完要点旁边的「**确认**」，否则不会保存
5. 点「检查可否连接」→「检查」，看到连接成功的提示。
6. 点左侧边栏的 Remotely Save 图标同步一次。第一次同步前插件会弹出「**HUGE updates on the sync algorithm**」说明：勾选两个复选框后点「**Agree**」（点「Disagree」会卸载插件）。
7. 第二台设备：建议先**新建一个同名的空库**，按第 3–5 步同样配置，再同步一次就能拿到同样的内容。

已实测（本地 `wrangler pages dev` + 与插件相同的 `webdav` 客户端，按 Remotely Save 0.5.25 的请求序列模拟两台设备双向同步）：中文文件名、空格、`+ & ' % #` 等特殊字符、多层目录、空目录、PNG / PDF 附件、5MB / 12MB 大文件、删除、文件改名、目录改名，以及 depth='1' 与 depth='infinity' 两种列目录方式。

限制：单个文件需小于 100MB（Cloudflare 单次请求体上限，超出返回 413）；Remotely Save 把改名同步为「删除旧文件 + 上传新文件」。

## 文档

| 主题 | 链接 |
| --- | --- |
| 部署、环境变量、功能开关、部署后 `#/setup` 检查清单；MCP 试玩台 `#/mcp` | [docs/deploy.zh-CN.md](docs/deploy.zh-CN.md) · [docs/API.zh-CN.md](docs/API.zh-CN.md) |
| WebDAV 客户端与限制 | [docs/webdav.zh-CN.md](docs/webdav.zh-CN.md) |
| 开放接口与 MCP（含对话分享 / 目录打 zip 示例） | [docs/API.zh-CN.md](docs/API.zh-CN.md) |
| 静态站点与图床 | [docs/sites.zh-CN.md](docs/sites.zh-CN.md) |
| GitHub Action —— CI 一步发布构建目录为静态站（`uses: fanchenggang/Davflare@main`） | [docs/sites.zh-CN.md#github-actiondeploy-to-davflare-site](docs/sites.zh-CN.md#github-actiondeploy-to-davflare-site) |
| Agent 目录（`pull` / `push`） | [docs/agents.zh-CN.md](docs/agents.zh-CN.md) |
| 命令行（`davflare-cli`） | [cli/README.md](cli/README.md) |
| Chrome 扩展（安装 + 书签） | [extension/README.zh-CN.md](extension/README.zh-CN.md) |
| 书签可移植性 | [docs/bookmarks-portability.zh-CN.md](docs/bookmarks-portability.zh-CN.md) |
| 测试 | [TESTING.md](TESTING.md) · [TEST_CASES.md](TEST_CASES.md) |

## 致谢

- [longern/FlareDrive](https://github.com/longern/FlareDrive) by [longern](https://github.com/longern) —— 最初的 fork 来源；本项目此后已全面重写。内部对象前缀仍为 `_$flaredrive$/`。
- [r2-webdav](https://github.com/abersheeran/r2-webdav) by [abersheeran](https://github.com/abersheeran) —— WebDAV 实现。
- [HamHome](https://github.com/bingoYB/ham_home) by [bingoYB](https://github.com/bingoYB) —— 书签库交互参考，感谢开源。

## 许可证

[MIT](./LICENSE)
