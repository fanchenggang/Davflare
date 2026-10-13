# picgo-plugin-davflare

[Davflare](https://github.com/fanchenggang/Davflare) 的 [PicGo](https://github.com/Molunerfinn/PicGo) / [PicList](https://github.com/Kuingsmile/PicList) 上传插件。

走现有 `POST /api/images`（API Key），公开地址为响应里的 `https://<SITES_HOST>/i/{id}`。**不新增 Davflare 接口。**

## 前提

1. 已部署 Davflare，**API Key** 与 **图床** 开关打开，并配置了 `SITES_HOST`。
2. 在网页端创建一把 API Key（`fd_…`）。
3. PicGo ≥ 2.3 / PicGo-Core ≥ 1.5，或 PicList。

## 安装

### npm（发布之后）

```bash
picgo install picgo-plugin-davflare
# 或 PicGo 图形界面：插件设置 → 搜索 picgo-plugin-davflare
```

### 本地（本仓库，未 publish 时）

```bash
picgo install "$(pwd)/picgo-plugin-davflare"

# 开发可 npm link
cd picgo-plugin-davflare && npm link
picgo use davflare
```

PicGo 图形界面：**插件设置 → 导入本地插件** → 选本目录。

## 配置

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| Site URL | 网盘源站地址（不是 `SITES_HOST`） | `https://drive.example.com` |
| API Key | Bearer / `X-Api-Key` | `fd_…` |

当前图床选 **Davflare**。

## 发布到 npm（仅维护者）

包在 Davflare 仓库内。**不要用 CI 机器人发布** —— 由仓库主人在需要时执行：

```bash
cd picgo-plugin-davflare
# 如需升版本先改 package.json
npm login
npm publish --access public
```

发布后用户即可 `picgo install picgo-plugin-davflare`。

## 原理

1. `POST https://<网盘>/api/images`，multipart 字段 `file`（或原始体 + `X-File-Name`）。
2. 请求头：`Authorization: Bearer <key>` 与 `X-Api-Key: <key>`。
3. 响应 `{ url, markdown, id, … }`，插件把 `imgUrl` 设为 `url`。

详见 [docs/sites.zh-CN.md](../docs/sites.zh-CN.md) 与设置页 **图床客户端**。

## 许可证

MIT
