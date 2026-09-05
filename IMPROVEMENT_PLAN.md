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
- **A3.3 MCP 扩展**：`functions/_mcp.ts` 增 search/move/share 管理工具；上传工具内部自动走 `/api/upload` 三段式分块，上限从 1MiB 提升（目标 25MB，保持 Worker CPU 时间约束内）。（2026-08-30 注：已并入第三轮 B1，以第三轮内容为准）
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

---

# 第三轮（2026-08-30）：Sites 管理面板 · MCP 深化 · CLI

> 经讨论选定三个方向优先推进，其余候选（访客上传链接、相册模式、文本在线编辑等）暂不排期。
> 本轮 MCP 工作流**吸收并替代第二轮 A3.3**（search/move/share 工具 + 分块上传，内容为其超集），
> 第二轮 A3 剩余的 A3.1/A3.2（搜索提速、用量统计）排期不变。
> 批次顺序：Sites 后端先行（MCP sites 工具依赖其配置设计），CLI 可与任何批次并行。

## A. Sites 管理面板（P1，先行）

### A1. 站点配置与元数据 API（后端）
- **现状**：`sites/{slug}/` 仅是普通 R2 前缀，`functions/_middleware.ts` 按 Host 接管 GET/HEAD（解析在纯函数 `functions/_sites.ts`）；无站点列表、无配置、无统计；slug 校验 `SLUG_RE` 私有在 `_sites.ts:3`；miss 一律纯 404。
- **方案**：
  1. `functions/_sites.ts` 导出 slug 校验供 API 层复用；新增每站配置对象 `_$flaredrive$/sites/{slug}.json`（`{ slug, spa?: boolean, stats?: { objects, size, cachedAt } }`），沿用 shares 元数据「内部前缀 + JSON 对象」的既有惯例。
  2. **SPA fallback 与自定义 404**：中间件仅在最终 miss 时读一次配置——`spa=true` 回源 `{slug}/index.html`（200，支持 history 路由）；否则存在 `{slug}/404.html` 时以其内容返回 404；都不满足维持现状纯 404。正常命中路径**零额外 R2 读**；HEAD 与 GET 行为对齐。
  3. 新增 `functions/api/sites.ts`（会话 Basic 鉴权，风格对齐 `functions/api/keys.ts`）：GET 列站点（`bucket.list({ prefix: "sites/", delimiter: "/" })` 取 commonPrefixes + 各自配置）；POST 更新配置 `{ slug, spa? }`；DELETE `?slug=` 删整站（复用目录硬删，>1000 对象按既有约定分批提示）。文件数/总大小按需前缀聚合（每站 ≤5000 对象上限），结果写回配置 JSON 缓存（TTL 10 分钟）。
- **验收**：api-e2e 新增——curl 带 `-H "Host: <SITES_HOST>"`：miss 默认 404；`spa=1` 后 miss 返回 index.html（200）；存在 404.html 时返回 404 + 内容；非法 slug 400；删站后站点文件与配置均消失；目录 URL 落 index.html 的既有行为不回归。
- **工作量**：中（约 1 天）。

### A2. SitesView 管理界面
- **现状**：前端只有 folder/shares/trash 三个 section（`src/app/route.ts:3-7`），站点管理只能靠 WebDAV/API 裸操作，用户不可见。
- **方案**：
  1. 路由与入口：新增 `{ kind: "sites" }` 路由 `#/sites`，ExplorerBar ToggleButtonGroup 加第四段，MobileNav 文件菜单补入口；新建 `src/SitesView.tsx`。
  2. 站点卡片：slug、类型徽标（静态/SPA）、文件数/总大小（懒加载统计）、站点 URL 一键复制；`SITES_HOST` 未配置时顶部横幅给出 wrangler.toml 配置指引（链接 docs/sites.md），「打开站点」禁用。
  3. 操作：「管理文件」直接跳 `#/sites/{slug}/` 文件夹路由——**复用整套文件管理器**（上传/重命名/删除全都有），零新代码；「上传 zip 部署」前端 fflate.unzip（已是依赖）→ 走既有 transferQueue 并发上传到 `sites/{slug}/`，可勾选「部署前清空」，进度/暂停/重试全套复用；SPA 开关（POST 配置）；删除（ConfirmDialog 输入 slug 确认）。
  4. 大站提示（≥200MB 或 ≥5000 文件建议 WebDAV/CLI 部署）；文案全量收编 strings.ts。
- **验收**：TEST_CASES.md 增 TC-SITES 组；GUI 冒烟：zip 部署后新标签打开站点、SPA 路由深链刷新可回退 index、开关切换即时生效、删站后文件区同步消失、SITES_HOST 未配置时的引导横幅。
- **工作量**：中（约 1 天）。

## B. MCP 持续加深（P1/P2）

