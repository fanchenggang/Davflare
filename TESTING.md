# FlareDrive 回归测试清单

> 最近一轮：2026-08-30 第三轮四批（Sites 管理面板 + MCP 深化 + davflare-cli，另含第 0 批缺陷修复）
> 前几轮：2026-08-29 第六批（缺陷修复 + B5/B9/C9 收尾 + i18n 第二阶段收编 + 界面美化 + 单测/e2e 落地）、第五批（A9 i18n 第一阶段 + scripts/api-e2e.sh 回归套件沉淀）、第四批（多选拖拽/面包屑下拉/图标扩展）、第三批（目录分享/回收站清理/搜索高亮/动效 11 项）、第二批（目录级 API 等）、首批（暗色模式等）
> 约束：所有测试数据操作仅在自己创建的目录内进行，测试后清理。

## 0a-7. 第三轮四批（2026-08-30）

### 第 0 批：缺陷修复（commit 54a4acb）
| 项 | 内容 | 验证 |
|----|------|------|
| shareLinkRevoked 缺键 | SharesView 撤销分享 toast 显示原始键名，strings.ts 补 `shareLinkRevoked` 中英文 | ✅ strings 单测（双语完整性）通过 |
| WebDavPanel 字面量 | `"{strings.notConfigured}"` 等带花括号原文渲染给用户，改为正常表达式 | ✅ typecheck + 构建 |
| html lang 固定 | `<html lang>` 不随语言切换；setLang() 与模块初始化时同步 `document.documentElement.lang` | ✅ 构建 |
| 暗色硬编码阴影 | 7 文件 10 处暖黑阴影改为 theme 感知 `warmShadow()`（亮色不变，暗色纯黑加深） | ✅ 构建 + 既有测试不回归 |

### 第 1 批：Sites 管理后端（commit 8258836）
| 项 | 内容 | 验证 |
|----|------|------|
| /api/sites | 列站（delimiter）/配置（SPA 开关）/删站（分批 + purge 语义：默认保留配置）；统计聚合带 10 分钟 TTL 缓存 | ✅ e2e 18 项断言（列表/配置/统计/非法 slug/401/清空保留配置/purge 彻删） |
| SPA/404 兜底 | 中间件最终 miss 才读一次配置：spa→index.html 200；否则 404.html 以 404 返回；正常命中零额外 R2 读 | ✅ e2e：miss 404 / spa 200 / 404.html 404+内容 / 重部署后 SPA 仍生效 |

### 第 2 批：SitesView 界面（commit 370cf8b）
| 项 | 内容 | 验证 |
|----|------|------|
| 站点区块 | `#/sites` 第四 section + ExplorerBar 切换；卡片（slug/静态 SPA 徽标/URL 复制/懒加载统计）；SITES_HOST 未配置引导横幅 | ✅ 浏览器 GUI 冒烟（截图核验布局与主题一致性） |
| zip 一键部署 | 前端 fflate 解压 → 注入 webkitRelativePath → 复用上传队列（覆盖语义/清空可选项/进度暂停重试全套） | ✅ GUI：部署对话框渲染、未选文件禁用部署按钮；「管理文件」跳转 `sites/<slug>/` 复用文件管理器 |
| SPA 开关即时生效 | 开关 optimistic 更新 + 服务端 POST 配置 | ✅ GUI：开关后徽标变 SPA + toast；TEST_CASES 新增 TC-SITES 12 例 |

### 第 3 批：MCP 深化（commit f089ff9）
| 项 | 内容 | 验证 |
|----|------|------|
| 新端点 | `POST /api/copy`（复用抽取的 copyObject，rename 行为不变）、`GET /api/stat`、`/api/download` 支持 Range（206 + Content-Range，非法 Range 回退全量） | ✅ e2e：copy/stat 成功路径 + 2MB 下载逐字节 cmp |
| MCP 十新工具 | search/move/copy/stat/share_create/share_list/share_revoke/sites_list/sites_config/sites_delete（_mcp.ts 保持纯函数） | ✅ mcp 单测 15→23 用例（工具目录/参数转发/分块编排）；e2e tools/list 计数与调用 |
| 大文件分块 | MCP upload >1MiB 自动三段式（cap 25MB），分块失败 abort 清理；download 大文件按 part/partSize 分页 base64 | ✅ e2e：2MB base64 上传 → /api/download 逐字节一致 → part 分页与原文件前 1MiB 一致 |
| 鉴权统一 | /api/shares、/api/search、/api/sites 放行 API key（会话仍可用） | ✅ e2e：三端点 Bearer key 创建/搜索/列站；无 key 401 |
| 文档 | docs/API.md（copy/stat/search/Range/MCP 工具清单/shares 密钥说明）、docs/sites(.zh-CN).md 管理 API 章节 | ✅ 与实现核对 |

