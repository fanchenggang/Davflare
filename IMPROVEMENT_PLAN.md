# FlareDrive 功能改进计划

> 2026-08-29 制定。基于本轮探索与回归测试发现的实际问题，按「功能改进 / 交互优化 / 界面美化」三个维度组织，
> 每项含动机（现状与代码位置）、方案要点、验收标准。分三批落地，第一批为 P0（正确性与核心体验）。
> 回归用例见 [TEST_CASES.md](./TEST_CASES.md)；上一轮已完成项见 [TESTING.md](./TESTING.md)。
>
> **2026-08-30 更新：第一轮 A/B/C 三组已全部落地**（详见 TESTING.md 各批记录）。
> 第二轮计划见文末「第二轮（2026-08-30）」章节。

---

## A. 功能改进

### A1. 开放接口支持目录级操作（P0）
- **现状**：`/api/rename`、`/api/delete`、`/api/backup` 一律拒绝目录（`functions/api/rename.ts:74-79`、`delete.ts:28`，`copyThenDelete` 在 `_apikey.ts:228` 仅拷贝单对象）。
- **方案**：新增目录分支——递归 `bucket.list({ prefix: key + "/" })` 逐对象处理；rename/move 为逐对象 copy+delete，delete 递归硬删并移除目录标记。限制单次对象数（如 ≤1000）防超时，超出返回 400 提示分批。
- **验收**：mkdir 建三层目录 → 上传若干文件 → rename 目录成功且子对象全部跟随；delete 目录后 `/api/list` 404；内部前缀 `_$flaredrive$/` 仍拒绝。
- **工作量**：中（约半天，含测试）。

### A2. `/api/delete` 支持软删除（P0）
- **现状**：开放接口删除是硬删除（`functions/api/delete.ts`），与网页端「移入回收站」语义不一致，脚本误删无法恢复。
- **方案**：`DELETE /api/delete?path=...&soft=1`（或 JSON body）走 `handleSoftDelete`（复用 `functions/api/trash.ts:125`）；默认保持硬删除向后兼容。`{ key, deleted, trashKey }` 返回回收站键。
- **验收**：soft=1 删除后文件出现在 `GET /api/trash`，可经还原端点恢复；不带参数行为不变（README 注明）。
- **工作量**：小。

### A3. 文件夹计数真实化（P0）
- **现状**：网格中其他文件夹恒显示占位「文件夹」；仅当前目录有计数（`src/Main.tsx:424-427` 统计、`FileGrid.tsx:118-122` 兜底文案）。
- **方案**：`/api/list` 已是 Depth-1 权威数据源；改为对可见文件夹**惰性后台补数**——批量并发（并发 2-3）对未计数文件夹发 `list?path=` 请求，结果写入 `folderCounts` 缓存（内存 + sessionStorage）；仅在前 N 个（如 50）文件夹上执行，避免大目录风暴。失败静默保持占位。
- **验收**：进入含子文件夹的目录，1-2 秒后子文件夹卡片显示真实「N 项」；断网/失败时回退占位文案；重复进入不重复请求。
- **工作量**：中。

### A4. `/api/list` 分页（P1）
- **现状**：一次返回目录全部条目，超大目录（数千项）脚本消费和传输都重。
- **方案**：沿用 R2 `list` 的 `cursor`：`GET /api/list?path=...&limit=500&cursor=...`，返回追加 `nextCursor`（`truncated` 时）。不传 cursor 保持全量，向后兼容。
- **验收**：limit 分页逐页取完且无重复/遗漏；不传 limit 行为与现在一致。
- **工作量**：小。

### A5. 开放接口大文件分块上传（P1）
- **现状**：`/api/upload` 单请求上限 100MB（413），网页端才有分块（`src/app/transfer.ts:471-548` 走 WebDAV `?uploads` 三段式）；脚本无法传大文件。
- **方案**：`POST /api/upload?uploads`（create）→ `PUT /api/upload?uploadId&partNumber`（part，数据直挂 R2 multipart）→ `POST /api/upload?uploadId`（complete）；密钥鉴权一致，上传中状态存 R2 内部前缀。100MB 以下仍走现有单发。
- **验收**：用三个分块拼一个 >100MB 逻辑文件，下载后逐字节校验；未 complete 的 uploadId 支持放弃（abort）；无密钥 401。
- **工作量**：大（约 1-2 天）。