### B1. 通用工具补齐 + 大文件（吸收第二轮 A3.3）
- **现状**：`functions/_mcp.ts` 纯分发器 5 工具（list/upload/download/mkdir/delete），上传/下载硬上限 1 MiB（`MCP_MAX_BYTES`）；`functions/mcp.ts` 以 `makeApis` 克隆请求转发到 /api handler，API key 鉴权。
- **方案**：
  1. 新工具：`search {query, limit, cursor}`（→ /api/search）、`move {source, destination}`（→ /api/rename，目录可用）、`copy {source, destination}`（**新增 POST /api/copy**，抽取 `_apikey.ts` 中 `copyThenDelete` 的拷贝半边）、`stat {path}`（**新增 GET /api/stat**，bucket.head 返回 size/etag/uploaded/contentType）。
  2. 分享三件套：`share_create {path, extractCode?, expiresInDays?}`、`share_list`、`share_revoke {token}`。**前置改动**：`/api/shares` 放行 API key 鉴权（现仅会话 Basic，`functions/api/shares.ts` 增加 `authorizeApiKey` 分支），docs/API.md 注明「API key 可管理分享」。
  3. 大文件：`upload` >1MiB 时内部自动走 `/api/upload?uploads` 三段式，上限提升至 10-25MB（base64 后单条 JSON-RPC ~34MB，按 Worker 内存实测定档）；`download` 大文件返回分块指引或按 `part` 参数分页返回 base64。
  4. 工具 schema 全部进 `MCP_TOOLS`；`_mcp.ts` 保持纯函数（继续由 `src/app/__tests__/mcp.test.ts` 覆盖）。
- **验收**：e2e 增 MCP 断言——tools/list 数量与新工具、search/move/copy/stat 成功路径、无 key 401、/api/shares 的 key 放行、大文件分块上传后逐字节校验、abort 清理。
- **工作量**：中-大（1-2 天）。

### B2. Sites MCP 工具（依赖 A1）
- **方案**：`sites_list`（slug + 配置 + 统计）、`sites_config {slug, spa?}`、`sites_delete {slug}`，内部转发 A1 的 /api/sites；upload/delete 通用工具对 `sites/` 前缀天然可用，docs/agents.md 补 agent 部署站点推荐序列（mkdir → upload ×N → sites_config）。
- **验收**：mcp.test.ts 纯逻辑用例 + e2e 调用断言。
- **工作量**：小（约 0.5 天）。

## C. davflare-cli（P2，可与 A/B 并行）

- **现状**：Open API 已完备（list 分页 / upload 单发+三段式 / mkdir / rename / delete / backup / download / search），docs/API.md 已写双向同步配方（local wins + 冲突备份），但只能 curl 手搓。
- **方案**：仓库内 `cli/` 子目录，独立 npm 包 `davflare-cli`（bin: `davflare`），Node ≥18 + TypeScript + ESM；不接 CRA/Jest，自建 `tsc` + vitest；发布流程（版本号/CHANGELOG/README）文档化。
  1. **登录**：`davflare login` 交互输入 server + 用户名/密码 → 以会话 Basic 调 `POST /api/keys` 自动创建专用密钥 `cli-{hostname}`（可 `davflare logout` 吊销）→ 存 `~/.config/davflare/config.json`（0600）；CI 场景支持 `DAVFLARE_SERVER` / `DAVFLARE_KEY` 环境变量。
  2. **v1 命令**：`ls [-l] [path]`、`mkdir`、`rm [-r] [--hard]`、`mv src dst`、`cp` 本地↔远端双向（>100MB 自动三段式分块上传；下载断点续传依赖 `/api/download` 补 Range——小改，对齐 share 端点 `range: request.headers` 的既有用法）、`sync push|pull [--dry-run]`（按 docs 配方：mtime+size 比对，local wins，远端冲突经 `/api/backup` 改名 `name.conflict-<ts>`）、`--json` 机器可读输出。
  3. **实现约束**：运行时依赖仅 commander，fetch/流全部 Node 内建；同步 diff 引擎做成纯函数便于单测；进度输出走 stderr 保持管道友好。
- **验收**：`cli/e2e.sh` 对 `wrangler pages dev` 全命令回归（与 api-e2e 同套路，可复用其起停逻辑）；sync 单测覆盖 新增/修改/删除/冲突 四象限；README 含安装、登录、同步示例。
- **工作量**：大（2-3 天）。

## 第三轮批次与依赖

| 批次 | 内容 | 依赖 |
|------|------|------|
| 第 1 批（P1） | A1 Sites 后端（配置/SPA/404/统计 API） | 无，先行 |
| 第 2 批（P1） | A2 SitesView 管理界面 | 第 1 批 |
| 第 3 批（P1/P2） | B1 MCP 通用工具 + B2 sites 工具 | B2 依赖第 1 批；可与第 2 批并行 |
| 第 4 批（P2） | C davflare-cli | 无，可全程并行 |

每批验证：`npm run typecheck && npm run test:ci && npm run build && npm run test:e2e`；GUI 部分按 TEST_CASES.md 冒烟；CLI 另跑 `cli/e2e.sh`。

---

# 第四轮（2026-09-05）：代码优化 · 界面美化 · 测试覆盖率