### 第 4 批：davflare-cli（本次提交）
| 项 | 内容 | 验证 |
|----|------|------|
| cli 包 | 独立 npm 包 `davflare-cli`（Node ≥18 + commander，ESM + tsc + vitest）；login 创建专用密钥存 `~/.config/davflare/config.json`(0600)；DAVFLARE_SERVER/KEY 环境变量 | ✅ 构建 + `--help/--version` |
| 命令 | ls/ln -l/--json、mkdir、rm -r/--hard、mv、cp 双向（>100MB 自动分块上传、Range 断点续传下载）、sync push/pull --dry-run/--delete/--backup-conflicts | ✅ cli/e2e.sh 17 项断言全过（上传/下载字节一致/mv/rm/sync 双向幂等/清理） |
| sync 引擎 | 纯函数 planSync（transfer/changed/deleteCandidates/upToDate），local wins（push）与 remote wins（pull） | ✅ vitest 4 用例（push/pull/空表/同 size 一致） |

### 排障记录（本轮真实故障，值得留档）
| 现象 | 根因 | 处置 |
|------|------|------|
| e2e 站点断言全挂，响应是网盘 SPA 页 | 8788 端口有残留 wrangler dev（早前会话遗留），测试打到旧进程 | 测试前确认端口空闲；换端口运行 |
| MCP stat 间歇性「文件不存在」 | 多个 wrangler dev 共享同一 `.wrangler/state` SQLite，workerd 间 SQLITE_BUSY 争锁（日志可见 Fatal ... SQLITE_BUSY） | 只保留一个 dev 实例；多实例需各自 --persist-to |
| MCP 上传响应 -32700 Parse error、参数被截断 | e2e 里 `$( )` 内嵌 `\"` 构造 JSON 参数：不在引号内的 $( ) 中 `\"` 使引号开关，`{a,b}` 形状触发 **bash 花括号展开**按逗号拆参 | JSON 参数先拼进变量再传（mcp_call 调用约定已加注释警示） |
| CLI 上传 400「需要 X-File-Name」 | /api/upload 原始体模式要求 path=目录 + X-File-Name=文件名；客户端误传完整键 | client.uploadFile 拆分 folder/name |
| CLI ls --json 断言失败 | CLI 美化输出 `"name": "a.txt"`（带空格），grep 写成无空格 | e2e grep 对齐实际输出 |

**本轮验证汇总**：`npm run typecheck` 0 错误；`npm run test:ci` 8 套件 76 用例全过；`npm run build` 成功；主 e2e `npm run test:e2e` **129 项断言全过**（含站点 18 项 + MCP 20 项）；`cli` vitest 4 用例 + `cli/e2e.sh` **17 项全过**；SitesView 浏览器 GUI 冒烟通过。


## 0a-6. 第六批新增与新验证（2026-08-29）

### 缺陷修复
| 项 | 内容 | 验证 |
|----|------|------|
| i18n 快照 bug | ExplorerBar `TYPE_FILTERS` 与 FileActionSheet `ACTIONS` 在模块加载时固化文案，切语言后类型筛选 Chip / 右键菜单不跟随。改为常量存 key、渲染时经 strings 取值 | ✅ 代码核验 + 切换语言即时生效 |
| Backspace 误删 | 网格按 Backspace 原本直接弹「移入回收站」确认（破坏性风险）。改为 Backspace = 返回上级目录（根目录无操作），Delete 才删除 | ✅ e2e 之外人工核验代码路径；TEST_CASES 新增 KB-12 |
| 虚拟目录软删 404 | 仅前缀无 marker 的目录硬删成功但 `soft=1` 返回 404。`softDeleteKeys` 现按「head 为空但有后代」识别虚拟目录，记 `virtualDir` 元数据 | ✅ 单元逻辑核验；restore 补建 marker 见下条 |
| restore 父级 marker | 回收站还原不重建原路径父级目录 marker；还原后逐级 `ensureFolderMarkers` 补建，虚拟目录本体 marker 也补上 | ✅ e2e：软删 deep 目录 → 硬删整树 → restore → 文件原位可列出（4 项断言） |
| 目录判定不统一 | `shares.ts` 只认 contentType，改用 `_apikey.isCollectionObject`（contentType 或 resourcetype 均可）；`share/[[token]].ts` HEAD 对目录分享返回 200 application/zip（与 GET 一致）并补过期 410 | ✅ e2e：目录分享 HEAD 200|application/zip；文件/目录/提取码分享 12 项断言 |
| upload.ts 鉴权去重 | 删除整段复制的鉴权代码（约 90 行），复用 `_apikey.authorizeApiKey/touchLastUsed/isInternalKey`；complete 前补 parts 升序校验 | ✅ e2e 全量 79 项断言通过（上传/分块行为不变） |
| trashKey 命名 | `DELETE /api/delete?soft=1` 响应 `trashId` 与回收站列表 `trashKey` 不一致，统一为 `trashKey`（与 restore 参数直接对齐） | ✅ e2e 断言 `"trashKey"` 字段 |
| 统计胶囊缓存 | `listingStats` 的 useMemo 缓存了翻译结果，切英文后仍显示「N 个文件夹」。useMemo 加 lang 依赖 | ✅ GUI：切英文后显示 "5 folder(s) · 0 file(s) · 0 B" |
| TextPad 假 key | 记事本使用字典中不存在的 `fileName`/`notePlaceholder`，Proxy 兜底把 key 名原样显示。补 `fileName`/`noteContent` 两个 key 并改接线 | ✅ GUI：记事本标签正常显示 |

