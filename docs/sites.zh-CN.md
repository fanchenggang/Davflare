# 静态站点（v1）

把 R2 里的目录当成公开网站，挂在**单独的域名**上。和网盘同一个 Worker，按 `Host` 分流。绝不要在网盘源上直接吐 HTML——上传的页面能读到 `localStorage` 登录态。

## 开启

1. 给同一个 Cloudflare Pages 项目绑自定义域：`sites.<你的域>`。
2. 设置环境变量 `SITES_HOST=sites.<你的域>`（只要主机名，不要 `https://`）。
3. 重新部署。`SITES_HOST` 为空则功能关闭。

> `SITES_HOST` 必须是**打开网盘之外**的主机名。若设成网盘自己的域名，站点内容会遮蔽该域名的全部 GET/HEAD，网盘直接不可用。

网盘域名（`*.pages.dev` 或应用域）不变。站点域上不开放 `/api`、`/mcp`、`/webdav`。

## 发布

把目录上传到 `sites/{slug}/`（网页端、开放接口，或 MCP 的 `mkdir` + `upload`）。`{slug}` 为 `[a-z0-9][a-z0-9-]{0,62}`。

```
sites/blog/index.html
sites/blog/style.css
```

然后打开 `https://sites.<你的域>/blog/`（或 `/blog/style.css`）。没有文件就是 404。目录 URL 找 `index.html`。不做 git 部署，不为每个站再建一个 Pages 项目。

## 安全

- `SITES_HOST` 必须与网盘自身主机名不同（见上方警告）：两者相同时站点中间件会接管该域名的全部 GET/HEAD 请求。
- 和网盘不同源：站点脚本读不到网盘登录态。
- 所有 slug 共用站点域（`sites.domain/a/` 和 `/b/`）。自己用没问题；不要在同一站点域托管别人不可信的 HTML。
- 不要把 API 密钥写进上传的 HTML。
