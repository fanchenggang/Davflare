# 静态站点（v1）

把 R2 里的目录当成公开网站，挂在**单独的域名**上。和网盘同一个 Worker，按 `Host` 分流。绝不要在网盘源上直接吐 HTML——上传的页面能读到 `localStorage` 登录态。

## 开启

1. 给同一个 Cloudflare Pages 项目绑自定义域：`sites.<你的域>`。
2. 在 Cloudflare 控制台给 Pages 项目添加环境变量 `SITES_HOST=sites.<你的域>`（Production 和/或 Preview；只要主机名，不要 `https://`）。**不要**写死在 `wrangler.toml` 的 `[vars]` 里。
3. 重新部署。`SITES_HOST` 为空则功能关闭。

> `SITES_HOST` 必须是**打开网盘之外**的主机名。若设成网盘自己的域名，站点内容会遮蔽该域名的全部 GET/HEAD，网盘直接不可用。

网盘域名（`*.pages.dev` 或应用域）不变。站点域上不开放 `/api`、`/mcp`、`/webdav`。

此域名上先匹配 `/i/{id}`（图床），再走 slug 静态站。图床与站点功能开关互相独立：站点关、图床开时 `/i/{id}` 仍可用；图床关时即使站点开，`/i/*` 也是 404。图片对象存在 `_$flaredrive$/img/{id}`，不在 `sites/` 下。

## 发布

把目录上传到 `sites/{slug}/`（网页端文件管理器选中文件夹「发布为静态站」、站点 zip 部署、开放接口、MCP 的 `mkdir` + `upload`、MCP `publish_site` 从网盘目录同步，或 `davflare sites publish ./dist --slug <slug>` / davflare-cli cp/sync）。`{slug}` 为 `[a-z0-9][a-z0-9-]{0,62}`。

```
sites/blog/index.html
sites/blog/style.css
```