### 半成品收尾（B5 / B9 / C9）
| 项 | 内容 | 验证 |
|----|------|------|
| B5 通知队列 | Snackbar 队列化（上一条退出后再弹下一条，连续错误不再互相覆盖）；error 默认 8s；上传失败 toast 带「上传任务」入口；删除/移动/拖拽移动失败 toast 带「重试」action | ✅ 构建 + 代码核验；TEST_CASES 新增 KB-13/14 |
| B9 预览增强 | 图片预览：滚轮缩放 25%-400%（非被动监听）、双击 100%/250% 切换、按住拖拽平移（pointer capture）、旋转 90°/270° 自动计算补偿系数防溢出、操作栏显示当前百分比（点击复位） | ✅ 构建 + tsc；TEST_CASES 新增 PV-13/14 |
| C9 棋盘格 | 缩略图（AuthThumbnail）补透明 PNG 棋盘格衬底，与预览大图一致（亮暗双套） | ✅ TEST_CASES 新增 PV-15 |

### i18n 第二阶段全量收编
| 项 | 内容 | 验证 |
|----|------|------|
| 文案收编 | src 下（strings.ts 除外）硬编码中文清零：app/ 工具模块全部错误消息（transfer/share/trash/transferQueue/apikeys 的 throw）、utils 时间与 ETA 文案、ShareDialog 有效期标签 | ✅ 扫描脚本核验 0 残留；`translate` 单测覆盖 |
| curl 指南双语 | `formatApiUsage` 改为 zh/en 双语行模板（按 getLang() 取用），英文全文翻译 | ✅ tsc + 构建 |
| 防漏译护栏 | strings.ts 暴露 `dictionary`；单测遍历断言每个 key 的 zh/en 均非空 | ✅ 单测 |

### 界面美化
| 项 | 内容 | 验证 |
|----|------|------|
| 顶栏毛玻璃 | 滚动后半透明纸色 + backdrop-filter blur（不支持时 @supports 回退纯色）；Header 裸 zIndex 收进 Z_INDEX 常量 | ✅ 构建 |
| 空状态差异化 | EmptyState 增加 variant（folder/search/trash/shares），四种场景圆底色调/卡片倾角/圆点排布区分 | ✅ 四处调用点接线 |
| 选中态统一 | 网格卡片与列表行选中统一叠加柔和呼吸光效（2.4s 脉动，prefers-reduced-motion 禁用） | ✅ 构建 |

### 测试基建（从零到一）
| 项 | 内容 | 验证 |
|----|------|------|
| Jest 单测 | 首批 5 个测试套件 43 项：strings（字典完整性/插值/持久化/订阅）、route（hash 解析/编码/hashchange）、utils（尺寸/ETA/相对时间/去重/垃圾文件）、highlight（三族 tokenizer/按行拆分）、transferQueue（并发 2/失败自动重试 1 次/暂停恢复/取消清理） | ✅ `npm run test:ci` 43/43 |
| e2e 一键化 | `scripts/run-e2e.sh` + `npm run test:e2e`：自动生成 .dev.vars → 构建（SKIP_BUILD=1 可跳）→ wrangler pages dev → 就绪轮询 → api-e2e.sh → trap 清理 | ✅ 本地全流程 |
| e2e 扩容 | api-e2e.sh 48 → 79 项断言：新增 config、search（命中+空+401）、分享（文件/目录 zip 树/提取码 200-403/撤销 404/HEAD zip）、回收站还原（含父级 marker 补建）、archive（zip 内容校验/401）、WebDAV MKCOL/COPY/LOCK | ✅ 本地 79/79 全过 |
| 脚本 | package.json 增 `test:ci` / `typecheck` / `test:e2e` | ✅ |

### 本轮已知限制
- 虚拟目录（无 marker）软删的 e2e 直接构造需要 R2 层操作（公开 API 建不出这种目录），实现已防御性支持，留待需要时用 miniflare API 补用例。
- 预览缩放/平移的 GUI 自动化未跑（滚轮/拖拽手势），人工按 PV-13/14 走查即可。

## 0a-5. 第五批新增与新验证（2026-08-29）