### A6. 分享支持目录与多文件（P2）
- **现状**：分享仅限单文件（`functions/api/shares.ts:89` 目录 400）。
- **方案**：目录分享在访问时动态打包 `POST /api/archive` 同款 zip 流（复用 `functions/api/archive.ts`），提取码/过期逻辑不变；分享记录记 `{ key, isDir }`。
- **验收**：目录分享链接经提取码后下载到完整 zip；过期与撤销行为不变。
- **工作量**：中。

### A7. 回收站惰性过期清理（P2）
- **现状**：回收站只增不减，长期使用占空间（Pages Functions 无 Cron Trigger）。
- **方案**：在 `GET /api/trash`（每次打开回收站页必调）中惰性扫描，删除超过 N 天（默认 30，常量可配）的条目；扫描限量（每批 ≤200）避免超时。
- **验收**：伪造过期 trash 元数据后打开回收站，过期条目消失且存储对象被删；未过期不受影响。
- **工作量**：小。

### A8. 搜索结果增强（P2）
- **现状**：全盘搜索结果无关键词高亮、无类型筛选（`src/Main.tsx:1056-1064`）。
- **方案**：文件名命中片段 `<mark>` 高亮；搜索结果页复用类型筛选 Chip。
- **验收**：高亮正确且 XSS 安全（纯文本节点拆分实现）；类型筛选与高亮叠加生效。
- **工作量**：小。

### A9. i18n 框架与英文包（P3）
- **现状**：文案大部分集中在 `src/app/strings.ts`，但组件内仍有大量硬编码中文（Main/TransferManager/TrashView 等），无语言切换。
- **方案**：先完成硬编码文案全部收编进 strings.ts；引入轻量自研字典（不引 i18next），`Accept-Language` + 手动切换持久化；英文包首版可机翻。
- **工作量**：大（收编 1 天 + 翻译校对）。

---

## B. 交互优化

### B1. 键盘导航增强（P0）
- **现状**：上轮已落地方向键/Space/Ctrl+A/F2/Delete/Enter（`src/Main.tsx` 全局 keydown）。缺口：F2 不支持目录（`isDir` 被跳过）、左右键未做网格跨列感知、无 Home/End、鼠标多选仅靠复选框。
- **方案**：F2 对目录打开重命名（后端 MOVE 已支持）；网格视图左右键 = 上一/下一项（列表语义，保守但够用）；Home/End 跳首/尾；Shift+Click 范围选择、Ctrl/Cmd+Click 切换选择（在 `clickItem` 与 `onToggleSelect` 间按修饰键分派）。
- **验收**：TEST_CASES 中 TC-KB 组全部通过；鼠标多选与键盘焦点互不干扰。
- **工作量**：小。

### B2. 删除可撤销（P1）
- **现状**：软删立即执行，toast 无撤销（`src/Main.tsx` confirmDelete 流程）。
- **方案**：「移入回收站」确认后先本地乐观移除，toast 展示「已删除 N 项 · 撤销」5 秒；撤销则直接还原（前端已持有映射，调 trash restore）；超时后真正调用 `POST /api/trash`。
- **验收**：撤销后文件原位返回且回收站无记录；超时后记录出现在回收站。
- **工作量**：中。

### B3. 上传队列增强（P1）
- **现状**：TransferManager 有进度/暂停/重试，但无速度与剩余时间，无全局暂停（`src/TransferManager.tsx`）。
- **方案**：XHR `progress` 事件滑动窗口估速 + ETA；队列头部加「全部暂停/全部继续」；失败任务自动重试 1 次（指数退避 3s）后再标失败。
- **验收**：速度显示稳定不跳变；全部暂停后无新请求发出；失败重试仅一次。
- **工作量**：中。

### B4. 全盘搜索「加载更多」自动化（P1）
- **现状**：手动文字按钮可重复点击、无加载态（`src/Main.tsx:1056-1064`）。
- **方案**：IntersectionObserver 触底自动加载 + Loading 骨架行 + 加载中禁重复触发。
- **验收**：滚动到底自动追加且不重复；无更多时显示「已全部加载」。
- **工作量**：小。

### B5. 操作失败可重试（P1）
- **现状**：全局单个 Snackbar 新消息覆盖旧消息，错误无重试入口（`src/App.tsx:112-124`）。
- **方案**：Snackbar 加 action 按钮（重试/查看任务）；error 级自动延长至 8s；重试闭包由调用方注册。
- **验收**：断网重命名失败 → 点重试恢复成功；连续错误不再相互覆盖（队列化或计数）。
- **工作量**：中。

