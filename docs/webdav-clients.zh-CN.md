# WebDAV 客户端兼容实测表

[English](webdav-clients.md) | [中文](webdav-clients.zh-CN.md)

← [WebDAV](webdav.zh-CN.md) · [README](../README.zh-CN.md)

**只写真测过的结果**；没跑过的一律标 **待验证**，不编造。

地址：`https://<你的域名>/webdav/` · 鉴权：Basic（`WEBDAV_USERNAME` / `WEBDAV_PASSWORD`）· 单文件 **&lt; 100MB**。

## 实测表（截至 2026-10-13）

| 客户端 | 版本 / 测法 | 结果 | 实际做了什么 |
| --- | --- | --- | --- |
| **rclone** | CLI **1.75.2**，`vendor=other` | ✅ 通过 | 本地 `wrangler pages dev`：`mkdir` / `copy` / `ls` / `cat` / `moveto` / `delete` / `purge`；中文文件名；1 MiB 二进制 |
| **litmus** | Debian 包 **0.13** | ✅ 通过（`basic` `copymove` `props`） | CI 跑这三套（100%）。`locks` 39/41；`http` 的 `expect100` 失败 —— 见 [litmus 已知缺口](#litmus-已知缺口) |
| **Obsidian · Remotely Save** | 插件 **0.5.25** 请求序列（本地 `webdav` 客户端 + README 回放） | ✅ 通过 | OPTIONS（CORS）→ MKCOL → PUT（含中文/空格）→ PROPFIND Depth 1 / infinity → 改名/删除；详见 [README](../README.zh-CN.md#10-分钟搭一个免费的-obsidian-同步) |
| **阅读 / Legado** | 安卓 App；修复见 [#175](https://github.com/fanchenggang/Davflare/pull/175) | ✅ 通过（作者真机） | 需要带 `d:` 前缀的 DAV XML（`<d:multistatus xmlns:d="DAV:">`）。作者合入后真机备份/恢复正常。本环境无安卓 GUI，只复检了本地 PROPFIND 的 `d:` 形状 |
| **Cyberduck** | 桌面 GUI | 待验证 | 无图形界面，此处跑不了 |
| **Zotero**（WebDAV 同步） | 桌面 | 待验证 | 需 GUI / 账号流程 |
| **Joplin**（WebDAV 同步） | 桌面 / 移动 | 待验证 | 需 GUI |
| **Cx File Explorer** / **BD File Manager** | 安卓 | 待验证 | [webdav.zh-CN.md](webdav.zh-CN.md) 里作示例提到；无真机 |
| **WinSCP** / **Mountain Duck** / **macOS Finder** | 桌面 | 待验证 | 无 GUI |

## CI 里的 litmus

```bash
# 本地（需 litmus + Node + wrangler）
npm run test:litmus
# 复用已有 build/
SKIP_BUILD=1 npm run test:litmus
```

CI：现有 [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) 的 **E2E** job 在 `api-e2e.sh` 之后跑 litmus（`TESTS="basic copymove props"`；自动 `apt install litmus`）。本地：`npm run test:litmus` 或 `npm run test:e2e`。

README 徽章跟 CI 工作流（标签 **WebDAV litmus**）。

### litmus 已知缺口

| 套件 | 本地 0.13 结果 | 说明 |
| --- | --- | --- |
| `basic` | 16/16 | — |
| `copymove` | 13/13 | — |
| `props` | 30/30 | 死属性 / PROPPATCH |
| `locks` | 39/41 | 失败：`copy` 锁定资源（423）、`fail_complex_cond_put`（复杂 `If` 期望 412）。其余 Class 2 锁定可用 |
| `http` | 3/4 | `expect100` 超时 —— Pages/miniflare 对 HTTP 100-continue 与 litmus 预期不一致 |

CI **不**把 `locks` / `http` 算失败；改锁定逻辑时可本地：`TESTS="basic copymove props locks http" npm run test:litmus`。

## rclone 快速自检

```bash
rclone config   # webdav，URL …/webdav/，vendor other，用户名密码 = Pages 环境变量
rclone ls davflare:
rclone copy ./notes/ davflare:notes/
```

## 欢迎补测

验证了「待验证」客户端后，请提 PR 同时改中英两份表，写明：客户端名、版本、日期（Asia/Shanghai）、具体操作（列目录/上传/下载/改名/删除）。没有证据不要标通过。