| 项 | 内容 | 验证 |
|----|------|------|
| 测试沉淀 | `scripts/api-e2e.sh`：开放 API + WebDAV 的 48 项断言回归套件（参数化 BASE/凭据，自建前缀 + 自动清理），补入 backup 用独立文件的顺序修正 | ✅ 本地 48/48 全过（可重复执行） |
| A9 i18n（第一阶段） | 双语字典 + Proxy strings（现有 `strings.xxx` 用法零改动生效）+ `translate(key, params)` 参数化模板 + localStorage/navigator.language 检测 + Header 语言切换按钮（中文/English）+ App 根订阅语言切换触发整树重渲染；核心界面文案收编（登录/页头/工具栏/统计胶囊/上传队列状态与按钮/删除确认/通知 toast/预览过大/空状态） | ✅ GUI：切英文全界面生效（截图）、`flaredrive.lang` 持久化、刷新保持、回切中文正常 |

说明：i18n 第二阶段（TrashView/SharesView/WebDavPanel/ApiKeysPanel/TextPadDrawer 等专业面板的剩余硬编码 + 英文润色）待后续；未迁移文案在英文界面下仍显示中文原文，不影响功能。

## 0a-4. 第四批新增与新验证（2026-08-29）

| 项 | 内容 | 验证 |
|----|------|------|
| B8 | 多选拖拽整组移动：多选后拖动任一选中项 = 整组剪切到目标文件夹（dataTransfer 载荷为 JSON 数组，兼容旧单键格式；目标自身/子项自动过滤） | ✅ GUI：Ctrl+Click 选 2 项 → 合成 dragstart 载荷为整组 → drop 后 PROPFIND 目标目录两项都在 |
| B7 | 面包屑同级下拉：路径栏新增 ▾ 按钮，列出父目录下全部子文件夹（当前项高亮），点击跳转 | ✅ GUI：根下一层与深层目录均正确列出同级；点击 target-dir 成功跳转。验证中修复：单层目录 parentPath 误算为 "/" 导致 PROPFIND 404 |
| C4 | 缩略图 hover 微缩放（scale 1.06，reduced-motion 禁用） | ✅ 构建渲染无回归（CSS 动效） |
| C8 | 文件图标扩展：演示文稿（ppt/pptx/key/odp 橙红）、电子书（epub/mobi/azw3 绿）、字体（ttf/otf/woff 紫） | ✅ GUI：三类文件图标与配色正确 |

## 0a. 第三批新增与新验证（2026-08-29）

| 项 | 内容 | 验证 |
|----|------|------|
| A6 | 目录分享：分享链接访问时打包整树 zip 流（条目相对分享目录），提取码/过期/撤销沿用 | ✅ curl：isDir 字段、提取码表单 200/错误 403/正确 200、zip 树与内容逐字节一致、文件分享回归无损；GUI：目录右键菜单出现「分享」→ 创建成功 |
| A7 | 回收站惰性过期清理：`TRASH_RETENTION_DAYS`（默认 30，0=全部过期，-1=关闭），打开回收站时清理，每批 ≤200 | ✅ curl：0 天配置下软删项下次打开即清空；默认 30 天下软删项正常可见 |
| A8 | 搜索命中高亮（文件名拆分渲染，主色加粗，React 文本转义防 XSS） | ✅ GUI：搜「demo」三个文件名命中片段橙色高亮 |
| B6 | 网格卡片 hover/focus 快捷操作条（下载/分享/删除；触屏隐藏） | ✅ GUI：hover 显示 opacity=1 + 三按钮，分享按钮直达对话框 |
| B9 | 预览增强：图片旋转 90°（按钮累计）、视频倍速循环（1/1.5/2/0.5） | ✅ GUI：transform rotate(180deg) 两次生效；倍速按钮渲染（视频流播放本地无素材验证 UI） |
| B10 | 日期相对化：24h 内「刚刚/N 分钟前」，更早回退日期，tooltip 绝对时间 | ✅ GUI：新上传显示「刚刚」 |
| C2 | 空状态分层浮动画风（暖橙圆底+倾斜卡片+悬浮图标卡+圆点，亮暗自适应，reduced-motion 禁用） | ✅ GUI：空目录截图核验 |
| C3 | 网格/列表项进入动效（stagger ≤24 项，prefers-reduced-motion 禁用） | ✅ 构建与渲染无回归 |
| C5 | 顶栏滚动阴影（内容滚动 >8px 出现，回顶消失） | ✅ GUI：滚动前 none → 滚动后阴影 |
| C6 | 移动端底部导航：文件页高亮、点按图标弹跳（reduced-motion 禁用）、上传 tab 环形总进度 | ✅ 构建通过；动效为 CSS 侧，逻辑 props 接线完成 |
| C9 | 透明图片棋盘格衬底（亮暗双色格） | ✅ GUI：透明 PNG 预览棋盘格清晰可见 |

