# 部署

[English](deploy.md) | [中文](deploy.zh-CN.md)

← [README](../README.zh-CN.md)

## 本项目是 Cloudflare Pages

Davflare 以 **Cloudflare Pages** 方式部署（静态 UI 在 `build/`，后端在 `functions/`，即 Pages Functions）。

仓库内依据：

- `wrangler.toml` 有 `pages_build_output_dir = "build"`
- **没有** Worker `main` 入口——不要为了迁就 Workers 工具而伪造一个
- 正确 CLI：`npx wrangler pages deploy build`
- **错误** CLI：`npx wrangler deploy`（Workers）→ «Missing entry-point / entry point not configured»
- **错误** 按钮：[Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/Davflare) —— 同样会踩坑

你需要一个已绑定支付方式、并已开通 R2 的 [Cloudflare](https://dash.cloudflare.com/) 账号（至少创建一个 bucket）。

## 用 Cloudflare 控制台部署（推荐）

Cloudflare **没有**与 Workers「一键 Deploy」对等的官方 Pages 按钮。请走控制台：

1. 打开 [Workers & Pages → Create](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create)
2. 选择 **Pages** → **Connect to Git** → 选 `fanchenggang/Davflare`（或你的 fork）
3. 构建设置：
   - 框架预设：**None**（React/Vite，不是 Docusaurus）
   - 构建命令：`npm run build`
   - 输出目录：`build`
4. 先部署，再配置绑定 / 环境变量（下一节），并**重新部署**使配置生效

官方说明：[Pages Git 集成](https://developers.cloudflare.com/pages/get-started/git-integration/)。

## 首次部署之后

1. 将 R2 bucket 绑定到 `BUCKET` 变量
2. 设置 `WEBDAV_USERNAME` 和 `WEBDAV_PASSWORD`
3. 可选：`WEBDAV_PUBLIC_READ=1` 开启公开读取；`TRASH_RETENTION_DAYS`（默认 `30`，`-1` 关闭清理）
4. 可选静态站点：把 `sites.<你的域>` 绑到同一个 Pages 项目，并设置 `SITES_HOST=sites.<你的域>`
5. 重新部署，使绑定和环境变量生效
6. 可选：给网盘界面绑自定义域名

## Wrangler CLI（Pages）

`wrangler.toml` 将 R2 绑定为 `BUCKET`（默认 bucket 名为 `webdav`）。如有需要，把 `bucket_name` 改成你的 bucket。

```bash
npm run build
npx wrangler pages deploy build
```

**不要**对本仓库执行 `npx wrangler deploy`——那是 Workers 路径，会报没有配置 entry point。

本地预览（Pages + Functions）：

```bash
npm run build
npx wrangler pages dev build
```

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

在界面里切换：

1. 从账号菜单打开 `#/settings`。
2. 切换任意开关。关闭开关不会删除已有文件。
3. MCP 依赖 API Key：Key 关闭时，即使 MCP 打开，`/mcp` 也是 404。站点和图床的公开地址还需要 `SITES_HOST`。

部署完成后可打开 `#/setup`（设置页也有入口）做会话级检查清单：R2 读写、WebDAV PROPFIND、五个功能开关、`SITES_HOST`、以及 MCP `tools/list`（尚未创建 API 密钥时跳过，不会自动造密钥）。适用项全部通过后，页面提供一键复制 Cursor `mcp.json`（`url` + `Bearer <apiKey>` 占位符）。

另见 [webdav.zh-CN.md](./webdav.zh-CN.md)、[sites.zh-CN.md](./sites.zh-CN.md)、[API.zh-CN.md](./API.zh-CN.md)。