然后打开 `https://sites.<你的域>/blog/`（或 `/blog/style.css`）。没有文件就是 404。目录 URL 找 `index.html`。不为每个站再建一个 Pages 项目；从 CI 发布请用下方 [GitHub Action](#github-actiondeploy-to-davflare-site)。

## GitHub Action（Deploy to Davflare Site）

用官方 composite action 在 CI 里发布构建目录（仓库根目录 `action.yml`；运行时从 action 自身源码构建并调用 `davflare sites publish`，无需 npm 安装 CLI）。

1. 在网盘网页端「API 密钥」里创建一把密钥。
2. 在你的仓库 **Settings → Secrets and variables → Actions** 添加 `DAVFLARE_URL`（如 `https://drive.example.com`，带 `https://`）和 `DAVFLARE_API_KEY`。
3. 添加 workflow：

```yaml
# .github/workflows/deploy-site.yml
name: Deploy site
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci && npm run build        # 产出 dist/
      - name: Deploy to Davflare Site
        id: davflare
        uses: fanchenggang/Davflare@main
        with:
          path: dist
          slug: my-site
          url: ${{ secrets.DAVFLARE_URL }}
          api-key: ${{ secrets.DAVFLARE_API_KEY }}
      - run: echo "Live at ${{ steps.davflare.outputs.url }}"
```

| 输入 | 必填 | 说明 |
| --- | --- | --- |
| `path` | 是 | 构建产物目录（相对工作区），如 `dist` |
| `slug` | 是 | 站点 slug `[a-z0-9][a-z0-9-]{0,62}` → `https://<SITES_HOST>/<slug>/` |
| `url` | 是 | Davflare 实例地址（放 Secret） |
| `api-key` | 是 | Davflare API 密钥（放 Secret） |

| 输出 | 说明 |
| --- | --- |
| `url` | 站点公开地址（同时打印在日志、notice 注解与 job summary；实例未配置 `SITES_HOST` 时为空并给出警告） |

- **密钥安全：** 密钥只通过环境变量传给 CLI（不进命令行参数），先 `::add-mask::` 屏蔽，脚本不使用 `set -x`。
- **明确失败：** 密钥错误/过期/吊销时在上传前即失败，报 `Davflare API key rejected (401)`；`path`/`slug`/`url`/`api-key` 为空、构建目录不存在或为空、slug 非法、实例不可达也都会带明确信息失败。
- Runner 需 Node.js ≥ 18（GitHub 托管 runner 已预装）。语义同 `davflare sites publish`：同名文件覆盖，SPA / 访问密码 / 自定义域名配置保留。
- 建议生产环境把 `@main` 换成固定 commit SHA。可选 README 徽章：`[![Deploy site](https://github.com/<owner>/<repo>/actions/workflows/deploy-site.yml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/deploy-site.yml)`。
- 手动演示 workflow：[`docs/examples/deploy-site-demo.yml`](examples/deploy-site-demo.yml)——复制到 `.github/workflows/` 后在 **Actions → Deploy site demo → Run workflow** 触发（仅 `workflow_dispatch`；未配置上述两个 Secret 时只提示并跳过）。

## 管理 API 与界面

- 网页端：文件管理器选中文件夹 →「发布为静态站」（`POST /api/sites` 带 `source`，与 MCP `publish_site` 同语义）；「站点」区块（`#/sites`）——列表与统计、zip 一键部署、SPA 开关、可选访问密码、可选自定义域名、按站删除；「管理文件」跳到 `sites/<slug>/`。
- MCP：`sites_list`、`sites_config`、`sites_delete`（同一套 `/api/sites`）。`publish_site` 把网盘目录同步到 `sites/{slug}/`（同名覆盖，不删 SPA 配置）。
- `GET /api/sites` — 列站点（`?stats=1` 附带缓存的文件数/总大小）。会话（Basic）或 API key 均可。
- `POST /api/sites` — `{"slug":"blog","source":"my-folder"}` 把网盘文件夹发布到 `sites/{slug}/`（同名覆盖，保留 SPA 配置；Sites 开关关闭时 404）；或 `{"slug":"blog","spa":true}` 切换 SPA 回退；或 `{"slug":"blog","hostname":"blog.example.com"}` 设置/清除自定义域名（`null`/空串清除；站点需已存在）。
- `DELETE /api/sites?slug=blog` — 删除站点全部文件（保留配置，重新部署同 slug 时 SPA 开关仍在）；加 `&purge=1` 连配置一起删。
- SPA 回退：最终未命中时，`spa=true` 以 200 返回 `sites/<slug>/index.html`；否则若存在 `sites/<slug>/404.html` 以 404 状态返回它。

## 自定义域名（按 slug）

可选：给某个 slug 绑定主机名（如 `blog.example.com`），站点在**域名根路径**提供（`https://blog.example.com/`），而不是 `https://sites.<域>/blog/`。

1. 在「站点」界面（`#/sites`）打开该站的 DNS/自定义域名控件并填写主机名（或 `POST /api/sites`：`{"slug":"blog","hostname":"blog.example.com"}`；`hostname: null` 清除）。
2. DNS：为该主机名添加 **CNAME**，指向本 Pages 项目主机名（如 `flaredrive-xxx.pages.dev` 或 Cloudflare 给出的目标）。
3. Cloudflare 控制台 → Pages → 你的项目 → **Custom domains** → 添加**同一**主机名，让 TLS 落在本 Worker/Pages 部署上。
4. 等域名变为 Active 后打开 `https://blog.example.com/`（根路径）。原有的 `SITES_HOST` 路径访问方式仍然可用。

规则：

- 一个主机名只能对应一个 slug（已被占用返回 409）。
- 主机名须为带至少一个点的 DNS 名（如 `blog.example.com`）；不能等于 `SITES_HOST`。
- **不要**填网盘/管理界面自己的域名——自定义域中间件会遮蔽应用。
- 可与站点访问密码共存：先按 Host 解析 → Basic Auth 门禁 → 再出内容（与未来 `_redirects` 钩子同序）。
- 自定义域名上的 `/api`、`/webdav`、`/mcp`、`/share` 不会映射成站点文件（留给网盘产品路径）。

## 安全

- `SITES_HOST` 必须与网盘自身主机名不同（见上方警告）：两者相同时站点中间件会接管该域名的全部 GET/HEAD 请求。
- 和网盘不同源：站点脚本读不到网盘登录态。
- 所有 slug 共用站点域（`sites.domain/a/` 和 `/b/`）。自己用没问题；不要在同一站点域托管别人不可信的 HTML。
- 不要把 API 密钥写进上传的 HTML。

## 图床界面

在网盘界面（`#/images`）拖放上传图片，复制公开 URL 或 Markdown `![](url)`，列出并删除。对象存在 `_$flaredrive$/img/{id}`，`{id}` 为不可猜测的随机值，不是原文件名。公开地址仅为 `https://<SITES_HOST>/i/{id}`（`SITES_HOST` 不含协议）。SVG 以附件下发（`Content-Disposition: attachment` + `nosniff`），不会当成可执行页面打开。

站点域名上先匹配 `/i/{id}`，再走 slug 静态站。图床开关与站点开关独立：站点关、图床开 → slug 404 但 `/i/{id}` 可用；图床关 → 即使站点开，`/i/*` 也是 404。未配置 `SITES_HOST` 时开关仍在，界面会提示先绑定该域名。