本轮无新增缺陷修复；目录分享曾发现两处缺口并在验证中当场修复：① zip 条目使用全 key 路径 → 加 stripPrefix 相对化；② 目录右键菜单缺「分享」项（filesOnly 遗留）→ 放开。

## 0. 本轮（第二批）新增与新验证

### 新落地功能
| 项 | 内容 | 验证 |
|----|------|------|
| A1 | 开放接口目录级 rename（递归移动）/ delete（递归删除）/ backup（整树改名 `.conflict-<戳>`），上限 1000 对象 | ✅ curl：目录改名子项跟随、删目录后 404、子路径改名 400、目录 backup 名正确 |
| A2 | `DELETE /api/delete?soft=1` 软删除（文件+目录，进回收站可还原） | ✅ curl：trashId 返回、回收站可见、restore 后内容一致 |
| A4 | `GET /api/list?limit=&cursor=` 分页 | ✅ curl：5 条 limit=2 三页取尽无重复；limit=0/1001 拒绝 |
| A5 | 开放接口分块上传 `?uploads` → PUT part → complete / abort | ✅ curl：5MiB+小块拼装逐字节一致、abort 后 complete 400、partNumber=0 拒绝。注意 R2 限制：除末块外每块 ≥5MiB（错误信息透传） |
| A3 | 文件夹计数真实化（惰性并发补数 + sessionStorage 缓存） | ✅ GUI：bulk 105 项 / empty-dir 0 项 / 子目录甲 2 项 |
| B1 | 键盘增强：F2 支持目录、Home/End、Shift+Click 范围选、Ctrl/Cmd+Click 选、修饰键点击不触发打开 | ✅ GUI：End 聚焦末项、F2 弹目录重命名（预填 bulk）|
| B2 | 删除可撤销（toast「撤销」7 秒） | ✅ GUI：删除→撤销→文件原位恢复 |
| B3 | 上传队列：速度/ETA 显示、全部暂停/继续、失败自动重试 1 次 | ✅ 按钮/文案渲染；持续速率本地瞬时完成无法观察（环境受限，见未覆盖） |
| B4 | 全盘搜索触底自动加载 + 「已全部加载」 | ✅ GUI：181→滚动→223 条+已全部加载 |
| B5 | 错误 Snackbar 带重试（列目录/重命名/粘贴） | ✅ 基建接入；断网场景未本地模拟 |
| C1 | 代码预览语法高亮（json/clike/hash 注释族，≤1MB） | ✅ GUI：js 关键字紫/字符串绿/注释灰/数字橙，暗色配色独立；JSON 格式化+高亮 |
| C7 | 对比度审计 + z-index 收敛 | ✅ 7 项文本 token 对比度 4.79–15.72:1 全过 WCAG AA；z-index 常量化 |

### 本轮发现并修复的真实缺陷
1. **预览重开 412**（严重，历史遗留）：浏览器第二次 GET 同一文件带 `If-None-Match` 缓存再验证，WebDAV GET 把它透传给 R2 `onlyIf` 得到 412「打开文件失败」。修复：`protocol.ts` 对 If-None-Match 命中返回 **304**（curl 验证 304/200 双路径）。
2. **全盘搜索丢结果**（严重，历史遗留）：凑满 limit 立即截断，同页剩余命中被丢弃且桶 ≤1000 对象时无 cursor 可翻页（实测 102 命中只返回 100 且 hasMore=false）。修复：固定 100/页步长扫完当前页再截断。
3. **复选框聚焦吞键盘**：isTypingTarget 把 checkbox 当文本输入，Delete/方向键失效。修复：checkbox/radio/button 不再视为输入目标。
4. **Snackbar action 不渲染**：MUI Snackbar 有 children（Alert）时 action prop 不生效，改挂 Alert 的 action prop。

## 1. 本地环境搭建

```bash
npm install

# 根目录创建 .dev.vars（已被 .gitignore 忽略，本地凭证不入库）
echo 'WEBDAV_USERNAME=admin' >> .dev.vars
echo 'WEBDAV_PASSWORD=你的密码' >> .dev.vars

npm run build                      # CRA 构建到 build/
npx wrangler pages dev build       # http://localhost:8788，前端 + functions + 本地模拟 R2
```

- 本地 R2 数据落在 `.wrangler/state/`（miniflare 模拟，无需真实 Cloudflare 凭证；删除该目录即全部重置）。
- API 测试可先经 UI（「API」面板）创建密钥，或用 Basic 认证调 `POST /api/keys`。
- 建议把所有测试数据放在一个自建前缀目录下（如 `fd-e2e-<日期>/`），测完 WebDAV `DELETE` 整目录 + 清空回收站 + 作废密钥。

## 2. 回归矩阵（2026-08-29 结果）

### 浏览器 GUI（Chrome / IAB，1280×720 与 390×720）

