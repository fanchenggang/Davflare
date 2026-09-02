# 静态站点（v1）

把 R2 里的目录当成公开网站，挂在**单独的域名**上。和网盘同一个 Worker，按 `Host` 分流。绝不要在网盘源上直接吐 HTML——上传的页面能读到 `localStorage` 登录态。

## 开启

1. 给同一个 Cloudflare Pages 项目绑自定义域：`sites.<你的域>`。
2. 在 Cloudflare 控制台给 Pages 项目添加环境变量 `SITES_HOST=sites.<你的域>`（Production 和/或 Preview；只要主机名，不要 `https://`）。**不要**写死在 `wrangler.toml` 的 `[vars]` 里。
3. 重新部署。`SITES_HOST` 为空则功能关闭。

> `SITES_HOST` 必须是**打开网盘之外**的主机名。若设成网盘自己的域名，站点内容会遮蔽该域名的全部 GET/HEAD，网盘直接不可用。

网盘域名（`*.pages.dev` 或应用域）不变。站点域上不开放 `/api`、`/mcp`、`/webdav`。

## 发布

把目录上传到 `sites/{slug}/`（网页端站点 zip 部署、开放接口、MCP 的 `mkdir` + `upload`，或 davflare-cli cp/sync）。`{slug}` 为 `[a-z0-9][a-z0-9-]{0,62}`。

```
sites/blog/index.html
sites/blog/style.css
```

然后打开 `https://sites.<你的域>/blog/`（或 `/blog/style.css`）。没有文件就是 404。目录 URL 找 `index.html`。不做 git 部署，不为每个站再建一个 Pages 项目。

## 管理 API 与界面

- 网页端：打开「站点」区块（`#/sites`）——站点列表与统计、zip 一键部署（浏览器解压后走上传队列）、SPA 开关、按站删除；「管理文件」直接跳到 `sites/<slug>/` 的常规文件管理器。
- MCP：`sites_list`、`sites_config`、`sites_delete`（同一套 `/api/sites`）。
- `GET /api/sites` — 列站点（`?stats=1` 附带缓存的文件数/总大小）。会话（Basic）或 API key 均可。
- `POST /api/sites` — `{"slug":"blog","spa":true}` 切换 SPA 回退；站点需已存在。
- `DELETE /api/sites?slug=blog` — 删除站点全部文件（保留配置，重新部署同 slug 时 SPA 开关仍在）；加 `&purge=1` 连配置一起删。
- SPA 回退：最终未命中时，`spa=true` 以 200 返回 `sites/<slug>/index.html`；否则若存在 `sites/<slug>/404.html` 以 404 状态返回它。

## 安全

- `SITES_HOST` 必须与网盘自身主机名不同（见上方警告）：两者相同时站点中间件会接管该域名的全部 GET/HEAD 请求。
- 和网盘不同源：站点脚本读不到网盘登录态。
- 所有 slug 共用站点域（`sites.domain/a/` 和 `/b/`）。自己用没问题；不要在同一站点域托管别人不可信的 HTML。
- 不要把 API 密钥写进上传的 HTML。