### B6. 网格卡片 hover 快速操作（P2）
- **现状**：卡片仅右上角 ⋯ 菜单，常用操作（下载/分享）需两步。
- **方案**：hover/焦点时底部浮现半透明操作条（下载、分享、删除三图标，移动端长按不变）；键盘焦点同样触发。
- **工作量**：小。

### B7. 面包屑同级下拉（P2）
- **现状**：面包屑只能沿路径回退，不能跳同级。
- **方案**：Breadcrumbs 分隔符或节点长按下拉列出当前层同级目录（来自父目录缓存）。
- **工作量**：中。

### B8. 多选拖拽移动（P2）
- **现状**：仅单文件可拖入文件夹移动（`Main.tsx:835-860`）。
- **方案**：多选状态下拖动任一选中项即整组拖拽，落点文件夹批量 `MOVE`。
- **工作量**：中。

### B9. 预览增强（P2）
- **现状**：图片/视频原生展示，无缩放旋转/倍速。
- **方案**：图片滚轮缩放 + 双击复位 + 旋转按钮；视频 controlsList 保留 + 倍速菜单（0.5/1/1.5/2）。
- **工作量**：中。

### B10. 日期相对化（P3）
- **方案**：24h 内「N 分钟前」，超限回退日期；tooltip 显示绝对时间。保持等宽数字。
- **工作量**：小。

---

## C. 界面美化

### C1. 代码预览语法高亮（P1）
- **现状**：`PreviewDialog` TextPane 纯文本等宽渲染。
- **方案**：轻量方案——自写 tokenizer 只覆盖 json/js/ts/py/sh（关键字/字符串/注释/数字四类色），≤1MB 才启用；配色跟随亮暗主题（surface.codeText 派生）。
- **验收**：亮暗两模式下对比度达标；大文件不启用不卡顿。
- **工作量**：中。

### C2. 空状态与插画统一（P2）
- **现状**：EmptyState 用单个 MUI 图标（`src/EmptyState.tsx`）。
- **方案**：一组手绘风 SVG 插画（空目录/无搜索结果/回收站空/无分享，4 张），亮暗双套描边色；入场淡入动效。
- **工作量**：中。

### C3. 列表进入动效（P2）
- **方案**：网格/列表项 stagger fade+slide（≤200ms，仅首次加载）；`prefers-reduced-motion` 时禁用。
- **工作量**：小。

### C4. 卡片 hover 微动效（P3）
- **方案**：缩略图 hover 轻微 scale(1.04) + 阴影加深，选中态边框呼吸光效（reduced-motion 禁用）。
- **工作量**：小。

### C5. 顶栏滚动阴影（P3）
- **方案**：内容区滚动 >8px 时顶栏加轻阴影/毛玻璃（backdrop-filter + fallback）。
- **工作量**：小。

### C6. 移动端底部导航动效（P2）
- **方案**：选中项图标弹跳（transform spring）；上传进行中在上传 tab 显示环形进度。
- **工作量**：小。

### C7. a11y 对比度与焦点统一（P0）
- **现状**：深色模式 `text.secondary`（rgba(241,236,229,0.66)）与 caption（0.6）在暖黑背景上的对比度未审计；z-index 魔法数字（90/100/1400）散落。
- **方案**：用脚本核对全部文本 token 对比度 ≥4.5:1（正文）/3:1（辅助），不达标即调；z-index 收敛为 theme.zIndices 常量表。
- **验收**：审计清单全绿；键盘焦点环所有可交互元素可见且风格一致。
- **工作量**：小。

### C8. 文件图标扩展（P3）
- **方案**：fileIconKind 增加 字体/演示/表格模板/设计源文件（fig/sketch/xd）等类别图标与配色。
- **工作量**：小。

### C9. 透明图片棋盘格背景（P3）
- **方案**：图片预览与缩略图容器加 checkerboard CSS 背景（conic-gradient 实现），衬出透明 PNG。
- **工作量**：小。

---

## 落地批次建议

| 批次 | 内容 | 目标 |
|------|------|------|
| 第一批（P0） | A1、A2、A3、B1、C7 | 数据安全与正确性、核心体验补全、可访问性底线 |
| 第二批（P1） | A4、A5、B2、B3、B4、B5、C1 | 脚本化能力、上传体验、错误处理 |
| 第三批（P2/P3） | A6-A9、B6-B10、C2-C6、C8-C9 | 打磨与差异化 |

每批完成后跑一遍 TEST_CASES.md 中对应用例 + 全量 P0 回归，本地 `wrangler pages dev` 验证后提交。