| # | 用例 | 结果 | 备注 |
|---|------|------|------|
| 1 | 登录：错误密码拒绝 / 正确密码进入 | ✅ | 错误提示「用户名或密码错误」 |
| 2 | 新建文件夹 + toast + 统计更新 | ✅ | |
| 3 | 目录导航：进入 / 面包屑 / 返回上级 | ✅ | 搜索范围随目录自动切换 |
| 4 | 记事本创建文本文件并上传 | ✅ | 上传队列 toast + 列表刷新 |
| 5 | 拖拽上传（合成 DataTransfer drop） | ✅ | 触发上传管线与缩略图生成 |
| 6 | 缩略图显示（私有模式，Basic 认证） | ✅ | **本轮修复**：AuthThumbnail 经 authFetch 取 blob |
| 7 | 暗色模式：切换 + 刷新持久化 | ✅ | **本轮新增**：浅色/深色/跟随系统 |
| 8 | 键盘导航：方向键移动焦点 | ✅ | **本轮新增**：焦点描边 + scrollIntoView |
| 9 | 键盘：Space 选中 / Ctrl+A 全选 | ✅ | 多选工具栏联动 |
| 10 | 键盘：F2 重命名 / Enter 打开 / Delete 软删 | ✅ | Delete 弹「移入回收站」确认框 |
| 11 | 键盘：Esc 清除选择与焦点 | ✅ | |
| 12 | 预览：文本（行号/分页）/ 图片 / 左右切换 | ✅ | 「70.2 KB · 1/2」指示 |
| 13 | 重命名（对话框）| ✅ | |
| 14 | 剪切 → 进入子目录 → 粘贴移动 | ✅ | 工具栏出现「粘贴 1 项」 |
| 15 | 软删除 → 回收站 → 恢复 | ✅ | 恢复后原路径出现 |
| 16 | 类型筛选（图片）| ✅ | |
| 17 | 网格/列表视图切换 | ✅ | 列表粘性表头、文件夹计数「1 项」 |
| 18 | 排序：名称升降序（目录恒优先）| ✅ | |
| 19 | 搜索：当前文件夹过滤 / 全盘搜索 | ✅ | 子目录文件在当前目录范围不出现，全盘可搜到 |
| 20 | 分享：创建（提取码）/ 错误码拒绝 / 正确码展示 / 撤销 | ✅ | `/share/<token>` 独立页 |
| 21 | API 面板：GUI 创建密钥（明文仅显示一次）/ 调用说明 | ✅ | 说明已含 `/api/mkdir` |
| 22 | 移动端 390px：底部导航 / 两列网格 / 顶栏收缩 | ✅ | |
| 23 | 浅色模式视觉回归（改动后）| ✅ | 与深色双模式截图核验 |

### 开放 API（curl，密钥鉴权）

| # | 用例 | 结果 |
|---|------|------|
| A1 | `POST /api/upload`（multipart 与 X-File-Name 原始体）| ✅ 201 |
| A2 | `GET /api/list`（size/uploaded/etag、目录优先）| ✅ 200 |
| A3 | `GET /api/download`（内容一致、中文不乱码）| ✅ 200 |
| A4 | `POST /api/rename`（成功 / to 冲突 409 / 不存在 404）| ✅ |
| A5 | `DELETE /api/delete`（成功 / 目录拒绝）| ✅ |
| A6 | `POST /api/backup`（conflict 时间戳改名）| ✅ |
| A7 | **`POST /api/mkdir`（本轮新增）**：创建 201 / 幂等 200 / 父级自动补建 / 同名文件 409 / 内部前缀 400 / `..` 穿越拒绝 / 无密钥 401 | ✅ |
| A8 | `GET /api/search`（子串匹配）| ✅ |

### WebDAV（curl，Basic 鉴权）

| # | 用例 | 结果 |
|---|------|------|
| W1 | PROPFIND Depth 1（207）/ 错误密码 401 | ✅ |
| W2 | MKCOL 201 / PUT 201 / GET 200 / MOVE 201 / DELETE 204 | ✅ |

## 3. 本轮未覆盖项

- 文件选择器与系统拖拽上传的 GUI 路径（IAB 自动化不支持 file chooser）；已用合成 drop 事件与记事本路径覆盖上传管线，API 上传另行 curl 验证。
- **上传速率/ETA 与传输中「全部暂停」的实际效果**：本地 miniflare 吞吐即时（6MB 瞬间完成），按钮渲染与状态机已验证，持续传输表现需真实网络环境观察。
- B5 重试按钮的断网触发：需网络故障注入，本地未模拟（代码路径已接入列目录/重命名/粘贴三处）。
- 分享过期（410）与 `WEBDAV_PUBLIC_READ=1` 分支：需要时间/配置切换，未跑。
- 视频倍速对真实视频流的播放效果：本地无视频素材，按钮与 playbackRate 设置逻辑已接。
- IAB 嵌入环境的 IntersectionObserver / requestAnimationFrame 不触发回调（原生自检确认），B4 已加 scroll 捕获兜底；普通浏览器主路径仍为 IO。
- cua 合成按键在部分焦点状态下不可达（checkbox 聚焦时），改用合成 KeyboardEvent 验证；真实键盘事件走 window 监听不受影响。

