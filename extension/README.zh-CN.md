# Davflare Chrome 扩展

[English](README.md) | [中文](README.zh-CN.md)

← [README](../README.zh-CN.md)

Chrome Manifest V3 辅助扩展，双模式工具栏：打开**你自己部署的** Davflare 网盘，或打开由实例 WebDAV 支撑的书签库。不在 Chrome 网上应用店上架。

- **设置内嵌在主页**：没有独立选项页。首次打开扩展页会直接进入设置视图——填实例地址（Pages / 自定义域名，默认空白，没有内置站点）、书签目录、WebDAV 凭据，保存并授权后自动进入网盘/书签视图（HamHome 式：先配置后使用）；侧栏「设置」随时可改。
- **工具栏双模式**：两种模式都打开扩展自己的页面——*网盘*（默认）**直接挂载 Web 端 React 组件**渲染文件管理器（不再 iframe 嵌实例网页，服务端的 `X-Frame-Options: DENY` 不再有影响），*书签* 打开书签库视图。在设置里选默认，随时右键工具栏图标切换；未配置实例时，工具栏点击直接打开设置视图。首次进入网盘视图会请求实例域名的 host 权限（`/api/*` 没有 CORS 头，必须授权后才能用搜索/回收站等能力；`/webdav` 本就开放 CORS）；「新标签页打开」按钮保留作兜底。
- 页面右键菜单有「收藏此页」——把当前标签页的标题 + URL 合并进你 WebDAV 上的书签文件。
- WebDAV 凭据（与部署时的 `WEBDAV_USERNAME` / `WEBDAV_PASSWORD` 一致）**仅**保存在 `chrome.storage.local`，不会同步到 Google 账号。保存实例地址时会按需申请该站点的 host 权限（可选权限，不预授权任何域名）。
- **不改 Chrome 新标签页。** 旧版曾提供带 newtab 覆盖的第二个 zip；由于 Chrome 的 `chrome_url_overrides` 只能在 manifest 里静态声明、装上即永久接管、无运行时开关，该变体已移除，现在只发一个包。

GitHub Release 附一个 zip：`davflare-extension.zip`（工具栏 + 内嵌设置 + 书签库 + 网盘视图）。

**加载未打包扩展：** Chrome → `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选本仓库的 `extension/` 目录。注意：网盘视图是 vite 构建产物，源码目录加载前先在仓库根目录执行 `npm ci && npm run build:extension`（未构建时书签等功能照常，网盘视图会显示构建提示；Release zip 已含产物）。

**Release zip：** 从 [GitHub Releases](https://github.com/fanchenggang/Davflare/releases) 下载后解压再按上面的方式加载。打 tag（`v*` / `extension-*`）或在 **Actions → Release extension** 里运行工作流会附上 zip。

## 书签

扩展的书签库把书签存在**你自己的 WebDAV 上**——不依赖第三方服务，不含任何 AI。要求实例的 WebDAV 功能开关已打开。

- **存储布局**（实例 `/webdav/` 下，目录可在主页「设置」视图配置——默认 `bookmarks/`，例如填 `qa/bookmarks` 隔离测试数据）：`bookmarks.html` 是权威的 Netscape 书签文件，可直接用 Chrome/Edge「导入书签」；`bookmarks.json` 是旁路文件，承载 HTML 格式放不下的标签与备注；`workspaces.json`、`tabGroups.json`、`snapshots.json` 分别对应下面几个功能。写入带 `If-Match`，出现 412 冲突会明确提示重试，绝不静默覆盖。
- **书签库页**：侧栏分类/标签计数；搜索覆盖标题/URL/标签/备注，**支持拼音**（全拼与首字母，内置精简字典）；时间范围筛选；网格/列表视图；明暗主题；从 Chrome 书签导入（可选 `bookmarks` 权限，按 URL 合并）与导出 `bookmarks.html`。
- **HamHome 迁移（只读导入）**：书签库页可从同实例的 [HamHome](https://github.com/bingoYB/ham_home) 同步目录导入——读取 `/HamHomeSync/bookmarks/meta.json` + `categories.json`，按 URL 去重合并；描述转为备注、标签与分类目录保留、已删除行跳过。边界：我们自己的写入仍是自有格式；HamHome 的快照/工作区/Tab 规则（存其 IndexedDB 或应用内部 JSON）不迁移。
- **工作区**：把当前窗口存为工作区——页面顺序、固定状态、原生标签组元数据——之后可全部或勾选恢复到新窗口（URL 去重，还原固定与分组）。
- **Tab 分组**：本地规则引擎（域名后缀 / URL / 标题 / 正则，多条件 AND），一键把当前窗口收进原生标签组，可自定义标题/颜色/折叠/优先级；未命中可按根域名兜底。规则经 `tabGroups.json` 同步。
- **快照**：把页面捕获为单文件 HTML（CORS 允许的图片尽力内联；剥离 script/iframe；8 MB 上限）存到 `bookmarks/snapshots/`，在书签编辑里查看、下载、更新、删除。无 CORS 头的跨域资源无法内联（浏览器安全限制），`chrome://` 等受限页无法捕获。
- **错误不静默**：WebDAV 开关关闭（404）、服务端未配置凭据（403）、凭据错误（401）、编辑冲突（412）各有独立文案，并提供打开设置的入口。

格式映射、HamHome 导入导出与冲突策略见 [docs/bookmarks-portability.zh-CN.md](../docs/bookmarks-portability.zh-CN.md)。