---

# 第二轮（2026-08-30）

> 基于第一轮完成后的全面探索制定。现状：后端已具备 WebDAV Class 1,2、文件/目录分享（提取码 + 过期 + 撤销）、
> 回收站（惰性过期）、Open API（含分块上传）、MCP、静态站点托管；前端为 React 18 + MUI v5 + Emotion（纯 sx，无 CSS 文件），
> 暖色纸感主题 + 暗色模式 + i18n（中/英）+ 键盘导航 + 动效体系均已就位。
> 第 0 批（bug 修复）已随本轮计划同步落地；以下按批次推进。

## A. 功能改进

### A1. 分享落地页升级（P1）
- **现状**：无提取码的分享 GET 直接吐文件流；提取码表单是内联 HTML 且只有亮色硬编码（`functions/share/[[token]].ts:53-88`、`extractForm`）。访客没有「这是什么文件、多大、何时分享」的上下文。
- **方案**：GET 默认返回服务端渲染落地页——纯 HTML+CSS、零脚本（落地页是我们生成的内容，不适用 CSP sandbox；文件内容响应仍单独带 sandbox，两者互不影响）。页面含文件名/类型图标/大小/分享时间 + 「下载」按钮；图片/音视频/PDF/文本额外提供「在线预览」（`<img>`/`<iframe>` 指向同一 URL，内容响应既有 hardening 不变）。`?download=1` 保留直链下载兼容。提取码表单复用落地页视觉，`prefers-color-scheme` 亮暗双套。
- **验收**：落地页信息与预览/下载均正确；提取码、过期（410）、撤销（404）行为与安全响应头（sandbox/nosniff）不回退；旧直链（无参 GET）改为落地页后，自动化脚本下载需用 `?download=1`（README/API 文档注明）。
- **工作量**：中。

### A2. 文本文件在线编辑（P2）
- **现状**：TextPad 只能新建笔记上传（`src/TextPadDrawer.tsx`）；PreviewDialog 的文本面板只读（`src/PreviewDialog.tsx` TextPane）。
- **方案**：文本类文件（`text/*` 与常见代码扩展名，≤1MB）在预览中提供「编辑」模式：textarea 编辑 + 保存走 `authFetch PUT /webdav/{path}`，带 `If-Match: <etag>` 冲突检测（410/412 时提示重新加载）；未保存关闭需确认；保存后通知列表刷新。
- **验收**：编辑保存后重开内容一致；他人改动后保存收到冲突提示；>1MB 或二进制不出现编辑入口。
- **工作量**：中。

### A3. 性能与统计（P2）
- **A3.1 搜索提速**：`functions/api/search.ts` 现为全桶线性逐页扫描。改为 R2 `list` cursor 分段 + 2~3 并发扫描，前端加会话级缓存（同 query 翻页复用）。维持无索引架构（元数据全在 R2），注释说明引入 D1/R2 索引前需先统一各写入路径（api/webdav/sites）。
- **A3.2 存储用量统计**：新增 `GET /api/usage`（会话鉴权）聚合对象数与总大小，结果缓存于 `_$flaredrive$/stats/usage.json`（带 TTL + 扫描限量，避免大桶超时）；前端在 ExplorerBar/Header 入口展示总用量与一级子目录分布条形图。
- **A3.3 MCP 扩展**：`functions/_mcp.ts` 增 search/move/share 管理工具；上传工具内部自动走 `/api/upload` 三段式分块，上限从 1MiB 提升（目标 25MB，保持 Worker CPU 时间约束内）。
- **验收**：万级对象桶搜索首屏 <3s；usage 缓存命中后 <100ms；MCP 大文件上传经分块成功且 abort 可清理。
- **工作量**：中-大。

### A4. 工程现代化（P3，独立分支全量回归后合入）
- **现状**：`react-scripts 5`（CRA）2023 年起停止维护；MUI v5 已落后两个大版本；`web-vitals 2.x` 陈旧。
- **方案**：分两步——① CRA → Vite：`public/index.html` 迁根目录、环境变量改 `import.meta.env`、Jest → Vitest（现有 8 套件 65 用例迁移）、scripts 调整；② MUI v5 → v7：重点 FileGrid 的 Grid 旧 API（v7 移除，改 `<Grid size={...}>`）、theme 兼容性检查、`@mui/icons-material` 同步升级。
- **验收**：typecheck/test/build/e2e 全绿 + GUI 冒烟；包体积不显著回退。
- **工作量**：大（机械但面广）。