## 4. 已知问题 / 后续建议

- 大目录（数千项）无虚拟滚动，PROPFIND 全量渲染可能卡顿；搜索结果 200+ 条渲染已可感知变慢。
- 弱验证项：B5 断网重试、视频倍速真实流、上传速率真实网络表现（见第 3 节）。
- `formatRelativeDateTime` 非响应式：页面长开时「刚刚」不会自动变「N 分钟前」（重渲染后正确）。
- 单测覆盖为首批基线（纯函数 + 上传队列状态机）；functions/ 端点继续由 e2e 覆盖，后续可考虑 vitest 直测 Workers 代码。
- ~~`npm test`（CRA Jest）当前无任何测试用例~~ 第六批已落地 43 项单测与 `npm run test:e2e` 一键回归。

## 分享管理升级 + 分享落地页（第四轮 B4/B5，2026-09-04）

| 项 | 内容 | 验证 |
|----|------|------|
| C3 分享管理升级（前端） | SharesView 卡片与 ShareDialog 列表项新增二维码（qrcode 前端 toDataURL → dataURL，Popover 弹层「扫码访问/Scan to open」，新组件 `src/ShareQrButton.tsx`）；过期倒计时 Chip（纯函数 `shareExpiryView`/`formatShareCountdown`：>48h 天 / 2-48h 小时 / <2h 分钟，<24h warning 色，永久显示「永久有效」，已过期标「已过期」）；创建时间 Chip（相对时间 + tooltip 绝对时间，参考 FileGrid 写法；旧记录无 createdAt 不显示，`ShareInfo.createdAt` 改可选） | ✅ Jest 新增 14 用例：倒计时纯函数四象限（>=48h / 2-48h / <2h / 永久 + 过期/24h 分界/英文插值）、SharesView/ShareDialog 徽标与二维码弹层渲染断言；全量 53 套件 463 用例全绿 |
| A1 分享落地页（后端） | `GET /share/<token>` 默认返回零脚本 SSR 落地页（文件名/类型/大小/分享时间 + 下载按钮，暖纸色调 + `prefers-color-scheme` 暗色双套，`Accept-Language` 含 zh → 中文否则英文，全插值 escapeHtml）；提取码表单复用同套视觉（校验逻辑/参数不动）；`?download=1` 固定 attachment 直链下载（目录仍 zip 流）；`?raw=1` 内联返回（可预览类型 inline，其余回退 attachment），`CSP sandbox`/`nosniff`/no-store/Range 全保留；落地页预览 src 指向 `?raw=1` 并继承 `?code=`，cookie 门禁对 img/iframe 子请求天然生效；HEAD 与 GET 语义对齐（默认 text/html，?download/?raw 返回对象元数据） | ✅ e2e 分享 section 18 → 39 项断言全过：落地页中英文/文件名/下载链接/HEAD、download=1 字节与 attachment、raw=1 200+inline+sandbox+nosniff、图片分享 `<img>` 预览、目录 zip（改走 ?download=1）与 HEAD、**410 过期（expiresInHours 小数 0.00001 制造）**、撤销 404（落地页+download 双路）、提取码 200/403/303/cookie 解锁/raw 预览 |
| 分享记录 createdAt | 复查 `functions/api/shares.ts` 创建时已写入 createdAt（ISO），本批仅把 `ShareInfo.createdAt` 类型改可选以兼容旧记录 | ✅ tsc 0 错误 |
| 文档 | README(.zh-CN).md 功能列表与分享链接行为说明（默认落地页 / ?download=1 直链 / ?raw=1 内联）、docs/API(.zh-CN).md Shares 端点行为重写、e2e 断言计数更新（79 → ~170） | ✅ 与实现逐条核对 |

**本批验证汇总**：`npx tsc --noEmit` 0 错误；`CI=true npx react-scripts test --watchAll=false` **53 套件 463 用例全绿**（基线 449 + 14）；`npm run build` 成功；`SKIP_BUILD=1 bash scripts/run-e2e.sh` **171 项断言全过（0 FAIL）**。取舍说明：`?raw=1` 对非可预览类型（octet-stream 等）回退 attachment 而非强行 inline；过期分享的 Chip 显示「已过期」并用 warning 色；落地页不展示有效期信息（规格未要求，避免泄露多余元数据）。

## 测试覆盖率体系与后端直测（第四轮 C 组，2026-09-05）