> 基于全仓调研（代码质量 / UI 现状 / 测试覆盖三线并查）制定，分三个 PR 落地：
> `refactor/code-optimization`、`feat/ui-polish`、`test/coverage-boost`。
> 关键结论：85% Lines 仅为前端 src/ 的口径（statements 82.4%、branches 75.7%），
> functions/（8058 行）不在度量内、约 4400 行核心逻辑无单测；测试不进 CI、无 coverageThreshold。

## A. 代码优化（refactor/code-optimization，本批落地）

- **A1 后端重复逻辑收敛**：`jsonResponse` 5 份 → 统一 import `_apikey.ts`；`isAuthorized` 7 份 →
  Basic-only 端点直用 `verifyBasicAuth`，Basic-or-key 端点统一 `isSessionOrKeyAuthorized`；
  keys.ts 收编共享 `StoredApiKey`/`sha256Hex`/`listStoredKeys`。裸 `new Response("Unauthorized")` 全部走 `textResponse`。
- **A2 WebDAV 鉴权 fail-closed**：`protocol.ts isAuthorized` 对空凭据一律拒绝（对齐 `_apikey.ts`）。
- **A3 鉴权链路性能**：`listStoredKeys` 并行 get；`touchLastUsed` 60s 节流，避免每请求一次 R2 put。
- **A4 工程细节**：`@cloudflare/workers-types` 升级消 7 处 R2 `include` @ts-ignore；
  tsconfig 开启 `noUnusedLocals/noUnusedParameters/noImplicitOverride/noFallthroughCasesInSwitch`；删除 web-vitals 死依赖。
- **A5 错误处理**：前端 `errorMessage()` 收敛 37 处 `(error as Error).message`（Error.message / Response.status / 兜底三态）。
- **A6 Main.tsx 拆分**：1756 → ~1060 行；PathBar 独立；抽 `useFolderListing/useMultiSelect/useFolderCounts/
  useKeyboardShortcuts/usePasteUpload/useDragDropUpload/useUploadInputs` + `app/interaction.ts` 纯函数。
- **A7 渲染与网络**：FileGrid `React.memo`（回调 useCallback + emptyMessage useMemo 稳定 props）；
  PreviewDialog/SitesView/ImagesView `React.lazy` 拆 chunk；新增 `POST /api/counts` 批量计数替代逐目录 PROPFIND 的 N+1。
- **遗留**：CRA→Vite + Jest→Vitest + MUI v5→v7（原第二轮 A4）仍需独立分支；后端 JSON 错误格式统一涉及 API 兼容性，暂缓。

## B. 界面美化（feat/ui-polish，本批落地）

- **B1 一致性快赢**：`theme.motion` 动效 token + CssBaseline 全局 `prefers-reduced-motion` 兜底；
  8 处橙色 alpha 字面量收敛；滚动条样式（webkit + scrollbar-width 亮暗双套）；`theme-color` 暗色 meta；
  PreviewDialog 淡入过渡替代 `transitionDuration={0}`；`borderRadius: 999` 写法统一；MimeIcon 暗色提亮补全；缩略图 blur-up 淡入。
- **B2 Ctrl+K 命令面板**：文件搜索（/api/search + 高亮 + 键盘选择）+ 动作命令注册表（上传/新建文件夹/切视图/切主题/切语言/跳转分享回收站）。
- **B3 文件详情侧栏**：右 Drawer 大图预览 + 元数据（大小/时间/类型/路径）+ 快捷操作行。
- **B4 分享管理收尾**：二维码（qrcode dataURL）+ 过期倒计时徽标 + 创建时间。
- **B5 分享落地页**：`functions/share/[[token]].ts` 服务端渲染零脚本落地页（文件名/大小/分享时间 + 预览/下载），提取码表单亮暗双套，安全响应头不回退。
- **B6 a11y**：skip-to-content、Header 改 AppBar、ConfirmDialog 聚焦安全按钮、网格 `role="grid"` 语义。

## C. 测试覆盖率提升（test/coverage-boost，本批落地）

- **C1 基础设施**：共享测试工具（jsonResponse 工厂 / renderMain + authFetch / localStorage helper / PROPFIND XML fixture）；jest `coverageThreshold`。
- **C2 后端直测**：InMemoryBucket（mock R2）直测 functions/——webdav/protocol（条件请求/Range/LOCK/MOVE/内部前缀）、trash/shares/share token、upload 三段式、_middleware 安全边界。
- **C3 前端洼地**：新 hooks、transfer.ts 分支、PreviewDialog、App.tsx；目标 lines 90% / branches 85%。
- **C4 cli + CI**：vitest coverage 配置 + client/index 补测；GitHub Actions workflow（typecheck + test + build + e2e）。

## 第四轮批次

| 批次 | 内容 | PR |
|------|------|----|
| 第 1 批 | A1-A7 代码优化 | refactor/code-optimization |
| 第 2 批 | B1-B6 界面美化 | feat/ui-polish |
| 第 3 批 | C1-C4 测试覆盖率 | test/coverage-boost |

每批验证：`npm run typecheck && npm run test:ci && npm run build && npm run test:e2e`；UI 批次做浏览器 GUI 冒烟。