## B. 交互与可访问性

### B1. 网格 ARIA 语义与 roving tabindex（P1）
- **现状**：方向键移动仅更新视觉焦点并 `scrollIntoView`（`src/Main.tsx:909-1008`），DOM 焦点不动，屏幕阅读器无网格语义。
- **方案**：网格容器 `role="grid"`/行 `role="row"`/单元格 `role="gridcell"`，方向键同步设置 DOM 焦点（roving tabindex + `aria-activedescendant` 或真实 focus 二选一，实测后定）；列表视图对应 `role="listbox"`/`option`。
- **验收**：NVDA/VoiceOver 可用方向键遍历并朗读选中状态；现有键盘模型（TEST_CASES TC-KB）不回归。
- **工作量**：中。

### B2. 可访问性补全（P1）
- skip-to-content 链接（首 Tab 可达）；Header 裸 `Toolbar` 改 `AppBar`/banner landmark；ConfirmDialog 打开时聚焦安全的「取消」按钮；全站 `:focus-visible` 焦点环风格统一审计。
- **工作量**：小。

### B3. 缩略图 blur-up 淡入（P2）
- **现状**：`src/AuthThumbnail.tsx` 加载完成直接替换 MimeIcon，有跳变。
- **方案**：低质量占位（MimeIcon 淡底）+ blob 加载完成后 opacity 过渡淡入；失败回退逻辑不变。
- **工作量**：小。

## C. 界面美化（中度）

### C1. Ctrl+K 命令面板（P1）
- **现状**：`/` 与 Ctrl/Cmd+K 仅聚焦搜索框（`src/App.tsx:141-155`）。
- **方案**：升级为命令面板 Dialog——上半区文件搜索（复用 `/api/search` + 高亮 + 键盘上下选择回车打开），下半区动作命令（上传文件/新建文件夹/粘贴上传、切换网格/列表、切换亮暗主题与语言、跳转分享/回收站、打开 WebDAV 与 API Key 面板）。`/` 保持聚焦搜索框原行为；面板项注册表结构化，便于后续 MCP/站点管理扩展。
- **验收**：纯键盘完成「搜索打开文件」「切主题」「跳回收站」；reduced-motion 与 a11y 符合 B 组标准。
- **工作量**：中-大。

### C2. 文件详情侧栏（P2）
- **方案**：右侧 Drawer（手机端全屏）——大图预览（复用 AuthThumbnail/棋盘格）、元数据（名称/类型/大小/上传时间/ETag/完整路径）、快捷操作行（下载/分享/重命名/移动/删除/复制 WebDAV 直链）；卡片「信息」按钮与 `i` 键打开。
- **工作量**：中。

### C3. 分享管理升级（P1，与 A1 呼应）
- **方案**：SharesView 卡片加二维码（npm `qrcode` 前端生成 dataURL，扫码即达落地页）、一键复制、过期倒计时徽标、创建时间；ShareDialog 创建成功态同步加二维码。
- **工作量**：小-中。

### C4. 主题细节打磨（P2）
- 滚动条样式（webkit + scrollbar-width，亮暗双套细滚动条）；对比度复核（`text.secondary`/caption 暗色 alpha）；`prefers-reduced-motion` 全站复核。暗色硬编码阴影已由 `theme.ts` 的 `warmShadow()` 统一（第 0 批落地）。
- **工作量**：小。

## 第二轮落地批次

| 批次 | 内容 | 目标 |
|------|------|------|
| 第 0 批（已落地） | i18n 缺键（shareLinkRevoked）、WebDavPanel 字面量文案、`<html lang>` 同步、暗色硬编码阴影（`warmShadow()`） | 正确性 |
| 第 1 批（P1） | A1 分享落地页 + C3 分享管理升级 | 访客与分享体验 |
| 第 2 批（P1） | C1 命令面板 + C2 详情侧栏 + B1/B2 a11y | 效率与可访问性 |
| 第 3 批（P2） | A2 文本在线编辑 + C4 主题细节 | 编辑能力与观感 |
| 第 4 批（P2） | A3 性能与统计 | 规模化能力 |
| 第 5 批（P3） | A4 工程现代化（独立分支） | 工程健康 |

每批验证：`npm run typecheck && npm run test:ci && npm run build && npm run test:e2e`；UI 批次按 TEST_CASES.md 做浏览器 GUI 冒烟；涉及分享/A1 的批次必须回归安全响应头断言（api-e2e 已含）。