| 批 | 内容 | 结果 |
|----|------|------|
| 测试基础设施 | 新增 `src/app/testUtils.ts`（jsonResponse/AsAuthFetchMock/clearStorage/PROPFIND XML fixture/MCP rpc 构造器，12 个测试文件去重改造）；package.json jest 配置 `collectCoverageFrom` 纳入 `functions/**`（`src/index.js`、testUtils、InMemoryBucket 排除）；新增 `functionsLoader.test.ts` 强制加载全部 functions 模块绕过 CRA jest roots 限制；coverageThreshold 按「实测-0.5」棘轮（src / functions / global 三组路径键，注意 jest 阈值 glob 键是逐文件校验、路径键才是分组聚合）；cli 加 `test:coverage`（v8 provider）与 vitest.config.ts | ✅ src 组阈值 91.6/84.5/85.9/93.5（stmts/branch/funcs/lines），functions 组 58.67/53.23/66.69/60.92 |
| CI 工作流 | `.github/workflows/ci.yml`：push main + 全 PR，三 job——frontend（npm ci → typecheck → test:ci → build）、cli（npm ci → npm test，独立 lockfile 缓存）、e2e（`npm install --no-save wrangler@4` 钉版本后跑 `npm run test:e2e`，本地完整预演通过） | ✅ 本地预演 171 断言全过 |
| cli 补测 | client.ts（>100MB 三段式真实临时文件分块、分块失败 abort 清理、Range 断点续传 206/200/等长跳过/偏大重下、ApiError 文本回退、createKeyWithSession/revokeKey）、config.ts（XDG 临时目录注入、0600 权限、环境变量覆盖/合并、损坏文件）、util.ts 全覆盖、index.ts（commander 分发 + 错误路径） | ✅ cli 6 文件 58 用例全绿；stmts 86.11% / branch 90.09%，client.ts lines 98.56%、config.ts 100% |
| 后端直测 | 新增 `src/app/testInMemoryBucket.ts`：R2Bucket 内存模拟（get/put/delete/head 含 onlyIf 条件语义、list 忠实模拟 prefix/cursor/delimiter/include/UTF-8 字典序/truncated、multipart 全生命周期）；新增 5 个测试套件 185 用例：webdavProtocol（84：304/206/412/423/LOCK 互斥与刷新/Overwrite/内部前缀/鉴权 fail-closed）、trashApi（25：marker/虚拟目录/父级重建/惰性过期）、shareToken（32：落地页转义/download/raw 安全头/提取码 cookie/410/404）、uploadApi（20：413/乱序/缺块/abort 幂等）、middleware（24：SPA/404.html/穿越/Host 接管） | ✅ **functions/ 覆盖率 lines 18.75% → 61.42%、branches 53.73%**；protocol.ts 80.16%、trash 98.05%、shares 96.55%、share token 92.86%、upload 92.82%、middleware 97.62% |
| 顺手修的两个后端健壮性 bug | ① protocol.ts handleGet 未捕获 R2 InvalidRange → 非法 Range 500（现回退全量 200，与 download.ts 同类处理一致）；② trash.ts handleRestore 对损坏元数据 JSON 无 try/catch → 整个还原 500（现返回结构化「回收站项目损坏」） | ✅ 各有用例固化 |
| 前端洼地补测 | 新增 5 套件 104 用例：hooksExtra（30：快捷键全分支/多选 shift/拖拽遮罩/粘贴上传）、transferMultipart（28：分块/断点续传/AbortError 时序/缩略图副作用）、PreviewDialogExtra（13：缩放钳制/平移/旋转补偿/倍速/pager）、AppExtra（10：队列顶替/去重/主题三态）、MainExtra（23：加载更多/undo 闭环/拖拽入文件夹） | ✅ **src/ lines 84.94 → 94.01%、branches 75.88 → 85.04%**；useKeyboardShortcuts/useMultiSelect/useUploadInputs/useDragDropUpload/usePasteUpload 全部 100% lines |
| 顺手修的两个前端交互 bug | ① useMultiSelect shift 范围选择失效（setState updater 延迟求值期间 selectionAnchor 已被覆写为点击目标，退化为「原选中+目标」→ updater 前捕获 anchor）；② App Snackbar 队列重开竞态（退场完成前 effect 重开，onExited 永不触发，消息每轮 autoHideDuration 重闪 → shownSnackKeyRef 挡住已展示消息的重开） | ✅ jsdom 复现→修复→回归，AppExtra 断言「12s 后消失且不再重闪」 |

**本批验证汇总**：`npx tsc --noEmit` 0 错误；`CI=true npx react-scripts test --watchAll=false` **64 套件 754 用例全绿**（基线 53/463 → +11 套件/+291 用例）；`npm run build` 成功；`SKIP_BUILD=1 bash scripts/run-e2e.sh` **171 断言全过（0 FAIL）**；cli `npm test` 58 用例全绿。已知环境限制：upload.ts 的 multipart/form-data 分支在 whatwg-fetch 测试环境无法解析 multipart 请求体（e2e 兜底）；protocol.ts handlePutMultipart 对未知 uploadId 的 part PUT 未捕获（边缘，已记录）。
