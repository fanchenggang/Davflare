"use strict";

/**
 * Davflare library page wiring. Pure display/model logic lives in
 * bookmarksView.js / bookmarks.js / workspaces.js / tabRules.js /
 * pinyin.js; this file only touches chrome.* and the DOM.
 */

/* global Bookmarks, BookmarksView, DavflareDav, Workspaces, TabRules, PinyinIndex, HamHome, mergeSettings */

var COPY = {
  en: {
    title: "Davflare Bookmarks",
    brandSub: "Bookmarks",
    viewBookmarks: "Bookmarks",
    viewWorkspaces: "Workspaces",
    viewTabRules: "Tab groups",
    navAll: "All bookmarks",
    folders: "Folders",
    tags: "Tags",
    unfiled: "Unfiled",
    searchPlaceholder: "Search bookmarks… (pinyin supported)",
    allFolders: "All folders",
    sinceAll: "Any time",
    sinceToday: "Today",
    sinceWeek: "Last 7 days",
    sinceMonth: "Last 30 days",
    sinceYear: "Last year",
    empty: "No bookmarks yet. Right-click any page and choose “Save page to Davflare”, or click Add.",
    emptyFilter: "Nothing matches the current filter.",
    add: "Add",
    save: "Save",
    import: "Import",
    hhNotFound: "No bookmarks/meta.json found under /HamHomeSync/ on this instance.",
    hhInvalid: "HamHome data could not be parsed.",
    hhImported: "Imported {n} bookmark(s) from HamHome.",
    hhNone: "Nothing new to import from HamHome.",
    export: "Export",
    importDialogTitle: "Import bookmarks",
    importDesc:
      "Pick a Davflare / HamHome JSON backup or a bookmarks HTML exported from your browser.",
    importPick: "Choose file… (JSON / HTML)",
    importAltLegend: "Other ways to import",
    importBrowser: "From browser bookmarks",
    importHamHomeSync: "From this instance's HamHomeSync folder",
    importInvalid: "Could not parse this file as a bookmark backup.",
    importEmpty: "No bookmarks found in this file.",
    exportDialogTitle: "Export bookmarks",
    exportDesc: "HTML can be re-imported by browsers; JSON keeps folders, tags and notes.",
    exportHtmlAction: "HTML (browser-importable)",
    exportJsonAction: "JSON (full backup)",
    exportedJson: "Exported davflare-bookmarks.json.",
    drive: "Drive",
    driveReload: "Reload",
    driveOpenExternal: "Open in new tab",
    libReload: "Reload library",
    driveNeedsBuild: "Drive view needs a one-time build: run “npm run build:extension” in the repo, then reload the extension.",
    settings: "Settings",
    addDialogTitle: "Add bookmark",
    urlLabel: "URL",
    titleLabel: "Title",
    cancel: "Cancel",
    deleteLabel: "Delete",
    confirmDelete: "Delete this bookmark?",
    tagDialogTitle: "Edit bookmark",
    tagInputLabel: "Tags (comma separated)",
    noteInputLabel: "Note",
    needConfig: "Configure your instance URL and WebDAV credentials in settings first.",
    openSettings: "Open settings",
    viewSettings: "Settings",
    setupHint: "First time here? Configure your instance below, then save.",
    settingsUrlLabel: "Instance URL",
    urlHint: "Paste the Pages or custom-domain URL of your own Davflare instance.",
    pathLabel: "Bookmark directory",
    pathHint:
      "Relative to /webdav/. Default is \"bookmarks\"; e.g. \"qa/bookmarks\" isolates test data.",
    modeLabel: "Default home view",
    modeDrive: "Drive",
    modeBookmarks: "Bookmark library",
    modeHint:
      "The home page (and the popup's entry) opens this view first; the toolbar icon opens the save popup. Right-click the toolbar icon to switch anytime.",
    davLabel: "WebDAV credentials",
    userLabel: "Username",
    passLabel: "Password",
    davHint:
      "Stored only on this device. Same values as your deployment's WEBDAV_USERNAME / WEBDAV_PASSWORD.",
    testConn: "Test connection",
    testing: "Testing…",
    settingsSaved: "Saved.",
    savedNoGrant:
      "Saved, but access to this site was not granted — bookmark features will not work.",
    settingsCleared: "Saved. With no URL set, the home page opens this settings view.",
    probeOk: "Connected. WebDAV is enabled.",
    probeOther: "The instance returned an unexpected response.",
    moreLabel: "More",
    emptyTitle: "Your library is empty",
    emptyDesc: "Save your go-to pages, or import a backup file.",
    clearFilter: "Clear filters",
    emptyFolderTitle: "No bookmarks in this folder yet",
    emptyTagTitle: "No bookmarks with this tag yet",
    emptyWsTitle: "No workspaces yet",
    emptyRulesTitle: "No rules yet",
    cardEdit: "Edit",
    cardSnap: "Snapshot",
    cardMove: "Move to folder…",
    copyLink: "Copy link",
    linkCopied: "Link copied.",
    moveTitle: "Move to folder",
    undoMsg: "Deleted {n} bookmark(s).",
    undo: "Undo",
    tagUrlInvalid: "Enter a valid http(s) URL that is not already saved.",
    folderDeleteConfirmWithCount:
      "Delete “{p}” and its subfolders? {n} bookmark(s) inside (subfolders included) will move to Unfiled.",
    folderDeleteConfirmEmptyTree: "Delete the empty folder “{p}” and its empty subfolders?",
    folderDeletedMoved: "Folder deleted — {n} bookmark(s) moved to Unfiled.",
    folderDeleted: "Folder deleted.",
    folderRestored: "Folder restored.",
    errDisabled: "WebDAV is disabled on this instance (feature switch off).",
    errNotConfigured: "The server has no WebDAV credentials configured.",
    errUnauthorized: "Wrong WebDAV username or password. Update them in settings.",
    errNetwork: "Cannot reach the instance. Check the URL in settings.",
    errConflict: "Changed elsewhere — reloaded the remote copy. Please retry.",
    errTimeout: "The instance timed out (large library or slow network). Try again.",
    errOther: "The instance returned an unexpected response.",
    retry: "Retry",
    invalidUrl: "Enter a valid http(s) URL.",
    exists: "This URL is already in the library.",
    added: "Saved.",
    deleted: "Deleted.",
    importDenied: "Import needs the “Read and change your bookmarks” permission.",
    importDone: "Imported {n} new bookmark(s).",
    importNone: "No new bookmarks to import.",
    moveDone: "Moved {n} bookmark(s).",
    exported: "Exported bookmarks.html.",
    syncPrefix: "synced",
    neverSynced: "never synced",
    offline: "offline",
    saveWindow: "Save current window",
    wsCount: "{n} workspace(s)",
    wsEmpty: "No workspaces yet. Click “Save current window” to snapshot the open tabs.",
    wsNoPages: "This window has no http(s) tabs worth saving.",
    wsNameTitle: "Workspace name",
    restoreAll: "Restore all",
    restoreSelected: "Restore selected",
    wsSelectAll: "Select all pages",
    wsSelectNone: "Clear selection",
    wsUpdateFromWindow: "Replace with current window",
    wsUpdateConfirm: "Replace “{name}” ({n} pages) with the {m} open tab(s) in this window?",
    wsUpdated: "Workspace updated ({n} page(s)).",
    wsRestored: "Opened {n} tab(s) in a new window.",
    wsReload: "Reload",
    wsSelectedCount: "{n} selected",
    rename: "Rename",
    pinMark: "pinned",
    groupMark: "group: {t}",
    ruleAdd: "Add rule",
    ruleDialogTitle: "Grouping rule",
    ruleDomainLabel: "Domains (comma separated)",
    ruleUrlLabel: "URL contains",
    ruleTitleLabel: "Title contains",
    ruleRegexLabel: "URL regex",
    ruleNameLabel: "Group title",
    ruleColorLabel: "Color",
    ruleOrderLabel: "Priority",
    ruleCollapsedText: "Collapse the group",
    rulesEmpty: "No rules yet. Rules group tabs in the current window by domain, URL, title, or regex.",
    rulesNone: "Nothing to group in this window.",
    rulesApplied: "Created {n} group(s).",
    ruleInvalidRegex: "Invalid regular expression.",
    ruleNeedCriteria: "Add at least one criterion.",
    groupCurrentWindow: "Group current window",
    fallbackText: "Group the rest by domain",
    invalidName: "Enter a name.",
    snapLegend: "Snapshot",
    snapCapture: "Capture",
    snapUpdate: "Re-capture",
    snapView: "View",
    snapDownload: "Download",
    snapDelete: "Delete",
    snapNone: "No snapshot yet. Captures the page as a single HTML file onto your WebDAV.",
    snapCapturing: "Capturing…",
    snapSaved: "Snapshot saved.",
    snapCaptureFail: "Could not capture this page (restricted or failed to load).",
    snapRestricted:
      "This URL cannot be captured (chrome://, extension, or other restricted pages).",
    snapHostDenied:
      "Capture needs permission to read this site. Allow access when Chrome prompts, then try again.",
    snapLoadFail: "The page failed to open or timed out before capture.",
    snapInjectFail:
      "Could not inject the capture script into this page (host permission or page blocked it).",
    snapWriteFail: "Page was captured, but writing the snapshot to WebDAV failed.",
    snapTooLarge: "Snapshot exceeds 8 MB and was not saved.",
    snapMissing: "Snapshot file is missing on the server.",
    snapConfirmDelete: "Delete this snapshot from WebDAV?",
    snapDeleted: "Snapshot deleted.",
    snapBadge: "Snapshot",
    snapViewQuick: "View snapshot",
    snapReplaceConfirm: "Replace the existing snapshot for this bookmark?",
    snapConflict: "Snapshot index changed elsewhere — reloaded. Please retry.",
    navPinned: "Pinned",
    pinAdd: "Pin",
    pinRemove: "Unpin",
    batchPinDone: "Pinned {n} bookmark(s).",
    batchUnpinDone: "Unpinned {n} bookmark(s).",
    batchUnpinConfirm: "Unpin {n} selected bookmark(s)?",
    emptyPinnedTitle: "No pinned bookmarks yet",
    selAll: "Select all",
    selNone: "Deselect all",
    sortLabel: "Sort",
    sortDefault: "Default order",
    sortLatest: "Newest first",
    sortOldest: "Oldest first",
    sortTitle: "Title A–Z",
    sortDomain: "Domain A–Z",
    openBookmark: "Open",
    batchSelected: "{n} selected",
    batchMove: "Move",
    batchTags: "Tags",
    batchPin: "Pin",
    batchUnpin: "Unpin",
    batchDelete: "Delete",
    batchMoveTitle: "Move bookmarks",
    batchMoveLabel: "Target folder",
    batchMoveHint:
      "Pick an existing folder or type a new path (a/b for nesting). Leave empty for Unfiled.",
    batchMoveBtn: "Move",
    batchTagsTitle: "Edit tags on selected bookmarks",
    batchTagsAdd: "Add tags (comma separated)",
    batchTagsRemove: "Remove tags (comma separated)",
    batchDeleteConfirm: "Delete the {n} selected bookmark(s)?",
    folderAdd: "New folder",
    folderAddTitle: "New folder",
    folderRename: "Rename folder",
    folderRenameTitle: "Rename folder",
    folderDelete: "Delete folder",
    folderDeleteConfirm: "Delete the empty folder “{p}”?",
    folderNameLabel: "Folder path",
    folderNameHint: "Use / for nesting, e.g. Dev/Rust.",
    folderExists: "This folder already exists.",
    exportChromeLegend: "Browser",
    exportChromeFolderLabel: "Target folder",
    exportChromeSkip: "Prefer skipping duplicates (same URL)",
    exportChromeClear: "Clear the target folder first",
    exportChromeBtn: "Write back to browser",
    exportChromeClearConfirm:
      "Remove the {n} item(s) currently inside the target folder first?",
    exportChromeDone: "Wrote {n} bookmark(s) into browser bookmarks.",
    exportChromeDenied:
      "Write-back needs the “Read and change your bookmarks” permission.",
    exportChromeDeniedHint:
      "If Chrome did not show a system prompt: open chrome://extensions → Davflare → Details, grant Bookmarks under Site access / Permissions, then retry. Some unpacked Chromium builds never show optional-permission dialogs — use Google Chrome or a packed install.",
    exportChromeConflictNote:
      "Same-URL overlaps in the target folder always show a conflict prompt — nothing is overwritten silently.",
    chromeConflictTitle: "Write-back conflicts",
    chromeConflictSummary: "{c} URL(s) already exist in the target · {n} new will be created.",
    chromeConflictHint:
      "Skip keeps browser copies. Update matching rewrites their titles from the library.",
    chromeConflictSkip: "Skip conflicts",
    chromeConflictOverwrite: "Update matching",
    chromeConflictCancel: "Cancel",
    chromeConflictLib: "Library: {t}",
    chromeConflictBrowser: "Browser: {t}",
    exportHhLegend: "HamHome round-trip",
    exportHhHint:
      "Merges this library into /HamHomeSync/ (meta.json + categories.json); existing HamHome entries are kept.",
    exportHhBtn: "Write back to HamHomeSync",
    exportedHamHome: "Wrote meta.json + categories.json under /HamHomeSync/.",
    presetPlaceholder: "Filter presets",
    presetSaveTitle: "Save the current tag+time filter as a preset",
    presetDeleteTitle: "Delete this preset",
    presetDialogTitle: "Save filter preset",
    presetNameLabel: "Name",
    presetNeedTag: "Pick a tag, folder, or Pinned filter first, then save it as a preset.",
    presetSaved: "Preset saved.",
    presetKindTag: "tag",
    presetKindFolder: "folder",
    presetKindPinned: "Pinned",
    presetUnfiled: "Unfiled",
    presetDeleteConfirm: "Delete the preset “{p}”?",
    favoritesTitle: "Favorites",
    favoritesEmpty: "Star folders or tags below for quick access.",
    favAdd: "Add to favorites",
    favRemove: "Remove from favorites",
    favKindFolder: "Folder",
    favKindTag: "Tag",
    favKindPinned: "Pinned",
    storageLegend: "Library storage",
    storageBookmarks: "Bookmarks (HTML + JSON)",
    storageWorkspaces: "Workspaces",
    storageTabRules: "Tab group rules",
    storageSnaps: "Snapshots (index + HTML)",
    storageTotal: "Estimated total",
    storageNote:
      "Sizes are read from your WebDAV bookmark directory (R2/Drive footprint for this library). Snapshot HTML uses sizes recorded in the index.",
    storageRefresh: "Refresh sizes",
    storageLoading: "Measuring…",
    storageNeedConfig: "Save instance settings first to measure storage.",
    storageDone: "Storage sizes updated.",
    storageFailed: "Could not read some library files.",
    storagePath: "Path: {p}",
    shortcutLegend: "Keyboard shortcuts",
    shortcutSavePage: "Save current page",
    shortcutEdgePanel: "Toggle in-page panel",
    shortcutNone: "Not set",
    shortcutsHint: "Change them any time at chrome://extensions/shortcuts.",
    permBookmarksTitle: "Allow bookmark access?",
    permBookmarksBody:
      "Davflare needs Chrome’s “Read and change your bookmarks” permission to import or write back. Chrome should show a system prompt next — choose Allow. If no prompt appears (common in some unpacked Chromium builds), grant Bookmarks under chrome://extensions → Davflare → Details, then retry.",
    permBookmarksContinue: "Continue",
    snapIndexMissing:
      "No snapshots index yet (snapshots.json). Capturing a page will create it under your bookmark directory.",
    snapWriteFailPath:
      "Could not write the snapshot file. Check WebDAV is enabled and the bookmark directory is writable.",
    navTrash: "Trash",
    navDuplicates: "Duplicates",
    trashHint: "Deleted bookmarks stay here for 30 days.",
    trashRestore: "Restore",
    trashRestoreSel: "Restore selected",
    trashDeleteForever: "Delete forever",
    trashDeleteForeverConfirm: "Permanently delete this bookmark? This cannot be undone.",
    trashEmptyBtn: "Empty trash",
    trashEmptyConfirm: "Permanently delete all {n} item(s) in the trash? This cannot be undone.",
    trashRestored: "Restored {n} bookmark(s).",
    trashEmptied: "Trash emptied.",
    trashPurged: "Auto-purged {n} expired item(s).",
    trashDeletedAgo: "Deleted {w}",
    trashEmptyTitle: "Trash is empty",
    trashEmptyDesc: "Deleted bookmarks land here first — restore them anytime within 30 days.",
    trashPermanentHint: "Deleting here skips the trash permanently.",
    dupHint: "{g} group(s) share the same URL.",
    dupGroupTitle: "{n} copies of one URL",
    dupKeep: "Keep selected, trash the rest",
    dupKeepOldestAll: "Keep oldest everywhere",
    dupKeepDone: "Kept 1, moved {n} duplicate(s) to the trash.",
    dupKeepAllDone: "Kept the oldest in {g} group(s), moved {n} duplicate(s) to the trash.",
    dupEmptyTitle: "No duplicates",
    dupEmptyDesc: "Every URL appears exactly once in the library.",
  },
  zh: {
    title: "Davflare 书签",
    brandSub: "书签库",
    viewBookmarks: "书签",
    viewWorkspaces: "工作区",
    viewTabRules: "Tab 分组",
    navAll: "所有书签",
    folders: "分类",
    tags: "标签",
    unfiled: "未分类",
    searchPlaceholder: "搜索书签…（支持拼音）",
    allFolders: "全部分类",
    sinceAll: "全部时间",
    sinceToday: "今天",
    sinceWeek: "最近 7 天",
    sinceMonth: "最近 30 天",
    sinceYear: "最近一年",
    empty: "还没有书签。在任意网页右键选择「收藏此页到 Davflare」，或点「添加」。",
    emptyFilter: "没有符合当前筛选的书签。",
    add: "添加",
    save: "保存",
    import: "导入",
    hhNotFound: "实例 /HamHomeSync/bookmarks/ 下没有 meta.json。",
    hhInvalid: "HamHome 数据无法解析。",
    hhImported: "已从 HamHome 导入 {n} 个书签。",
    hhNone: "HamHome 没有可导入的新书签。",
    export: "导出",
    importDialogTitle: "导入书签",
    importDesc: "选择 Davflare / HamHome 的 JSON 备份，或浏览器导出的书签 HTML 文件。",
    importPick: "选择文件…（JSON / HTML）",
    importAltLegend: "其他导入方式",
    importBrowser: "从浏览器书签导入",
    importHamHomeSync: "从本实例 HamHomeSync 目录导入",
    importInvalid: "无法把这个文件解析成书签备份。",
    importEmpty: "文件里没有找到可导入的书签。",
    exportDialogTitle: "导出书签",
    exportDesc: "HTML 可被浏览器重新导入；JSON 包含文件夹、标签与备注等完整信息。",
    exportHtmlAction: "HTML（浏览器可导入）",
    exportJsonAction: "JSON（完整备份）",
    exportedJson: "已导出 davflare-bookmarks.json。",
    drive: "网盘",
    driveReload: "刷新",
    driveOpenExternal: "新标签页打开",
    libReload: "刷新书签库",
    driveNeedsBuild: "网盘视图需要先构建一次：在仓库根目录运行「npm run build:extension」，然后重新加载扩展。",
    settings: "设置",
    addDialogTitle: "添加书签",
    urlLabel: "地址",
    titleLabel: "标题",
    cancel: "取消",
    deleteLabel: "删除",
    confirmDelete: "确定删除这个书签？",
    tagDialogTitle: "编辑书签",
    tagInputLabel: "标签（逗号分隔）",
    noteInputLabel: "备注",
    needConfig: "请先在设置中配置实例地址与 WebDAV 凭据。",
    openSettings: "打开设置",
    viewSettings: "设置",
    setupHint: "首次使用：先在下方配置实例地址与 WebDAV 凭据，保存后即可使用。",
    settingsUrlLabel: "实例地址",
    urlHint: "粘贴你自己的 Pages 或自定义域名。",
    pathLabel: "书签目录",
    pathHint: "相对 /webdav/ 的路径。默认为 bookmarks；可填如 qa/bookmarks 隔离测试数据。",
    modeLabel: "插件主页默认视图",
    modeDrive: "网盘",
    modeBookmarks: "书签库",
    modeHint: "插件主页（含收藏弹窗入口）默认打开该视图；工具栏图标点击弹出收藏弹窗。可随时右键工具栏图标切换。",
    davLabel: "WebDAV 凭据",
    userLabel: "用户名",
    passLabel: "密码",
    davHint: "仅保存在本设备。与你部署时配置的 WEBDAV_USERNAME / WEBDAV_PASSWORD 一致。",
    testConn: "测试连接",
    testing: "测试中…",
    settingsSaved: "已保存。",
    savedNoGrant: "已保存，但未授权访问该站点，书签功能将不可用。",
    settingsCleared: "已保存。未填写地址时，插件主页会打开本设置视图。",
    probeOk: "连接成功，WebDAV 已开启。",
    probeOther: "实例返回了未预期的响应。",
    moreLabel: "更多",
    emptyTitle: "书签库还是空的",
    emptyDesc: "把常用页面存进来，或导入一份备份文件。",
    clearFilter: "清除筛选",
    emptyFolderTitle: "该分类下还没有书签",
    emptyTagTitle: "该标签下还没有书签",
    emptyWsTitle: "还没有工作区",
    emptyRulesTitle: "还没有规则",
    cardEdit: "编辑",
    cardSnap: "快照",
    cardMove: "移动到文件夹…",
    copyLink: "复制链接",
    linkCopied: "链接已复制。",
    moveTitle: "移动到文件夹",
    undoMsg: "已删除 {n} 个书签。",
    undo: "撤销",
    tagUrlInvalid: "请输入有效的 http(s) 网址，且不能与其他书签重复。",
    folderDeleteConfirmWithCount:
      "删除「{p}」及其子文件夹？其中共 {n} 个书签（含子文件夹）将移入「未分类」。",
    folderDeleteConfirmEmptyTree: "确定删除空文件夹「{p}」及其空的子文件夹？",
    folderDeletedMoved: "文件夹已删除，{n} 个书签移入「未分类」。",
    folderDeleted: "文件夹已删除。",
    folderRestored: "文件夹已恢复。",
    errDisabled: "该实例已关闭 WebDAV（功能开关）。",
    errNotConfigured: "服务端未配置 WebDAV 凭据。",
    errUnauthorized: "WebDAV 用户名或密码错误，请在设置中更新。",
    errNetwork: "无法连接实例，请在设置中检查地址。",
    errConflict: "内容已在别处更新——已重新加载远端，请重试。",
    errTimeout: "实例响应超时（库较大或网络慢），请重试。",
    errOther: "实例返回了未预期的响应。",
    retry: "重试",
    invalidUrl: "请填写有效的 http(s) 地址。",
    exists: "该地址已在书签库中。",
    added: "已保存。",
    deleted: "已删除。",
    importDenied: "导入需要授权「读取和更改您的书签」权限。",
    importDone: "已导入 {n} 个新书签。",
    importNone: "没有需要导入的新书签。",
    moveDone: "已移动 {n} 条书签。",
    exported: "已导出 bookmarks.html。",
    syncPrefix: "已同步",
    neverSynced: "从未同步",
    offline: "未连接",
    saveWindow: "保存当前窗口",
    wsCount: "{n} 个工作区",
    wsEmpty: "还没有工作区。点「保存当前窗口」把打开的标签页存为可恢复的工作区。",
    wsNoPages: "当前窗口没有可保存的 http(s) 标签页。",
    wsNameTitle: "工作区名称",
    restoreAll: "全部恢复",
    restoreSelected: "恢复选中",
    wsSelectAll: "全选页面",
    wsSelectNone: "清除勾选",
    wsUpdateFromWindow: "用当前窗口替换",
    wsUpdateConfirm: "用当前窗口的 {m} 个标签页替换「{name}」的 {n} 个页面？",
    wsUpdated: "工作区已更新（{n} 页）。",
    wsRestored: "已在新窗口打开 {n} 个标签页。",
    wsReload: "刷新",
    wsSelectedCount: "已选 {n}",
    rename: "重命名",
    pinMark: "已固定",
    groupMark: "分组：{t}",
    ruleAdd: "新增规则",
    ruleDialogTitle: "分组规则",
    ruleDomainLabel: "域名（逗号分隔）",
    ruleUrlLabel: "URL 包含",
    ruleTitleLabel: "标题包含",
    ruleRegexLabel: "URL 正则",
    ruleNameLabel: "分组标题",
    ruleColorLabel: "颜色",
    ruleOrderLabel: "优先级",
    ruleCollapsedText: "分组折叠",
    rulesEmpty: "还没有规则。规则按域名 / URL / 标题 / 正则把当前窗口的标签页收进原生标签组。",
    rulesNone: "当前窗口没有可分组的标签页。",
    rulesApplied: "已创建 {n} 个分组。",
    ruleInvalidRegex: "正则表达式无效。",
    ruleNeedCriteria: "至少填写一个匹配条件。",
    groupCurrentWindow: "按规则分组当前窗口",
    fallbackText: "未命中的按域名分组",
    invalidName: "请填写名称。",
    snapLegend: "快照",
    snapCapture: "生成快照",
    snapUpdate: "更新快照",
    snapView: "查看",
    snapDownload: "下载",
    snapDelete: "删除",
    snapNone: "还没有快照。会把页面捕获为单文件 HTML 存到你的 WebDAV。",
    snapCapturing: "捕获中…",
    snapSaved: "快照已保存。",
    snapCaptureFail: "无法捕获该页面（受限页面或加载失败）。",
    snapRestricted: "该地址无法捕获（chrome://、扩展页或其他受限页面）。",
    snapHostDenied: "捕获需要读取该站点的权限。请在 Chrome 弹窗中允许后重试。",
    snapLoadFail: "页面打开失败或超时，未能捕获。",
    snapInjectFail: "无法向该页面注入捕获脚本（缺少站点权限或页面阻止注入）。",
    snapWriteFail: "页面已捕获，但写入 WebDAV 失败。",
    snapTooLarge: "快照超过 8 MB，未保存。",
    snapMissing: "服务器上的快照文件已缺失。",
    snapConfirmDelete: "确定从 WebDAV 删除这个快照？",
    snapDeleted: "快照已删除。",
    snapBadge: "快照",
    snapViewQuick: "查看快照",
    snapReplaceConfirm: "替换该书签已有的快照？",
    snapConflict: "快照索引已在别处更新——已重新加载，请重试。",
    navPinned: "置顶",
    pinAdd: "置顶",
    pinRemove: "取消置顶",
    batchPinDone: "已置顶 {n} 条。",
    batchUnpinDone: "已取消置顶 {n} 条。",
    batchUnpinConfirm: "取消置顶选中的 {n} 条书签？",
    emptyPinnedTitle: "还没有置顶书签",
    selAll: "全选",
    selNone: "取消全选",
    sortLabel: "排序",
    sortDefault: "默认排序",
    sortLatest: "最新添加",
    sortOldest: "最早添加",
    sortTitle: "标题 A–Z",
    sortDomain: "域名 A–Z",
    openBookmark: "打开",
    batchSelected: "已选 {n} 项",
    batchMove: "移动",
    batchTags: "标签",
    batchPin: "置顶",
    batchUnpin: "取消置顶",
    batchDelete: "删除",
    batchMoveTitle: "批量移动书签",
    batchMoveLabel: "目标分类",
    batchMoveHint: "选择现有分类或输入新路径（用 / 表示层级）；留空表示「未分类」。",
    batchMoveBtn: "移动",
    batchTagsTitle: "批量编辑选中书签的标签",
    batchTagsAdd: "添加标签（逗号分隔）",
    batchTagsRemove: "移除标签（逗号分隔）",
    batchDeleteConfirm: "确定删除选中的 {n} 个书签？",
    folderAdd: "新建文件夹",
    folderAddTitle: "新建文件夹",
    folderRename: "重命名文件夹",
    folderRenameTitle: "重命名文件夹",
    folderDelete: "删除文件夹",
    folderDeleteConfirm: "确定删除空文件夹「{p}」？",
    folderNameLabel: "文件夹路径",
    folderNameHint: "用 / 表示层级，如 Dev/Rust。",
    folderExists: "该文件夹已存在。",
    exportChromeLegend: "浏览器",
    exportChromeFolderLabel: "目标文件夹",
    exportChromeSkip: "优先跳过重复（同一 URL）",
    exportChromeClear: "先清空目标文件夹",
    exportChromeBtn: "写回浏览器书签",
    exportChromeClearConfirm: "将先从目标文件夹删除现有 {n} 项，确定继续？",
    exportChromeDone: "已写回 {n} 个书签到浏览器书签。",
    exportChromeDenied: "写回需要授权「读取和更改您的书签」权限。",
    exportChromeDeniedHint:
      "若未出现系统授权框：打开 chrome://extensions → Davflare → 详细信息，在「权限」中开启书签，然后重试。部分未打包的 Chromium 环境不会弹出可选权限对话框——请用 Google Chrome 或打包安装验证。",
    exportChromeConflictNote: "目标文件夹中同一 URL 的重叠会弹出冲突确认——绝不会静默覆盖。",
    chromeConflictTitle: "写回冲突",
    chromeConflictSummary: "目标中已有 {c} 个相同 URL · 将新建 {n} 个。",
    chromeConflictHint: "「跳过冲突」保留浏览器原项；「更新匹配」用书签库标题覆盖浏览器标题。",
    chromeConflictSkip: "跳过冲突",
    chromeConflictOverwrite: "更新匹配",
    chromeConflictCancel: "取消",
    chromeConflictLib: "书签库：{t}",
    chromeConflictBrowser: "浏览器：{t}",
    exportHhLegend: "HamHome 往返",
    exportHhHint:
      "把当前书签库合并写入 /HamHomeSync/（meta.json + categories.json）；HamHome 已有条目会保留。",
    exportHhBtn: "写回 HamHomeSync",
    exportedHamHome: "已写入 meta.json + categories.json 到 /HamHomeSync/。",
    presetPlaceholder: "筛选预设",
    presetSaveTitle: "把当前「标签+时间」筛选存为预设",
    presetDeleteTitle: "删除该预设",
    presetDialogTitle: "保存筛选预设",
    presetNameLabel: "名称",
    presetNeedTag: "请先选择标签、文件夹或「置顶」筛选，再保存为预设。",
    presetSaved: "预设已保存。",
    presetKindTag: "标签",
    presetKindFolder: "文件夹",
    presetKindPinned: "置顶",
    presetUnfiled: "未分类",
    presetDeleteConfirm: "确定删除预设「{p}」？",
    favoritesTitle: "收藏夹",
    favoritesEmpty: "在下方文件夹或标签上点 ★，即可固定到此处。",
    favAdd: "加入收藏夹",
    favRemove: "移出收藏夹",
    favKindFolder: "文件夹",
    favKindTag: "标签",
    favKindPinned: "置顶",
    storageLegend: "库占用",
    storageBookmarks: "书签（HTML + JSON）",
    storageWorkspaces: "工作区",
    storageTabRules: "Tab 分组规则",
    storageSnaps: "快照（索引 + HTML）",
    storageTotal: "合计（估计）",
    shortcutLegend: "键盘快捷键",
    shortcutSavePage: "快速收藏此页",
    shortcutEdgePanel: "页面内收藏面板",
    shortcutNone: "未设置",
    shortcutsHint: "随时在 chrome://extensions/shortcuts 修改。",
    storageNote:
      "体积来自你 WebDAV 书签目录（本库在 R2/网盘上的占用）。快照 HTML 按索引里记录的 size 汇总。",
    storageRefresh: "刷新体积",
    storageLoading: "正在统计…",
    storageNeedConfig: "请先保存实例设置，再统计占用。",
    storageDone: "占用已更新。",
    storageFailed: "部分库文件读取失败。",
    storagePath: "路径：{p}",
    permBookmarksTitle: "需要书签权限",
    permBookmarksBody:
      "导入或写回浏览器书签前，Davflare 需要 Chrome「读取和更改您的书签」权限。接下来应弹出系统授权框，请选择「允许」。若无弹窗（部分未打包 Chromium 常见），请到 chrome://extensions → Davflare → 详细信息 中手动开启书签权限后重试。",
    permBookmarksContinue: "继续授权",
    snapIndexMissing:
      "还没有快照索引（snapshots.json）。捕获页面时会在书签目录下自动创建。",
    snapWriteFailPath:
      "无法写入快照文件。请确认 WebDAV 已开启，且书签目录可写。",
    navTrash: "回收站",
    navDuplicates: "重复项",
    trashHint: "已删除的书签在回收站保留 30 天，到期自动清理。",
    trashRestore: "恢复",
    trashRestoreSel: "恢复所选",
    trashDeleteForever: "彻底删除",
    trashDeleteForeverConfirm: "彻底删除该书签？此操作不可撤销。",
    trashEmptyBtn: "清空回收站",
    trashEmptyConfirm: "彻底删除回收站中的全部 {n} 项？此操作不可撤销。",
    trashRestored: "已恢复 {n} 个书签。",
    trashEmptied: "回收站已清空。",
    trashPurged: "已自动清理 {n} 个过期条目。",
    trashDeletedAgo: "删除于 {w}",
    trashEmptyTitle: "回收站是空的",
    trashEmptyDesc: "删除的书签会先进入回收站，30 天内可随时恢复。",
    trashPermanentHint: "这里的删除不可恢复。",
    dupHint: "{g} 组书签共用同一 URL。",
    dupGroupTitle: "同一 URL 的 {n} 个副本",
    dupKeep: "保留所选，其余进回收站",
    dupKeepOldestAll: "全部保留最早",
    dupKeepDone: "已保留 1 条，{n} 条重复进入回收站。",
    dupKeepAllDone: "已在 {g} 组中各保留最早 1 条，{n} 条重复进入回收站。",
    dupEmptyTitle: "没有重复书签",
    dupEmptyDesc: "库中所有 URL 均唯一。",
  },
};

var ERROR_KEY = {
  disabled: "errDisabled",
  notConfigured: "errNotConfigured",
  unauthorized: "errUnauthorized",
  network: "errNetwork",
  timeout: "errTimeout",
  conflict: "errConflict",
};

var CACHE_KEY = "bookmarksCache";
var THEME_KEY = "davflare-theme";
var VIEW_KEY = "davflare-bookmarks-view";
var SORT_KEY = "davflare-bookmarks-sort";
var FOLDER_TREE_KEY = "davflare-folder-tree-expanded";
var WS_FILE = "workspaces.json";
var RULES_FILE = "tabGroups.json";

function readLocalPref(key, allowed, fallback) {
  try {
    var v = localStorage.getItem(key);
    return allowed.indexOf(v) !== -1 ? v : fallback;
  } catch (err) {
    return fallback;
  }
}

function writeLocalPref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    /* private mode: prefs just won't persist */
  }
}

var state = {
  model: Bookmarks.emptyModel(),
  etag: null,
  filter: { kind: "all", value: "" },
  query: "",
  since: "all",
  view: readLocalPref(VIEW_KEY, ["grid", "list"], "grid"),
  sort: readLocalPref(SORT_KEY, BookmarksView.SORT_KEYS, "default"),
  syncedAt: 0,
  bytes: 0,
  // Issue #63 multi-select: bookmark ids -> true; anchor for shift-range picks.
  sel: {},
  selAnchor: null,
};

// refresh()/persist() 进行中时暂缓应用外部缓存（#77）：外部写入先落
// chrome.storage，本页 PUT 用的是内存 etag/model，中途替换会导致条件失败
// 或吞掉本地变更；等 PUT/GET 收敛后由其自身 saveCache 触发下一次 onChanged。
var inflightSync = 0;

var appState = {
  view: "bookmarks",
  presets: [],
  favorites: [],
  workspaces: { version: 1, workspaces: [] },
  workspacesEtag: null,
  tabRules: { version: 1, fallbackDomain: true, rules: [] },
  rulesEtag: null,
  wsSelected: {},
  snapshots: { version: 1, snapshots: [] },
  snapshotsEtag: null,
  // 回收站勾选（trash id -> true）与重复项每组的保留选择（key -> id）。
  trashSel: {},
  dupKeep: {},
};

var editingBookmarkId = null;
var editingRuleId = null;
var editingWsId = null;
var tagDialogBookmark = null;
var pendingConfirm = null;
var pendingConfirmCancel = null;

var lang =
  (navigator.language || "en").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
var t = COPY[lang];

var PINYIN =
  typeof PinyinIndex !== "undefined" && PinyinIndex && PinyinIndex.defaultTools
    ? PinyinIndex.defaultTools
    : null;

function $(id) {
  return document.getElementById(id);
}

function fmt(template, values) {
  return String(template).replace(/\{(\w+)\}/g, function (_, key) {
    return values && values[key] !== undefined ? values[key] : "";
  });
}

function folderLabel(name) {
  return name === "" ? t.unfiled : name;
}

function errorText(kind) {
  var key = ERROR_KEY[kind];
  if (key) return t[key];
  if (kind && String(kind).indexOf("http") === 0) {
    var code = String(kind).slice(4);
    return lang === "zh"
      ? "实例返回了未预期的响应（HTTP " + code + "）。"
      : "Unexpected response from the instance (HTTP " + code + ").";
  }
  return t.errOther;
}

/* ---------- theme ---------- */

function initTheme() {
  var saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch (err) {
    saved = null;
  }
  var theme = saved === "light" || saved === "dark" ? saved : null;
  if (!theme) {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("themeToggle").textContent = theme === "dark" ? "☀" : "☾";
}

function toggleTheme(event) {
  var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // ham_home 式圆形扩散换肤：View Transitions 可用且未降级时，从点击处
  // 扩散新主题；不支持/ reduced-motion 时静默瞬切。
  var doc = document;
  if (!reduce && typeof doc.startViewTransition === "function") {
    var x = 0;
    var y = 0;
    if (event && event.clientX != null) {
      x = event.clientX;
      y = event.clientY;
    } else {
      var btn = $("themeToggle");
      if (btn) {
        var rect = btn.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      }
    }
    var radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );
    doc.startViewTransition(function () {
      applyTheme(next);
    });
    doc.documentElement.animate(
      { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + radius + "px at " + x + "px " + y + "px)"] },
      {
        duration: 360,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      }
    );
  } else {
    applyTheme(next);
  }
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (err) {
    /* private mode: theme just won't persist */
  }
}

/* ---------- data ---------- */

async function loadConfig() {
  var sync = await chrome.storage.sync.get(["instanceUrl", "bookmarkPath"]);
  var local = await chrome.storage.local.get(["davUsername", "davPassword"]);
  var merged = mergeSettings(sync);
  return {
    instanceUrl: merged.instanceUrl,
    basePath: merged.bookmarkPath,
    username: typeof local.davUsername === "string" ? local.davUsername : "",
    password: typeof local.davPassword === "string" ? local.davPassword : "",
  };
}

function makeClient() {
  return loadConfig().then(function (cfg) {
    return { cfg: cfg, client: DavflareDav.createDavClient(cfg) };
  });
}

function saveCache() {
  var payload = {};
  payload[CACHE_KEY] = {
    model: state.model,
    etag: state.etag || null,
    syncedAt: state.syncedAt,
    bytes: state.bytes,
  };
  chrome.storage.local.set(payload);
}

function renderFromCache() {
  chrome.storage.local.get([CACHE_KEY], function (stored) {
    var cache = stored && stored[CACHE_KEY];
    if (cache && cache.model) {
      state.model = Bookmarks.normalizeModel(cache.model);
      state.etag = cache.etag || null;
      state.syncedAt = cache.syncedAt || 0;
      state.bytes = cache.bytes || 0;
      renderAll();
    }
  });
}

/* ---------- live updates from other contexts (#77) ----------
 * popup / 右键快藏成功后会把最新 model+etag 写进 bookmarksCache（storage
 * 是两端共享的唯一通道）。库页面若已打开，靠 onChanged 把新收藏即时并入
 * 列表与搜索结果，不再需要整页刷新；写入失败（quota）时由工具栏的
 * 刷新按钮兜底。 */
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== "local") return;
  var change = changes[CACHE_KEY];
  if (!change || !change.newValue || !change.newValue.model) return;
  applyExternalCache(change.newValue);
});

function applyExternalCache(cache) {
  // 自己刚写回的缓存（refresh/persist 的 saveCache 回声）：syncedAt 相同，
  // 内存已是该内容，重复渲染只会闪烁。
  if (cache.syncedAt && cache.syncedAt === state.syncedAt) return;
  // 本页有 PUT/GET 在途：等它收敛（成功写回或 412→refresh），避免中途
  // 换掉内存 model/etag 导致写入丢失或条件请求失效。
  if (inflightSync > 0) return;
  state.model = Bookmarks.normalizeModel(cache.model);
  state.etag = cache.etag || null;
  state.syncedAt = cache.syncedAt || 0;
  state.bytes = cache.bytes || 0;
  renderAll();
}

function computeBytes() {
  return Bookmarks.serializeHtml(state.model).length + Bookmarks.modelToJsonText(state.model).length;
}

function showLibraryError(kind) {
  // Auth/config problems → settings; everything else → retry (#69).
  if (
    kind === "unauthorized" ||
    kind === "notConfigured" ||
    kind === "disabled" ||
    kind === "network"
  ) {
    showBanner(errorText(kind), t.openSettings, openSettings);
  } else {
    showBanner(errorText(kind), t.retry, function () {
      refresh();
    });
  }
}

async function refresh() {
  hideBanner();
  showSkeleton();
  inflightSync++;
  try {
    var made = await makeClient();
    if (!made.cfg.instanceUrl) {
      showBanner(t.needConfig, t.openSettings, openSettings);
      renderAll();
      return;
    }
    var getOpts = state.etag ? { ifNoneMatch: state.etag } : {};
    var res = await made.client.getBookmarks(getOpts);
    if (!res.ok) {
      showLibraryError(res.kind);
      renderAll();
      return;
    }
    if (res.notModified) {
      hideBanner();
      renderAll();
      return;
    }
    var model = Bookmarks.parseRemoteLibrary(res);
    // Trash housekeeping on every load: hard-remove entries older than 30d.
    var purged = Bookmarks.purgeExpiredTrash(model, Date.now());
    state.model = purged.model;
    state.etag = res.etag;
    state.bytes = computeBytes();
    state.syncedAt = Date.now();
    saveCache();
    hideBanner();
    renderAll();
    if (purged.purged) {
      flashStatus(fmt(t.trashPurged, { n: purged.purged }));
      persist(); // keep the remote in sync with the purge; fire-and-forget
    }
    // Phase 2: keep snapshot badges visible without opening the editor.
    loadSnapshots().then(function () {
      renderItems();
    });
  } catch (err) {
    showLibraryError("network");
    renderAll();
  } finally {
    inflightSync--;
  }
}

async function persist() {
  inflightSync++;
  try {
    var made = await makeClient();
    if (!made.cfg.instanceUrl) {
      showBanner(t.needConfig, t.openSettings, openSettings);
      return false;
    }
    var put = await made.client.putBookmarks({
      html: Bookmarks.serializeHtml(state.model),
      json: Bookmarks.modelToJsonText(state.model),
      etag: state.etag,
    });
    if (put.ok) {
      if (put.etag) state.etag = put.etag;
      state.bytes = computeBytes();
      state.syncedAt = Date.now();
      saveCache();
      hideBanner();
      renderAll();
      return true;
    }
    if (put.kind === "conflict") {
      showBanner(t.errConflict);
      await refresh();
      return false;
    }
    showBanner(errorText(put.kind), t.openSettings, openSettings);
    return false;
  } finally {
    inflightSync--;
  }
}

/* ---------- banners ---------- */

function showIn(bannerId, message, actionText, actionFn) {
  var banner = $(bannerId);
  banner.textContent = message || "";
  if (actionText && actionFn) {
    var btn = document.createElement("button");
    btn.className = "ghost";
    btn.type = "button";
    btn.textContent = actionText;
    btn.addEventListener("click", actionFn);
    banner.appendChild(document.createTextNode(" "));
    banner.appendChild(btn);
  }
  banner.classList.remove("hidden");
}

function showBanner(message, actionText, actionFn) {
  showIn("banner", message, actionText, actionFn);
}

function showWsBanner(message, actionText, actionFn) {
  showIn("bannerWs", message, actionText, actionFn);
}

function showRulesBanner(message, actionText, actionFn) {
  showIn("bannerRules", message, actionText, actionFn);
}

function hideBanner() {
  $("banner").classList.add("hidden");
}

function openSettings() {
  switchView("settings");
}

/* ---------- view switching ---------- */

var VALID_VIEWS = ["bookmarks", "trash", "duplicates", "drive", "workspaces", "tabRules", "settings"];
// Views that share the bookmarks sidebar (filters / tree / tags stay visible).
var LIBRARY_VIEWS = ["bookmarks", "trash", "duplicates"];

function switchView(view) {
  if (VALID_VIEWS.indexOf(view) === -1) view = "bookmarks";
  appState.view = view;
  var library = LIBRARY_VIEWS.indexOf(view) !== -1;
  $("viewBookmarks").classList.toggle("hidden", view !== "bookmarks");
  $("viewTrash").classList.toggle("hidden", view !== "trash");
  $("viewDuplicates").classList.toggle("hidden", view !== "duplicates");
  $("viewDrive").classList.toggle("hidden", view !== "drive");
  $("viewWorkspaces").classList.toggle("hidden", view !== "workspaces");
  $("viewTabRules").classList.toggle("hidden", view !== "tabRules");
  $("viewSettings").classList.toggle("hidden", view !== "settings");
  $("switchBookmarks").classList.toggle("active", library);
  $("switchDrive").classList.toggle("active", view === "drive");
  $("switchWorkspaces").classList.toggle("active", view === "workspaces");
  $("switchTabRules").classList.toggle("active", view === "tabRules");
  $("switchSettings").classList.toggle("active", view === "settings");
  $("bookmarksNav").classList.toggle("hidden", !library);
  $("navTrash").classList.toggle("active", view === "trash");
  $("navDuplicates").classList.toggle("active", view === "duplicates");
  setCurrentAttr($("navTrash"), view === "trash");
  setCurrentAttr($("navDuplicates"), view === "duplicates");
  if (view === "trash") loadTrash();
  if (view === "duplicates") loadDuplicates();
  if (view === "bookmarks") renderItems(); // masonry 列数需按可见宽度重排
  if (view === "drive") loadDriveView();
  if (view === "workspaces") loadWorkspaces();
  if (view === "tabRules") loadTabRules();
  if (view === "settings") {
    loadSettings();
    refreshStoragePanel();
  }
}

/* ---------- drive view (embedded React app) ---------- */

var driveMountedUrl = null;

async function loadDriveView() {
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    $("driveUrl").textContent = "";
    driveMountedUrl = null;
    showIn("bannerDrive", t.needConfig, t.openSettings, openSettings);
    return;
  }
  $("driveUrl").textContent = made.cfg.instanceUrl;
  if (!window.DavflareDrive) {
    // drive/drive.js 未构建(load unpacked 直接指向源码目录时)
    showIn("bannerDrive", t.driveNeedsBuild);
    return;
  }
  $("bannerDrive").classList.add("hidden");
  if (driveMountedUrl !== made.cfg.instanceUrl) {
    driveMountedUrl = made.cfg.instanceUrl;
    window.DavflareDrive.mount($("driveRoot"), made.cfg.instanceUrl);
  }
}

/* ---------- settings view (in-shell options) ---------- */

var PROBE_KEY = {
  disabled: "errDisabled",
  notConfigured: "errNotConfigured",
  unauthorized: "errUnauthorized",
  network: "errNetwork",
};

function setSettingsStatus(message, kind) {
  var el = $("settingsStatus");
  el.textContent = message || "";
  el.className = "status" + (kind ? " " + kind : "");
}

function setProbeStatus(message, kind) {
  var el = $("probeStatus");
  el.textContent = message || "";
  el.className = "status" + (kind ? " " + kind : "");
}

async function loadSettings() {
  var sync = await chrome.storage.sync.get(["instanceUrl", "toolbarMode", "bookmarkPath"]);
  var merged = mergeSettings(sync);
  $("instanceUrl").value = merged.instanceUrl;
  $("bookmarkPath").value = merged.bookmarkPath;
  (merged.toolbarMode === "bookmarks" ? $("modeBookmarks") : $("modeDrive")).checked = true;
  var local = await chrome.storage.local.get(["davUsername", "davPassword"]);
  $("davUser").value = typeof local.davUsername === "string" ? local.davUsername : "";
  $("davPass").value = typeof local.davPassword === "string" ? local.davPassword : "";
}

async function ensureOriginPermission(instanceUrl) {
  if (!instanceUrl) return { granted: true, skipped: true };
  var origin;
  try {
    origin = new URL(instanceUrl).origin + "/*";
  } catch (err) {
    return { granted: true, skipped: true };
  }
  try {
    if (await chrome.permissions.contains({ origins: [origin] })) {
      return { granted: true };
    }
    var granted = await chrome.permissions.request({ origins: [origin] });
    return { granted: Boolean(granted) };
  } catch (err) {
    return { granted: false };
  }
}

async function saveSettings(event) {
  event.preventDefault();
  var raw = $("instanceUrl").value;
  var normalized = normalizeInstanceUrl(raw);
  if (raw.trim() && !normalized) {
    setSettingsStatus(t.invalidUrl, "err");
    $("instanceUrl").focus();
    return;
  }
  var bookmarkPath = sanitizeBookmarkPath($("bookmarkPath").value);
  var toolbarMode = $("modeBookmarks").checked ? "bookmarks" : "drive";
  await chrome.storage.sync.set({
    instanceUrl: normalized,
    toolbarMode: toolbarMode,
    bookmarkPath: bookmarkPath,
  });
  await chrome.storage.local.set({
    davUsername: $("davUser").value.trim(),
    davPassword: $("davPass").value,
  });
  $("instanceUrl").value = normalized;
  $("bookmarkPath").value = bookmarkPath;
  var perm = await ensureOriginPermission(normalized);
  if (!normalized) {
    setSettingsStatus(t.settingsCleared, "ok");
    return;
  }
  if (!perm.granted) {
    setSettingsStatus(t.savedNoGrant, "err");
    return;
  }
  setSettingsStatus(t.settingsSaved, "ok");
  $("bannerSettings").classList.add("hidden");
  $("setupHint").textContent = "";
  // 配置完成（HamHome 式：先配置后使用），进入插件主页默认视图
  switchView(toolbarMode === "bookmarks" ? "bookmarks" : "drive");
  refresh();
}

async function testConnection() {
  var url = normalizeInstanceUrl($("instanceUrl").value);
  if (!url) {
    setSettingsStatus(t.invalidUrl, "err");
    $("instanceUrl").focus();
    return;
  }
  setProbeStatus(t.testing);
  var client = DavflareDav.createDavClient({
    instanceUrl: url,
    username: $("davUser").value.trim(),
    password: $("davPass").value,
  });
  var res = await client.probe();
  if (res.ok) {
    setProbeStatus(t.probeOk, "ok");
    return;
  }
  var key = PROBE_KEY[res.kind];
  setProbeStatus(key ? t[key] : t.probeOther, "err");
}

/* ---------- bookmarks render ---------- */

function renderAll() {
  renderNav();
  renderFolderSelect();
  renderItems();
  renderSyncInfo();
  // Keep preset dropdown + ✕ in sync whenever filters re-render (#84).
  renderPresetSelect();
  renderActiveLibraryPanel();
}

/**
 * #132: the trash and duplicates panels are derived from state.model too.
 * Whenever the model re-renders (delete, undo, restore, remote refresh,
 * live storage update) the open panel must follow, or it shows stale
 * groups/rows until the user switches away and back.
 */
function renderActiveLibraryPanel() {
  if (appState.view === "trash") loadTrash();
  else if (appState.view === "duplicates") loadDuplicates();
}

/** aria-current="true" mirrors the visual .active state for assistive tech. */
function setCurrentAttr(el, active) {
  if (!el) return;
  if (active) el.setAttribute("aria-current", "true");
  else el.removeAttribute("aria-current");
}

function navButton(label, count, active, onClick) {
  var btn = document.createElement("button");
  btn.className = "navItem" + (active ? " active" : "");
  btn.type = "button";
  // Active state is currently only visual; expose it to AT as well.
  if (active) btn.setAttribute("aria-current", "true");
  var span = document.createElement("span");
  span.textContent = label;
  btn.appendChild(span);
  // Favorites pass null/undefined — omit badge so UI never shows the literal "null".
  if (count != null) {
    var badge = document.createElement("span");
    badge.className = "count";
    badge.textContent = String(count);
    btn.appendChild(badge);
  }
  btn.addEventListener("click", onClick);
  return btn;
}

/** Library rows minus the trash — every nav count and filter works on these. */
function liveBookmarks() {
  var out = [];
  for (var i = 0; i < state.model.bookmarks.length; i++) {
    if (!state.model.bookmarks[i].deleted) out.push(state.model.bookmarks[i]);
  }
  return out;
}

function deletedBookmarks() {
  var out = [];
  for (var i = 0; i < state.model.bookmarks.length; i++) {
    if (state.model.bookmarks[i].deleted) out.push(state.model.bookmarks[i]);
  }
  return out;
}

/** Apply a sidebar filter; trash/duplicates views jump back to bookmarks. */
function applyLibraryFilter(filter) {
  state.filter = filter;
  if (appState.view !== "bookmarks") switchView("bookmarks");
  renderAll();
}

function renderNav() {
  var all = liveBookmarks().length;
  $("navAllCount").textContent = String(all);
  $("navAll").classList.toggle("active", state.filter.kind === "all");
  setCurrentAttr($("navAll"), state.filter.kind === "all");

  var pinnedCount = 0;
  for (var p = 0; p < state.model.bookmarks.length; p++) {
    if (state.model.bookmarks[p].pinned && !state.model.bookmarks[p].deleted) {
      pinnedCount += 1;
    }
  }
  $("navPinnedCount").textContent = String(pinnedCount);
  $("navPinned").classList.toggle("active", state.filter.kind === "pinned");
  setCurrentAttr($("navPinned"), state.filter.kind === "pinned");

  var trashCount = 0;
  for (var d = 0; d < state.model.bookmarks.length; d++) {
    if (state.model.bookmarks[d].deleted) trashCount += 1;
  }
  $("navTrashCount").textContent = String(trashCount);
  var dupCount = Bookmarks.duplicateGroups(state.model).length;
  $("navDuplicatesCount").textContent = String(dupCount);
  ensurePinnedFavoriteStar();
  renderFavoritesNav();

  renderFolderTreeNav();

  var tagNav = $("tagNav");
  tagNav.textContent = "";
  var tags = BookmarksView.tagList(state.model);
  if (!tags.length) {
    tagNav.classList.remove("tagCloud");
    tagNav.appendChild(emptyHint());
  } else {
    // HamHome 式标签云：频次排序 + 三档字号，点击行为与列表形态一致。
    tagNav.classList.add("tagCloud");
    var tiers = BookmarksView.tagTiers(tags);
    for (var j = 0; j < tags.length; j++) {
      (function (entry) {
        var active = state.filter.kind === "tag" && state.filter.value === entry.name;
        var wrap = document.createElement("span");
        wrap.className = "tagCloudItem" + (active ? " active" : "");
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "tagChip tier" + tiers[entry.name];
        chip.textContent = entry.name;
        chip.title = entry.name + " · " + entry.count;
        chip.setAttribute("aria-pressed", String(active));
        chip.addEventListener("click", function () {
          applyLibraryFilter({ kind: "tag", value: entry.name });
        });
        wrap.appendChild(chip);
        wrap.appendChild(makeFavoriteStar("tag", entry.name));
        tagNav.appendChild(wrap);
      })(tags[j]);
    }
  }
}

/**
 * HamHome 式分类树：未分类置顶，子文件夹按 / 层级缩进展开。父节点点击
 * 用前缀筛选（含子文件夹），叶子精确；展开状态存 localStorage。
 * 每行带 hover ⋯ 菜单（重命名；删除 — 内容移入未分类，可撤销）。
 * 徽标：父节点用递归 total，叶子/未分类用 direct count；删除确认用
 * folderTreeCount 递归计数（#126），不信任徽标。未分类 ("") 无菜单。
 */
function readExpandedFolders() {
  try {
    var parsed = JSON.parse(localStorage.getItem(FOLDER_TREE_KEY) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch (err) {
    /* corrupt map falls back to defaults */
  }
  return {};
}

function writeExpandedFolders(map) {
  try {
    localStorage.setItem(FOLDER_TREE_KEY, JSON.stringify(map));
  } catch (err) {
    /* private mode: expansion just won't persist */
  }
}

function folderIsExpanded(node, depth, map) {
  if (!node.children.length) return false;
  if (Object.prototype.hasOwnProperty.call(map, node.path)) return !!map[node.path];
  return depth === 0; // top-level folders start expanded, deeper ones collapsed
}

function renderFolderTreeNav() {
  var folderNav = $("folderNav");
  folderNav.textContent = "";
  var tree = BookmarksView.folderTree(state.model);
  var expanded = readExpandedFolders();
  // The tree root is the unfiled bucket (path "") — render it as the first row.
  folderNav.appendChild(
    folderTreeItem({ path: "", label: "", count: tree.count, total: tree.count, children: [] }, 0, expanded)
  );
  for (var i = 0; i < tree.children.length; i++) {
    (function (child) {
      appendFolderTreeLevel(folderNav, child, 0, expanded);
    })(tree.children[i]);
  }
  if (!tree.children.length && !tree.count) folderNav.appendChild(emptyHint());
}

function appendFolderTreeLevel(container, node, depth, expanded) {
  container.appendChild(folderTreeItem(node, depth, expanded));
  if (!folderIsExpanded(node, depth, expanded)) return;
  for (var i = 0; i < node.children.length; i++) {
    (function (child) {
      appendFolderTreeLevel(container, child, depth + 1, expanded);
    })(node.children[i]);
  }
}

/** One tree row: chevron (parents) + filter button + ★ + ⋯ menu, drag target. */
function folderTreeItem(node, depth, expanded) {
  var wrap = document.createElement("div");
  wrap.className = "navItemWrap navTreeItem";
  wrap.dataset.depth = String(depth);
  wireFolderDropTarget(wrap, node.path);
  if (depth > 0) wrap.style.marginLeft = depth * 14 + "px";

  var active = state.filter.kind === "folder" && state.filter.value === node.path;
  var btn = document.createElement("button");
  btn.className = "navItem" + (active ? " active" : "");
  btn.type = "button";
  if (active) btn.setAttribute("aria-current", "true");

  if (node.children.length) {
    var isOpen = folderIsExpanded(node, depth, expanded);
    var chev = document.createElement("span");
    chev.className = "navChevron" + (isOpen ? " open" : "");
    chev.setAttribute("aria-hidden", "true");
    chev.textContent = "▸";
    btn.appendChild(chev);
  }
  var label = document.createElement("span");
  label.className = "navLabel";
  label.textContent = folderLabel(node.path);
  btn.appendChild(label);
  var badge = document.createElement("span");
  badge.className = "count";
  // Parents show the recursive total (HamHome 式)，叶子/未分类与总数一致。
  badge.textContent = String(node.children.length ? node.total : node.count);
  btn.appendChild(badge);
  btn.addEventListener("click", function () {
    applyLibraryFilter({
      kind: "folder",
      value: node.path,
      prefix: node.children.length > 0,
    });
  });
  wrap.appendChild(btn);

  // Chevron toggles expansion without touching the filter (parents only).
  if (node.children.length) {
    chev.addEventListener("click", function (event) {
      event.stopPropagation();
      var map = readExpandedFolders();
      map[node.path] = !folderIsExpanded(node, depth, map);
      writeExpandedFolders(map);
      renderNav();
    });
  }

  wrap.classList.add("hasStar");
  wrap.appendChild(makeFavoriteStar("folder", node.path));
  if (node.path !== "") {
    var more = document.createElement("button");
    more.className = "navFolderMore menuToggle";
    more.type = "button";
    more.setAttribute("aria-haspopup", "true");
    more.setAttribute("aria-expanded", "false");
    more.setAttribute("aria-label", t.moreLabel);
    more.textContent = "⋯";
    var menu = document.createElement("div");
    menu.className = "popMenu";
    menu.appendChild(
      iconButton("menuItem", t.folderRename, function () {
        closePopMenus();
        openFolderDialog("rename", node.path);
      })
    );
    // Delete works for non-empty folders too: contained bookmarks (direct
    // and in subfolders) move to Unfiled via deleteFolderTree.
    menu.appendChild(
      iconButton("menuItem", t.folderDelete, function () {
        closePopMenus();
        confirmThen(folderDeleteMessage(state.model, node.path), function () {
          deleteFolderWithUndo(node.path);
        });
      })
    );
    wrap.appendChild(more);
    wrap.appendChild(menu);
  }
  return wrap;
}

/**
 * Issue #126: the delete confirm must describe what deleteFolderTree will
 * really do. entry.count (sidebar) is direct-only, so count recursively —
 * a folder whose bookmarks all live in subfolders is *not* empty.
 */
function folderDeleteMessage(model, name) {
  var total = Bookmarks.folderTreeCount(model, name);
  if (total > 0) return fmt(t.folderDeleteConfirmWithCount, { p: name, n: total });
  if (Bookmarks.hasSubfolders(model, name)) return fmt(t.folderDeleteConfirmEmptyTree, { p: name });
  return fmt(t.folderDeleteConfirm, { p: name });
}

/**
 * Delete a folder tree with the same 6 s undo toast as bookmark deletes.
 * The toast reports the recursive moved count; Undo puts every moved
 * bookmark back into its original (sub)folder and re-declares the removed
 * folders (restoreFolderTree).
 */
function deleteFolderWithUndo(name) {
  cancelPendingUndo();
  var res = Bookmarks.deleteFolderTree(state.model, name);
  state.model = res.model;
  if (
    state.filter.kind === "folder" &&
    (state.filter.value === name || String(state.filter.value).indexOf(name + "/") === 0)
  ) {
    state.filter = { kind: "all", value: "" };
  }
  renderAll();
  showUndoToast({
    message: res.moved ? fmt(t.folderDeletedMoved, { n: res.moved }) : t.folderDeleted,
    restore: function () {
      state.model = Bookmarks.restoreFolderTree(state.model, res.undo).model;
      return t.folderRestored;
    },
  });
  return persist();
}

function emptyHint() {
  var p = document.createElement("p");
  p.className = "navEmpty";
  p.textContent = "—";
  return p;
}

/* ---------- structured empty states（书签库/工作区/Tab 分组共用） ---------- */

// 静态插画常量（无用户输入），颜色走主题变量；round 4 起分场景绘制
var EMPTY_ART_LIBRARY =
  '<svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<rect x="14" y="10" width="68" height="76" rx="10" fill="var(--orange-soft)"/>' +
  '<path d="M34 22h28v52l-14-10-14 10V22z" fill="var(--orange)" opacity="0.85"/>' +
  '<circle cx="64" cy="64" r="15" fill="var(--paper)" stroke="var(--orange)" stroke-width="3"/>' +
  '<path d="M64 57v14M57 64h14" stroke="var(--orange)" stroke-width="3" stroke-linecap="round"/>' +
  "</svg>";

var EMPTY_ART_SEARCH =
  '<svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<rect x="14" y="10" width="68" height="76" rx="10" fill="var(--orange-soft)"/>' +
  '<path d="M26 30h44M26 42h30M26 54h20" stroke="var(--orange)" stroke-width="4" stroke-linecap="round" opacity="0.45"/>' +
  '<circle cx="58" cy="56" r="14" fill="var(--paper)" stroke="var(--orange)" stroke-width="4"/>' +
  '<path d="M68 66l10 10" stroke="var(--orange)" stroke-width="4" stroke-linecap="round"/>' +
  "</svg>";

var EMPTY_ART_TRASH =
  '<svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<circle cx="48" cy="50" r="34" fill="var(--orange-soft)"/>' +
  '<path d="M30 34h36" stroke="var(--orange)" stroke-width="4" stroke-linecap="round"/>' +
  '<path d="M40 34v-4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4" stroke="var(--orange)" stroke-width="4" stroke-linecap="round"/>' +
  '<path d="M34 34h28l-3 34a6 6 0 0 1-6 6h-10a6 6 0 0 1-6-6l-3-34z" fill="var(--paper)" stroke="var(--orange)" stroke-width="4" stroke-linejoin="round"/>' +
  '<path d="M43 44v20M53 44v20" stroke="var(--orange)" stroke-width="4" stroke-linecap="round" opacity="0.7"/>' +
  "</svg>";

var EMPTY_ART_DUPLICATES =
  '<svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<rect x="16" y="14" width="44" height="58" rx="8" fill="var(--orange-soft)" stroke="var(--orange)" stroke-width="3"/>' +
  '<rect x="36" y="26" width="44" height="58" rx="8" fill="var(--paper)" stroke="var(--orange)" stroke-width="3"/>' +
  '<path d="M46 44h24M46 56h24M46 68h14" stroke="var(--orange)" stroke-width="4" stroke-linecap="round" opacity="0.75"/>' +
  "</svg>";

var EMPTY_ARTS = {
  library: EMPTY_ART_LIBRARY,
  search: EMPTY_ART_SEARCH,
  trash: EMPTY_ART_TRASH,
  duplicates: EMPTY_ART_DUPLICATES,
};

function emptyArt(kind) {
  return EMPTY_ARTS[kind] || EMPTY_ARTS.library;
}

function renderEmptyState(container, opts) {
  container.textContent = "";
  var art = document.createElement("div");
  art.innerHTML = emptyArt(opts.art);
  container.appendChild(art);
  var title = document.createElement("h3");
  title.textContent = opts.title;
  container.appendChild(title);
  if (opts.desc) {
    var p = document.createElement("p");
    p.textContent = opts.desc;
    container.appendChild(p);
  }
  if (opts.actions && opts.actions.length) {
    var row = document.createElement("div");
    row.className = "emptyActions";
    for (var i = 0; i < opts.actions.length; i++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = opts.actions[i].kind;
      btn.textContent = opts.actions[i].label;
      btn.addEventListener("click", opts.actions[i].onClick);
      row.appendChild(btn);
    }
    container.appendChild(row);
  }
  container.classList.remove("hidden");
}

function resetFilters() {
  state.query = "";
  $("search").value = "";
  state.since = "all";
  $("sinceSelect").value = "all";
  setFilterAll();
}

function renderFolderSelect() {
  var select = $("folderSelect");
  select.textContent = "";
  var allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = t.allFolders;
  select.appendChild(allOption);

  var folders = BookmarksView.folderList(state.model);
  for (var i = 0; i < folders.length; i++) {
    var option = document.createElement("option");
    option.value = folders[i].name;
    option.textContent = folderLabel(folders[i].name) + " (" + folders[i].count + ")";
    select.appendChild(option);
  }
  select.value = state.filter.kind === "folder" ? state.filter.value : "all";
}

function sinceMs(kind, now) {
  var d = new Date(now);
  switch (kind) {
    case "today":
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    case "week":
      return now - 7 * 86400000;
    case "month":
      return now - 30 * 86400000;
    case "year":
      return now - 365 * 86400000;
    default:
      return 0;
  }
}

function faviconNode(item) {
  var wrap = document.createElement("span");
  wrap.className = "favicon";
  var letter = document.createElement("span");
  letter.className = "letter";
  letter.textContent = BookmarksView.fallbackLetter(item);
  wrap.appendChild(letter);
  var img = document.createElement("img");
  img.alt = "";
  img.width = 20;
  img.height = 20;
  img.loading = "lazy";
  img.src =
    chrome.runtime.getURL("_favicon/?pageUrl=") + encodeURIComponent(item.url) + "&size=64";
  img.addEventListener("load", function () {
    wrap.classList.add("hasIcon");
  });
  img.addEventListener("error", function () {
    img.remove();
  });
  wrap.appendChild(img);
  return wrap;
}

function iconButton(label, text, onClick) {
  var btn = document.createElement("button");
  btn.className = label;
  btn.type = "button";
  btn.title = text;
  btn.setAttribute("aria-label", text);
  btn.textContent = text;
  btn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return btn;
}

/* ---------- pop menus（侧栏「更多」与卡片 ⋯ 共用） ---------- */

function closePopMenus() {
  var open = document.querySelectorAll(".popMenu.open");
  for (var i = 0; i < open.length; i++) {
    open[i].classList.remove("open");
    var toggle = open[i].parentElement.querySelector(".menuToggle");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }
}

function wirePopMenus() {
  document.addEventListener("click", function (event) {
    var target = event.target instanceof Element ? event.target : null;
    if (!target || !target.closest) return;
    var toggle = target.closest(".menuToggle");
    if (toggle) {
      var menu = toggle.parentElement.querySelector(".popMenu");
      if (!menu) return;
      var wasOpen = menu.classList.contains("open");
      closePopMenus();
      if (!wasOpen) {
        menu.classList.add("open");
        toggle.setAttribute("aria-expanded", "true");
        // Keyboard activation (detail 0) lands focus on the first item;
        // mouse clicks keep the current focus. Esc hands focus back.
        var first = menu.querySelector("button");
        if (first && event.detail === 0) first.focus();
      }
      return;
    }
    if (!target.closest(".popMenu")) closePopMenus();
  });
}

/* ---------- selection (#63) ---------- */

function filteredItemsOrdered() {
  var folderFilter =
    state.filter.kind === "folder" ? state.filter.value : null;
  var filter = {
    query: state.query,
    // Sidebar tree parents pass prefix: true — include descendant folders.
    folder: folderFilter != null && !state.filter.prefix ? folderFilter : null,
    folderPrefix: folderFilter != null && state.filter.prefix ? folderFilter : null,
    tag: state.filter.kind === "tag" ? state.filter.value : null,
    pinned: state.filter.kind === "pinned" ? true : null,
    since: sinceMs(state.since, Date.now()),
  };
  // sortItems keeps pinned-first semantics; "default" preserves the
  // historical insertion order.
  return BookmarksView.sortItems(
    BookmarksView.filterBookmarks(state.model, filter, PINYIN),
    state.sort,
    lang === "zh" ? "zh" : "en"
  );
}

function selectedExistingIds() {
  var ids = [];
  for (var i = 0; i < state.model.bookmarks.length; i++) {
    if (state.sel[state.model.bookmarks[i].id]) ids.push(state.model.bookmarks[i].id);
  }
  return ids;
}

function clearSelection() {
  state.sel = {};
  state.selAnchor = null;
}

/* ---------- drag to folder (HamHome 式) ---------- */

// In-flight drag payload (ids being dragged). dataTransfer is set for
// semantics, but same-document drop targets read this authoritative copy.
var dragMoveIds = null;

function wireBookmarkDrag(node, item) {
  node.draggable = true;
  node.addEventListener("dragstart", function (event) {
    var ordered = filteredItemsOrdered().map(function (it) {
      return it.id;
    });
    dragMoveIds = BookmarksView.dragSelectionIds(item, state.sel, ordered);
    try {
      event.dataTransfer.setData("text/plain", dragMoveIds.join("\n"));
      event.dataTransfer.effectAllowed = "move";
    } catch (err) {
      /* older engines */
    }
    node.classList.add("dragging");
  });
  node.addEventListener("dragend", function () {
    dragMoveIds = null;
    node.classList.remove("dragging");
  });
}

/** Wire a sidebar folder entry as a move-to-folder drop target. */
function wireFolderDropTarget(wrap, folder) {
  wrap.addEventListener("dragover", function (event) {
    if (!dragMoveIds || !dragMoveIds.length) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    wrap.classList.add("dragOver");
  });
  wrap.addEventListener("dragleave", function (event) {
    // Moving onto the row's own button/star fires dragleave on the wrap;
    // only clear the highlight when the pointer really leaves it.
    if (event.relatedTarget && wrap.contains(event.relatedTarget)) return;
    wrap.classList.remove("dragOver");
  });
  wrap.addEventListener("drop", function (event) {
    event.preventDefault();
    wrap.classList.remove("dragOver");
    var ids = dragMoveIds;
    dragMoveIds = null;
    if (!ids || !ids.length) return;
    moveBookmarksToFolder(ids, folder);
  });
}

async function moveBookmarksToFolder(ids, folder) {
  // Dropping onto the folder the bookmarks already live in is a no-op:
  // skip the PUT (and the misleading "Moved" toast).
  var target = String(folder || "");
  var needsMove = state.model.bookmarks.some(function (it) {
    return ids.indexOf(it.id) !== -1 && String(it.folder || "") !== target;
  });
  if (!needsMove) return;
  state.model = Bookmarks.moveBookmarks(state.model, ids, folder);
  renderAll();
  if (await persist()) {
    flashStatus(fmt(t.moveDone, { n: ids.length }));
  }
}

/* ---------- undo delete（进回收站 + 6 秒内可一键撤销） ---------- */

var UNDO_MS = 6000;
var pendingUndo = null; // { restore, timer } while the toast is up

function hideUndoToast() {
  var toast = $("undoToast");
  if (toast) toast.classList.add("hidden");
}

function cancelPendingUndo() {
  if (!pendingUndo) return;
  clearTimeout(pendingUndo.timer);
  pendingUndo = null;
  hideUndoToast();
}

/**
 * Show the undo toast. `action` is either an array of soft-deleted bookmark
 * ids (restoreFromTrash) or {message, restore} where restore() mutates
 * state.model and returns the status text to flash (folder delete, #126).
 * `message` optionally overrides the generic "Deleted n" toast text (#132:
 * duplicate cleanup says what it did). undoDelete re-renders via renderAll,
 * which also refreshes an open trash / duplicates panel.
 */
function showUndoToast(action, message) {
  var toast = $("undoToast");
  if (!toast) return;
  var undo = Array.isArray(action)
    ? {
        message: message || fmt(t.undoMsg, { n: action.length }),
        restore: function () {
          state.model = Bookmarks.restoreFromTrash(state.model, action);
          return fmt(t.trashRestored, { n: action.length });
        },
      }
    : action;
  $("undoToastMsg").textContent = undo.message;
  $("undoBtn").textContent = t.undo;
  toast.classList.remove("hidden");
  if (pendingUndo) clearTimeout(pendingUndo.timer);
  pendingUndo = {
    restore: undo.restore,
    timer: setTimeout(cancelPendingUndo, UNDO_MS),
  };
  return pendingUndo;
}

async function undoDelete() {
  var undo = pendingUndo;
  cancelPendingUndo();
  if (!undo) return;
  var done = undo.restore();
  renderAll();
  if (await persist()) flashStatus(done);
}

/**
 * Delete bookmarks by ids with an undo toast. All delete entry points
 * (card menu / card action bar / list row / batch bar) funnel through here.
 * Deletion is soft (trash): rows keep living in the JSON sidecar with a
 * deletedAt stamp for 30 days, and the undo window becomes irrelevant to
 * data safety — undo just restores instantly.
 */
async function deleteBookmarksWithUndo(ids, doneMessage) {
  if (!ids || !ids.length) return;
  cancelPendingUndo();
  state.model = Bookmarks.softDeleteBookmarks(state.model, ids, Date.now());
  clearSelection();
  renderAll();
  var token = showUndoToast(ids, doneMessage);
  var ok = await persist();
  // Don't flash "moved to trash" after the user already hit Undo (#132).
  if (ok && doneMessage && token && pendingUndo === token) flashStatus(doneMessage);
}

/* ---------- trash view（回收站：恢复 / 彻底删除 / 清空） ---------- */

function trashRows() {
  var rows = deletedBookmarks();
  rows.sort(function (a, b) {
    return (b.deletedAt || 0) - (a.deletedAt || 0); // newest deletion first
  });
  return rows;
}

function loadTrash() {
  var rows = trashRows();
  var empty = $("trashEmptyState");
  var list = $("trashList");
  list.textContent = "";
  $("trashHint").textContent = t.trashHint;
  $("trashEmpty").textContent = t.trashEmptyBtn;
  $("trashEmpty").disabled = !rows.length;
  $("trashRestoreSel").hidden = true;

  if (!rows.length) {
    list.classList.add("hidden");
    renderEmptyState(empty, {
      art: "trash",
      title: t.trashEmptyTitle,
      desc: t.trashEmptyDesc,
    });
    return;
  }
  empty.classList.add("hidden");
  list.classList.remove("hidden");
  for (var i = 0; i < rows.length; i++) {
    list.appendChild(trashRow(rows[i]));
  }
  updateTrashActions();
}

function trashRow(item) {
  var row = document.createElement("div");
  row.className = "row trashRow";
  var box = document.createElement("input");
  box.type = "checkbox";
  box.className = "pick";
  box.checked = Boolean(appState.trashSel[item.id]);
  box.setAttribute("aria-label", item.title || item.url);
  box.addEventListener("change", function () {
    if (box.checked) appState.trashSel[item.id] = true;
    else delete appState.trashSel[item.id];
    updateTrashActions();
  });
  row.appendChild(box);

  var link = document.createElement("a");
  link.className = "rowLink";
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.appendChild(faviconNode(item));
  var main = document.createElement("span");
  main.className = "rowMain";
  var title = document.createElement("span");
  title.className = "rowTitle";
  title.textContent = item.title || BookmarksView.domainOf(item.url) || item.url;
  var sub = document.createElement("span");
  sub.className = "rowDomain";
  var folder = item.folder ? folderLabel(item.folder) : "";
  sub.textContent =
    BookmarksView.domainOf(item.url) + (folder ? " · " + folder : "");
  main.appendChild(title);
  main.appendChild(sub);
  link.appendChild(main);
  row.appendChild(link);

  var when = document.createElement("time");
  when.className = "trashWhen";
  var ago = BookmarksView.formatWhen(item.deletedAt, Date.now(), lang);
  when.textContent = fmt(t.trashDeletedAgo, { w: ago });
  when.title = BookmarksView.formatDate(item.deletedAt, lang);
  row.appendChild(when);

  row.appendChild(
    iconButton("edit", t.trashRestore, function () {
      restoreFromTrashIds([item.id]);
    })
  );
  row.appendChild(
    iconButton("del", t.trashDeleteForever, function () {
      confirmThen(t.trashDeleteForeverConfirm, function () {
        hardDeleteIds([item.id]);
      });
    })
  );
  return row;
}

function updateTrashActions() {
  var picked = Object.keys(appState.trashSel).filter(function (id) {
    return appState.trashSel[id];
  });
  var btn = $("trashRestoreSel");
  btn.hidden = !picked.length;
  btn.textContent = fmt(t.trashRestoreSel) + " (" + picked.length + ")";
}

async function restoreFromTrashIds(ids) {
  state.model = Bookmarks.restoreFromTrash(state.model, ids);
  for (var i = 0; i < ids.length; i++) delete appState.trashSel[ids[i]];
  renderAll(); // also refreshes the open trash panel (#132)
  if (await persist()) flashStatus(fmt(t.trashRestored, { n: ids.length }));
}

/** Hard-remove (skip the trash) — the only irreversible path in the UI. */
async function hardDeleteIds(ids) {
  state.model = Bookmarks.removeBookmarks(state.model, ids);
  for (var i = 0; i < ids.length; i++) delete appState.trashSel[ids[i]];
  renderAll(); // also refreshes the open trash panel (#132)
  await persist();
}

async function restoreSelectedTrash() {
  var ids = Object.keys(appState.trashSel).filter(function (id) {
    return appState.trashSel[id];
  });
  if (!ids.length) return;
  await restoreFromTrashIds(ids);
}

function emptyTrash() {
  var ids = deletedBookmarks().map(function (item) {
    return item.id;
  });
  if (!ids.length) return;
  confirmThen(fmt(t.trashEmptyConfirm, { n: ids.length }), function () {
    hardDeleteIds(ids).then(function () {
      flashStatus(t.trashEmptied);
    });
  });
}

/* ---------- duplicates view（重复项：按 URL 分组清理） ---------- */

function loadDuplicates() {
  var groups = Bookmarks.duplicateGroups(state.model);
  var list = $("dupList");
  var empty = $("dupEmptyState");
  list.textContent = "";
  $("dupHint").textContent = fmt(t.dupHint, { g: groups.length });
  $("dupKeepOldestAll").disabled = !groups.length;

  if (!groups.length) {
    list.classList.add("hidden");
    renderEmptyState(empty, {
      art: "duplicates",
      title: t.dupEmptyTitle,
      desc: t.dupEmptyDesc,
    });
    return;
  }
  empty.classList.add("hidden");
  list.classList.remove("hidden");
  for (var i = 0; i < groups.length; i++) {
    list.appendChild(duplicateGroupCard(groups[i]));
  }
}

/**
 * One group card: a radio row per copy (default keeper = oldest), plus a
 * "keep selected, trash the rest" action. The selection lives in
 * appState.dupKeep[key]; rows deleted here go to the trash (recoverable).
 */
function duplicateGroupCard(group) {
  var card = document.createElement("article");
  card.className = "dupGroup";

  var head = document.createElement("header");
  head.className = "dupGroupHead";
  var title = document.createElement("h3");
  title.textContent = fmt(t.dupGroupTitle, { n: group.items.length });
  var host = document.createElement("span");
  host.className = "dupGroupHost";
  host.textContent = BookmarksView.domainOf(group.items[0].url) || group.key;
  head.appendChild(title);
  head.appendChild(host);
  card.appendChild(head);

  if (appState.dupKeep[group.key] == null) {
    appState.dupKeep[group.key] = group.items[0].id;
  }
  var current = appState.dupKeep[group.key];
  var stillThere = group.items.some(function (it) {
    return it.id === current;
  });
  if (!stillThere) {
    current = group.items[0].id;
    appState.dupKeep[group.key] = current;
  }

  var rows = document.createElement("div");
  rows.className = "dupRows";
  for (var i = 0; i < group.items.length; i++) {
    (function (item) {
      var row = document.createElement("label");
      row.className = "row dupRow";
      var radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "dup-" + group.key;
      radio.className = "pick";
      radio.checked = item.id === current;
      radio.addEventListener("change", function () {
        appState.dupKeep[group.key] = item.id;
      });
      row.appendChild(radio);
      var link = document.createElement("a");
      link.className = "rowLink";
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.appendChild(faviconNode(item));
      var main = document.createElement("span");
      main.className = "rowMain";
      var rTitle = document.createElement("span");
      rTitle.className = "rowTitle";
      rTitle.textContent = item.title || item.url;
      var rSub = document.createElement("span");
      rSub.className = "rowDomain";
      var folder = item.folder ? folderLabel(item.folder) : "";
      rSub.textContent =
        BookmarksView.domainOf(item.url) + (folder ? " · " + folder : "");
      main.appendChild(rTitle);
      main.appendChild(rSub);
      link.appendChild(main);
      row.appendChild(link);
      var added = document.createElement("time");
      added.textContent = BookmarksView.formatWhen(item.added, Date.now(), lang);
      added.title = BookmarksView.formatDate(item.added, lang);
      row.appendChild(added);
      rows.appendChild(row);
    })(group.items[i]);
  }
  card.appendChild(rows);

  var actions = document.createElement("div");
  actions.className = "dupActions";
  var keepBtn = document.createElement("button");
  keepBtn.type = "button";
  keepBtn.className = "primary";
  keepBtn.textContent = t.dupKeep;
  keepBtn.addEventListener("click", function () {
    var keepId = appState.dupKeep[group.key];
    var others = group.items
      .filter(function (it) {
        return it.id !== keepId;
      })
      .map(function (it) {
        return it.id;
      });
    if (!others.length) return;
    // The panel re-renders inside deleteBookmarksWithUndo (renderAll) and
    // again on Undo, so the group disappears / comes back immediately.
    delete appState.dupKeep[group.key];
    deleteBookmarksWithUndo(others, fmt(t.dupKeepDone, { n: others.length }));
  });
  actions.appendChild(keepBtn);
  card.appendChild(actions);
  return card;
}

/** One-click cleanup: keep the oldest copy in every group, trash the rest. */
async function keepOldestAllDuplicates() {
  var groups = Bookmarks.duplicateGroups(state.model);
  var allOthers = [];
  for (var i = 0; i < groups.length; i++) {
    for (var j = 1; j < groups[i].items.length; j++) {
      allOthers.push(groups[i].items[j].id);
    }
  }
  if (!allOthers.length) return;
  appState.dupKeep = {};
  await deleteBookmarksWithUndo(
    allOthers,
    fmt(t.dupKeepAllDone, { g: groups.length, n: allOthers.length })
  );
}

/** One checkbox driving multi-select; shift-click selects a filtered range. */
function pickBox(item) {
  var box = document.createElement("input");
  box.type = "checkbox";
  box.className = "pick";
  box.checked = Boolean(state.sel[item.id]);
  box.setAttribute("aria-label", item.title || item.url);
  box.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    var items = filteredItemsOrdered();
    if (event.shiftKey && state.selAnchor) {
      var ai = -1;
      var bi = -1;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === state.selAnchor) ai = i;
        if (items[i].id === item.id) bi = i;
      }
      if (ai !== -1 && bi !== -1) {
        for (var k = Math.min(ai, bi); k <= Math.max(ai, bi); k++) {
          state.sel[items[k].id] = true;
        }
      }
    } else if (state.sel[item.id]) {
      delete state.sel[item.id];
    } else {
      state.sel[item.id] = true;
      state.selAnchor = item.id;
    }
    renderItems();
  });
  return box;
}

function togglePinBookmark(item) {
  var nextPinned = !item.pinned;
  state.model = Bookmarks.setPinned(state.model, [item.id], nextPinned);
  persist().then(function (ok) {
    if (ok) flashStatus(nextPinned ? t.pinAdd : t.pinRemove);
  });
}

function snapshotFor(item) {
  if (!item || !item.id) return null;
  return Snapshots.findByBookmarkId(appState.snapshots, item.id);
}

function snapBadgeChip(item) {
  var entry = snapshotFor(item);
  if (!entry) return null;
  var chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip snap";
  chip.textContent = "📷";
  chip.title = t.snapBadge + " · " + BookmarksView.formatRelative(entry.capturedAt, Date.now(), lang);
  chip.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    viewSnapshot(entry);
  });
  return chip;
}

function cardMenuNode(item) {
  var wrap = document.createElement("div");
  wrap.className = "cardMenuWrap";
  // 不能用 iconButton：其 stopPropagation 会挡住 document 上的菜单开关委托
  var more = document.createElement("button");
  more.className = "cardMore menuToggle";
  more.type = "button";
  more.setAttribute("aria-haspopup", "true");
  more.setAttribute("aria-expanded", "false");
  more.setAttribute("aria-label", t.moreLabel);
  more.textContent = "⋯";
  var menu = document.createElement("div");
  menu.className = "popMenu";
  menu.appendChild(
    iconButton("menuItem", t.cardEdit, function () {
      closePopMenus();
      openTagDialog(item);
    })
  );
  menu.appendChild(
    iconButton("menuItem", t.cardMove, function () {
      closePopMenus();
      openMoveDialog(item);
    })
  );
  menu.appendChild(
    iconButton("menuItem", t.copyLink, function () {
      closePopMenus();
      copyBookmarkLink(item);
    })
  );
  menu.appendChild(
    iconButton("menuItem", item.pinned ? t.pinRemove : t.pinAdd, function () {
      closePopMenus();
      togglePinBookmark(item);
    })
  );
  var existingSnap = snapshotFor(item);
  if (existingSnap) {
    menu.appendChild(
      iconButton("menuItem", t.snapViewQuick, function () {
        closePopMenus();
        viewSnapshot(existingSnap);
      })
    );
  }
  menu.appendChild(
    iconButton("menuItem", t.cardSnap, function () {
      closePopMenus();
      openTagDialog(item);
      var snap = $("snapSection");
      if (snap && snap.scrollIntoView) snap.scrollIntoView({ block: "nearest" });
    })
  );
  menu.appendChild(
    iconButton("menuItem", t.deleteLabel, function () {
      closePopMenus();
      confirmThen(t.confirmDelete, function () {
        deleteBookmarksWithUndo([item.id]);
      });
    })
  );
  wrap.appendChild(more);
  wrap.appendChild(menu);
  return wrap;
}

/** Hover action bar overlaid on the card cover (open / pin / snapshot / delete). */
function cardActionBar(item) {
  function actBtn(cls, glyph, label, onClick) {
    var btn = document.createElement("button");
    btn.className = "cardAct " + cls;
    btn.type = "button";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.textContent = glyph;
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return btn;
  }
  var bar = document.createElement("div");
  bar.className = "cardActions";
  bar.appendChild(
    actBtn("open", "↗", t.openBookmark, function () {
      window.open(item.url, "_blank", "noopener,noreferrer");
    })
  );
  // 与行内 📍 不同，这里需要随置顶变化的 ★/☆ + aria-pressed
  var pin = document.createElement("button");
  pin.className = "cardAct pin";
  pin.type = "button";
  pin.title = item.pinned ? t.pinRemove : t.pinAdd;
  pin.setAttribute("aria-label", pin.title);
  pin.setAttribute("aria-pressed", String(Boolean(item.pinned)));
  pin.textContent = item.pinned ? "★" : "☆";
  pin.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    togglePinBookmark(item);
  });
  bar.appendChild(pin);
  bar.appendChild(
    actBtn("snap", "📷", snapshotFor(item) ? t.snapUpdate : t.cardSnap, function () {
      openTagDialog(item);
      var snap = $("snapSection");
      if (snap && snap.scrollIntoView) snap.scrollIntoView({ block: "nearest" });
    })
  );
  bar.appendChild(
    actBtn("del", "✕", t.deleteLabel, function () {
      confirmThen(t.confirmDelete, function () {
        deleteBookmarksWithUndo([item.id]);
      });
    })
  );
  return bar;
}

function cardNode(item) {
  var card = document.createElement("article");
  card.className = "card" + (state.sel[item.id] ? " sel" : "");
  wireBookmarkDrag(card, item);

  var link = document.createElement("a");
  link.className = "cardMain";
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.draggable = false; // 拖拽语义交给卡片级 move-to-folder

  // ham_home 式紧凑卡头：favicon 与标题同行，无大封面条
  var head = document.createElement("div");
  head.className = "cardHead";
  head.appendChild(faviconNode(item));
  var title = document.createElement("h3");
  title.textContent = item.title || BookmarksView.domainOf(item.url) || item.url;
  head.appendChild(title);
  link.appendChild(head);

  var domain = document.createElement("p");
  domain.className = "domain";
  domain.textContent = BookmarksView.domainOf(item.url) || item.url;
  link.appendChild(domain);

  if (item.note) {
    var note = document.createElement("p");
    note.className = "note";
    note.textContent = item.note;
    link.appendChild(note);
  }

  card.appendChild(link);

  card.appendChild(cardActionBar(item));

  // HamHome 式信息层次：分类/标签独立一行可换行，meta 只留勾选、置顶、时间、菜单
  var tags = Array.isArray(item.tags) ? item.tags : [];
  if (item.folder || tags.length) {
    var tagRow = document.createElement("div");
    tagRow.className = "cardTags";
    var chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = folderLabel(item.folder);
    tagRow.appendChild(chip);
    var maxCardTags = 4;
    for (var i = 0; i < tags.length && i < maxCardTags; i++) {
      var tag = document.createElement("span");
      tag.className = "chip tag";
      tag.textContent = tags[i];
      tagRow.appendChild(tag);
    }
    if (tags.length > maxCardTags) {
      var moreTag = document.createElement("span");
      moreTag.className = "chip tag";
      moreTag.textContent = "+" + (tags.length - maxCardTags);
      moreTag.title = tags.join(", ");
      tagRow.appendChild(moreTag);
    }
    card.appendChild(tagRow);
  }

  var meta = document.createElement("footer");
  meta.className = "cardMeta";
  meta.appendChild(pickBox(item));
  // 快照徽章：与列表行一致放进 meta 行，点击直接查看快照
  var snapBadge = snapBadgeChip(item);
  if (snapBadge) meta.appendChild(snapBadge);
  if (item.pinned) {
    var pin = document.createElement("span");
    pin.className = "chip pin";
    pin.textContent = "📌";
    pin.title = t.pinMark;
    meta.appendChild(pin);
  }
  var time = document.createElement("time");
  time.textContent = BookmarksView.formatWhen(item.added, Date.now(), lang);
  time.title = BookmarksView.formatDate(item.added, lang);
  meta.appendChild(time);
  meta.appendChild(cardMenuNode(item));

  card.appendChild(meta);
  return card;
}

function rowNode(item) {
  var row = document.createElement("div");
  row.className = "row" + (state.sel[item.id] ? " sel" : "");
  wireBookmarkDrag(row, item);
  row.appendChild(pickBox(item));
  var link = document.createElement("a");
  link.className = "rowLink";
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.draggable = false;
  link.appendChild(faviconNode(item));
  var main = document.createElement("span");
  main.className = "rowMain";
  var title = document.createElement("span");
  title.className = "rowTitle";
  title.textContent = item.title || BookmarksView.domainOf(item.url) || item.url;
  var domain = document.createElement("span");
  domain.className = "rowDomain";
  domain.textContent = BookmarksView.domainOf(item.url);
  main.appendChild(title);
  if (item.note) {
    var note = document.createElement("span");
    note.className = "rowNote";
    note.textContent = item.note;
    main.appendChild(note);
  }
  main.appendChild(domain);
  link.appendChild(main);
  row.appendChild(link);
  var chips = document.createElement("span");
  chips.className = "rowChips";
  if (item.pinned) {
    var pin = document.createElement("span");
    pin.className = "chip pin";
    pin.textContent = "📌";
    pin.title = t.pinMark;
    chips.appendChild(pin);
  }
  var snapChip = snapBadgeChip(item);
  if (snapChip) chips.appendChild(snapChip);
  var chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = folderLabel(item.folder);
  chips.appendChild(chip);
  var tags = Array.isArray(item.tags) ? item.tags : [];
  for (var i = 0; i < tags.length; i++) {
    var tag = document.createElement("span");
    tag.className = "chip tag";
    tag.textContent = tags[i];
    chips.appendChild(tag);
  }
  row.appendChild(chips);
  var time = document.createElement("time");
  time.textContent = BookmarksView.formatWhen(item.added, Date.now(), lang);
  time.title = BookmarksView.formatDate(item.added, lang);
  row.appendChild(time);
  // 不用 iconButton：需要随置顶状态变化的 title/aria-pressed
  var pinBtn = document.createElement("button");
  pinBtn.className = "pin";
  pinBtn.type = "button";
  pinBtn.title = item.pinned ? t.pinRemove : t.pinAdd;
  pinBtn.setAttribute("aria-label", pinBtn.title);
  pinBtn.setAttribute("aria-pressed", String(Boolean(item.pinned)));
  pinBtn.textContent = item.pinned ? "📍" : "📌";
  pinBtn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    togglePinBookmark(item);
  });
  row.appendChild(pinBtn);
  row.appendChild(
    iconButton("edit", "✎", function () {
      openTagDialog(item);
    })
  );
  row.appendChild(
    iconButton("del", "✕", function () {
      confirmThen(t.confirmDelete, function () {
        deleteBookmarksWithUndo([item.id]);
      });
    })
  );
  return row;
}

/**
 * First-load placeholder: shimmering card/row skeletons so the library
 * paints structure instantly. Skipped when a cached render is already on
 * screen (refresh happens after renderFromCache in the normal boot path).
 */
function showSkeleton() {
  var cards = $("cards");
  var rows = $("rows");
  var empty = $("emptyState");
  if (empty) empty.classList.add("hidden");
  if (state.view === "grid") {
    rows.classList.add("hidden");
    cards.classList.remove("hidden");
    if (cards.children.length) return;
    for (var i = 0; i < 8; i++) {
      var card = document.createElement("div");
      card.className = "card skel";
      card.setAttribute("aria-hidden", "true");
      card.innerHTML =
        '<div class="skelDot"></div>' +
        '<div class="skelLine w70"></div>' +
        '<div class="skelLine w45"></div>';
      cards.appendChild(card);
    }
  } else {
    cards.classList.add("hidden");
    rows.classList.remove("hidden");
    if (rows.children.length) return;
    for (var j = 0; j < 8; j++) {
      var row = document.createElement("div");
      row.className = "row skel";
      row.setAttribute("aria-hidden", "true");
      row.innerHTML = '<div class="skelDot"></div><div class="skelLine w70"></div>';
      rows.appendChild(row);
    }
  }
}

/* ---------- masonry（瀑布流：最短列优先 + 内容高度自适应） ---------- */

var MASONRY_COL_WIDTH = 264;
var MASONRY_GAP = 16;
var masonryResizeTimer = null;

function planMasonryColumns(width) {
  if (!width) return 1;
  return Math.max(1, Math.floor((width + MASONRY_GAP) / (MASONRY_COL_WIDTH + MASONRY_GAP)));
}

/**
 * Card height estimate for shortest-column-first distribution (px). Real
 * heights come from content; the ladder below only needs to be monotonic —
 * notes add two lines, each ~3 tags add a wrap row.
 */
function estimateCardHeight(item) {
  var base = 150;
  if (item.note) base += 56;
  var chips = (item.folder ? 1 : 0) + Math.min((item.tags || []).length, 4);
  base += chips ? Math.ceil(chips / 3) * 26 : 0;
  return base;
}

function renderMasonry(items) {
  var cards = $("cards");
  cards.textContent = "";
  var width = cards.clientWidth || 0;
  var colCount = planMasonryColumns(width);
  var cols = [];
  var heights = [];
  for (var c = 0; c < colCount; c++) {
    var col = document.createElement("div");
    col.className = "masonryCol";
    cards.appendChild(col);
    cols.push(col);
    heights.push(0);
  }
  for (var i = 0; i < items.length; i++) {
    var idx = 0;
    for (var h = 1; h < heights.length; h++) {
      if (heights[h] < heights[idx]) idx = h;
    }
    var cardEl = cardNode(items[i]);
    cardEl.dataset.idx = String(i); // 筛选序号，键盘导航按行优先行走
    cols[idx].appendChild(cardEl);
    heights[idx] += estimateCardHeight(items[i]);
  }
}

function onMasonryResize() {
  if (appState.view !== "bookmarks" || state.view !== "grid") return;
  clearTimeout(masonryResizeTimer);
  masonryResizeTimer = setTimeout(function () {
    if (appState.view === "bookmarks" && state.view === "grid") renderItems();
  }, 150);
}

function renderItems() {
  var items = filteredItemsOrdered();

  var cards = $("cards");
  var rows = $("rows");
  cards.textContent = "";
  rows.textContent = "";
  var isGrid = state.view === "grid";
  cards.classList.toggle("hidden", !isGrid);
  rows.classList.toggle("hidden", isGrid);

  if (isGrid) renderMasonry(items);
  else {
    for (var i = 0; i < items.length; i++) {
      var rowEl = rowNode(items[i]);
      rowEl.dataset.idx = String(i);
      rows.appendChild(rowEl);
    }
  }

  var selecting = selectedExistingIds().length > 0;
  cards.classList.toggle("selecting", selecting);
  rows.classList.toggle("selecting", selecting);

  var empty = $("emptyState");
  if (!items.length) {
    if (liveBookmarks().length === 0) {
      renderEmptyState(empty, {
        art: "library",
        title: t.emptyTitle,
        desc: t.emptyDesc,
        actions: [
          { label: t.add, kind: "primary", onClick: openAddDialog },
          { label: t.import, kind: "ghost", onClick: openImportDialog },
        ],
      });
    } else if (state.filter.kind === "folder") {
      renderEmptyState(empty, {
        art: "search",
        title: t.emptyFolderTitle,
        desc: t.emptyFilter,
        actions: [{ label: t.clearFilter, kind: "ghost", onClick: resetFilters }],
      });
    } else if (state.filter.kind === "tag") {
      renderEmptyState(empty, {
        art: "search",
        title: t.emptyTagTitle,
        desc: t.emptyFilter,
        actions: [{ label: t.clearFilter, kind: "ghost", onClick: resetFilters }],
      });
    } else if (state.filter.kind === "pinned") {
      renderEmptyState(empty, {
        art: "search",
        title: t.emptyPinnedTitle,
        desc: t.emptyFilter,
        actions: [{ label: t.clearFilter, kind: "ghost", onClick: resetFilters }],
      });
    } else {
      renderEmptyState(empty, {
        art: "search",
        title: t.emptyFilter,
        actions: [
          { label: t.add, kind: "primary", onClick: openAddDialog },
          { label: t.clearFilter, kind: "ghost", onClick: resetFilters },
        ],
      });
    }
  } else {
    empty.classList.add("hidden");
  }
  updateBatchBar();
}

/* ---------- batch bar (#63) ---------- */

function allSelectedPinned(ids) {
  var byId = Object.create(null);
  for (var i = 0; i < state.model.bookmarks.length; i++) {
    byId[state.model.bookmarks[i].id] = state.model.bookmarks[i];
  }
  for (var j = 0; j < ids.length; j++) {
    if (!byId[ids[j]] || !byId[ids[j]].pinned) return false;
  }
  return ids.length > 0;
}

function updateBatchBar() {
  var ids = selectedExistingIds();
  var bar = $("batchBar");
  bar.classList.toggle("hidden", ids.length === 0);
  $("batchCount").textContent = fmt(t.batchSelected, { n: ids.length });
  $("selAllBtn").textContent = t.selAll;
  var unpin = allSelectedPinned(ids);
  $("batchPin").textContent = unpin ? t.batchUnpin : t.batchPin;
  $("batchPin").classList.toggle("batchPinPrimary", !unpin && ids.length > 0);
}

function toggleSelAll() {
  var items = filteredItemsOrdered();
  if (!items.length) return;
  var all = true;
  for (var i = 0; i < items.length; i++) {
    if (!state.sel[items[i].id]) {
      all = false;
      break;
    }
  }
  for (var j = 0; j < items.length; j++) {
    if (all) delete state.sel[items[j].id];
    else state.sel[items[j].id] = true;
  }
  state.selAnchor = null;
  renderItems();
}

function openBatchMoveDialog() {
  $("batchMoveError").textContent = "";
  $("batchMoveInput").value = "";
  var datalist = $("batchMoveOptions");
  datalist.textContent = "";
  var paths = Bookmarks.folderPaths(state.model);
  for (var i = 0; i < paths.length; i++) {
    var opt = document.createElement("option");
    opt.value = paths[i];
    datalist.appendChild(opt);
  }
  $("batchMoveDialog").showModal();
  $("batchMoveInput").focus();
}

async function submitBatchMove(event) {
  event.preventDefault();
  var ids = selectedExistingIds();
  if (!ids.length) {
    $("batchMoveDialog").close();
    return;
  }
  var folder = $("batchMoveInput").value.trim().replace(/^\/+|\/+$/g, "");
  state.model = Bookmarks.moveBookmarks(state.model, ids, folder);
  $("batchMoveDialog").close();
  clearSelection();
  if (await persist()) flashStatus(t.added);
}

function openBatchTagsDialog() {
  $("batchTagsError").textContent = "";
  $("batchTagsAdd").value = "";
  $("batchTagsRemove").value = "";
  $("batchTagsDialog").showModal();
  $("batchTagsAdd").focus();
}

async function submitBatchTags(event) {
  event.preventDefault();
  var ids = selectedExistingIds();
  if (!ids.length) {
    $("batchTagsDialog").close();
    return;
  }
  var add = $("batchTagsAdd").value.split(",");
  var remove = $("batchTagsRemove").value.split(",");
  state.model = Bookmarks.adjustTags(state.model, ids, add, remove);
  $("batchTagsDialog").close();
  clearSelection();
  if (await persist()) flashStatus(t.added);
}

async function submitBatchPin() {
  var ids = selectedExistingIds();
  if (!ids.length) return;
  var allPinned = allSelectedPinned(ids);
  var count = ids.length;
  if (allPinned && count >= 5) {
    var confirmed = await new Promise(function (resolve) {
      confirmThen(
        fmt(t.batchUnpinConfirm, { n: count }),
        function () {
          resolve(true);
        },
        function () {
          resolve(false);
        }
      );
    });
    if (!confirmed) return;
  }
  state.model = Bookmarks.setPinned(state.model, ids, !allPinned);
  clearSelection();
  if (await persist()) {
    flashStatus(fmt(allPinned ? t.batchUnpinDone : t.batchPinDone, { n: count }));
  }
}

function submitBatchDelete() {
  var ids = selectedExistingIds();
  if (!ids.length) return;
  confirmThen(fmt(t.batchDeleteConfirm, { n: ids.length }), async function () {
    await deleteBookmarksWithUndo(ids);
  });
}

function renderSyncInfo() {
  var info = $("syncInfo");
  if (state.syncedAt) {
    info.textContent =
      BookmarksView.formatRelative(state.syncedAt, Date.now(), lang) +
      " · " +
      BookmarksView.formatBytes(state.bytes);
  } else {
    info.textContent = t.neverSynced;
  }
}

function flashStatus(message) {
  var el = $("syncInfo");
  var before = el.textContent;
  el.textContent = message;
  el.classList.add("flash");
  setTimeout(function () {
    el.textContent = before;
    el.classList.remove("flash");
  }, 2000);
}

/* ---------- workspaces ---------- */

async function loadWorkspaces() {
  showIn("bannerWs", "");
  $("bannerWs").classList.add("hidden");
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    showWsBanner(t.needConfig, t.openSettings, openSettings);
    renderWorkspaces();
    return;
  }
  var res = await made.client.getFile(WS_FILE);
  if (!res.ok) {
    showWsBanner(errorText(res.kind), t.openSettings, openSettings);
    renderWorkspaces();
    return;
  }
  appState.workspacesEtag = res.etag;
  var parsed = null;
  if (res.text) {
    try {
      parsed = JSON.parse(res.text);
    } catch (err) {
      parsed = null;
    }
  }
  appState.workspaces = Workspaces.normalize(parsed);
  appState.wsSelected = {};
  renderWorkspaces();
}

async function persistWorkspaces() {
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    showWsBanner(t.needConfig, t.openSettings, openSettings);
    return false;
  }
  var put = await made.client.putFile(
    WS_FILE,
    JSON.stringify(appState.workspaces, null, 2),
    "application/json; charset=utf-8",
    appState.workspacesEtag
  );
  if (put.ok) return true;
  if (put.kind === "conflict") {
    showWsBanner(t.errConflict);
    await loadWorkspaces();
    return false;
  }
  showWsBanner(errorText(put.kind), t.openSettings, openSettings);
  return false;
}

function findWorkspace(id) {
  var list = appState.workspaces.workspaces;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function wsCheckedKey(wsId, idx) {
  return wsId + ":" + idx;
}

function renderWorkspaces() {
  var list = appState.workspaces.workspaces;
  var container = $("wsList");
  container.textContent = "";
  $("wsCount").textContent = fmt(t.wsCount, { n: list.length });

  var empty = $("wsEmpty");
  if (!list.length) {
    renderEmptyState(empty, {
      title: t.emptyWsTitle,
      desc: t.wsEmpty,
      actions: [{ label: t.saveWindow, kind: "primary", onClick: saveCurrentWindow }],
    });
    return;
  }
  empty.classList.add("hidden");

  for (var i = 0; i < list.length; i++) {
    (function (ws) {
      container.appendChild(wsCard(ws));
    })(list[i]);
  }
}

function wsCard(ws) {
  var card = document.createElement("article");
  card.className = "wsCard";

  var head = document.createElement("header");
  head.className = "wsHead";
  var title = document.createElement("h3");
  title.textContent = ws.name;
  var meta = document.createElement("span");
  meta.className = "wsMeta";
  meta.textContent =
    ws.pages.length + " · " + BookmarksView.formatDate(ws.createdAt, lang);
  head.appendChild(title);
  head.appendChild(meta);
  head.appendChild(
    iconButton("del", "✕", function () {
      confirmThen(t.confirmDelete, async function () {
        appState.workspaces = Workspaces.remove(appState.workspaces, ws.id);
        if (await persistWorkspaces()) renderWorkspaces();
      });
    })
  );
  card.appendChild(head);

  var actions = document.createElement("div");
  actions.className = "wsActions";
  var restoreAll = document.createElement("button");
  restoreAll.className = "primary";
  restoreAll.type = "button";
  restoreAll.textContent = t.restoreAll;
  restoreAll.addEventListener("click", function () {
    restoreWorkspace(ws.id, null);
  });
  var restoreSel = document.createElement("button");
  restoreSel.className = "ghost";
  restoreSel.type = "button";
  restoreSel.textContent = t.restoreSelected;
  restoreSel.disabled = wsSelectedCount(ws) === 0;
  restoreSel.addEventListener("click", function () {
    var idxs = [];
    for (var k = 0; k < ws.pages.length; k++) {
      if (appState.wsSelected[wsCheckedKey(ws.id, k)]) idxs.push(k);
    }
    restoreWorkspace(ws.id, idxs);
  });
  var renameBtn = document.createElement("button");
  renameBtn.className = "ghost";
  renameBtn.type = "button";
  renameBtn.textContent = t.rename;
  renameBtn.addEventListener("click", function () {
    openWsNameDialog(ws);
  });
  var updateBtn = document.createElement("button");
  updateBtn.className = "ghost";
  updateBtn.type = "button";
  updateBtn.textContent = t.wsUpdateFromWindow;
  updateBtn.addEventListener("click", function () {
    updateWorkspaceFromWindow(ws);
  });
  actions.appendChild(restoreAll);
  actions.appendChild(restoreSel);
  actions.appendChild(renameBtn);
  actions.appendChild(updateBtn);
  card.appendChild(actions);

  var selectBar = document.createElement("div");
  selectBar.className = "wsSelectBar";
  var selAll = document.createElement("button");
  selAll.className = "ghost";
  selAll.type = "button";
  selAll.textContent = t.wsSelectAll;
  selAll.addEventListener("click", function () {
    setWsPageSelection(ws, true);
  });
  var selNone = document.createElement("button");
  selNone.className = "ghost";
  selNone.type = "button";
  selNone.textContent = t.wsSelectNone;
  selNone.addEventListener("click", function () {
    setWsPageSelection(ws, false);
  });
  var selHint = document.createElement("span");
  selHint.className = "wsSelectedHint";
  selHint.textContent = fmt(t.wsSelectedCount, { n: wsSelectedCount(ws) });
  selectBar.appendChild(selAll);
  selectBar.appendChild(selNone);
  selectBar.appendChild(selHint);
  card.appendChild(selectBar);

  var pages = document.createElement("div");
  pages.className = "wsPages";
  for (var i = 0; i < ws.pages.length; i++) {
    (function (page, idx) {
      pages.appendChild(wsPageRow(ws.id, page, idx));
    })(ws.pages[i], i);
  }
  card.appendChild(pages);
  return card;
}

function wsPageRow(wsId, page, idx) {
  var row = document.createElement("label");
  row.className = "pageRow";
  var box = document.createElement("input");
  box.type = "checkbox";
  box.checked = Boolean(appState.wsSelected[wsCheckedKey(wsId, idx)]);
  box.addEventListener("change", function () {
    appState.wsSelected[wsCheckedKey(wsId, idx)] = box.checked;
    renderWorkspaces();
  });
  row.appendChild(box);
  row.appendChild(faviconNode({ url: page.url, title: page.title }));
  var text = document.createElement("span");
  text.className = "pageRowTitle";
  text.textContent = page.title || BookmarksView.domainOf(page.url) || page.url;
  text.title = page.url || "";
  row.appendChild(text);
  if (page.pinned) {
    var pin = document.createElement("span");
    pin.className = "chip";
    pin.textContent = t.pinMark;
    row.appendChild(pin);
  }
  if (page.tabGroup && page.tabGroup.title) {
    var chip = document.createElement("span");
    chip.className = "chip tag";
    chip.textContent = fmt(t.groupMark, { t: page.tabGroup.title });
    row.appendChild(chip);
  }
  return row;
}

async function collectCurrentWindowPages() {
  var tabs = await chrome.tabs.query({ currentWindow: true });
  var pages = [];
  for (var i = 0; i < tabs.length; i++) {
    var tab = tabs[i];
    if (!Workspaces.isWebUrl(tab.url)) continue;
    var group = null;
    if (tab.groupId && tab.groupId !== -1 && chrome.tabGroups) {
      try {
        var g = await chrome.tabGroups.get(tab.groupId);
        if (g && g.title) group = { title: g.title, color: g.color };
      } catch (err) {
        group = null;
      }
    }
    pages.push({
      url: tab.url,
      title: tab.title || "",
      pinned: Boolean(tab.pinned),
      tabGroup: group,
    });
  }
  return pages;
}

async function saveCurrentWindow() {
  var pages = await collectCurrentWindowPages();
  if (!pages.length) {
    showWsBanner(t.wsNoPages);
    return;
  }
  openWsNameDialog(null, pages);
}

function wsSelectedCount(ws) {
  var n = 0;
  for (var i = 0; i < ws.pages.length; i++) {
    if (appState.wsSelected[wsCheckedKey(ws.id, i)]) n += 1;
  }
  return n;
}

function setWsPageSelection(ws, checked) {
  for (var i = 0; i < ws.pages.length; i++) {
    appState.wsSelected[wsCheckedKey(ws.id, i)] = Boolean(checked);
  }
  renderWorkspaces();
}

async function updateWorkspaceFromWindow(ws) {
  var pages = await collectCurrentWindowPages();
  if (!pages.length) {
    showWsBanner(t.wsNoPages);
    return;
  }
  confirmThen(
    fmt(t.wsUpdateConfirm, { name: ws.name, n: ws.pages.length, m: pages.length }),
    async function () {
      appState.workspaces = Workspaces.upsert(appState.workspaces, {
        id: ws.id,
        name: ws.name,
        createdAt: ws.createdAt,
        pages: pages,
      });
      if (await persistWorkspaces()) {
        var updated = findWorkspace(ws.id);
        if (updated) setWsPageSelection(updated, false);
        else renderWorkspaces();
        showWsBanner(fmt(t.wsUpdated, { n: pages.length }));
      }
    }
  );
}

async function restoreWorkspace(wsId, selectedIdxs) {
  var ws = findWorkspace(wsId);
  if (!ws) return;
  var pages = Workspaces.restorablePages(ws, selectedIdxs);
  if (!pages.length) return;
  var win = await chrome.windows.create({
    url: pages.map(function (p) {
      return p.url;
    }),
    focused: true,
  });
  var created = (win && win.tabs) || [];
  var groupsByTitle = {};
  for (var i = 0; i < pages.length && i < created.length; i++) {
    if (pages[i].pinned) chrome.tabs.update(created[i].id, { pinned: true });
    var g = pages[i].tabGroup;
    if (g && g.title && chrome.tabGroups) {
      var entry = groupsByTitle[g.title] || (groupsByTitle[g.title] = { color: g.color, tabIds: [] });
      entry.tabIds.push(created[i].id);
    }
  }
  var titles = Object.keys(groupsByTitle);
  for (var j = 0; j < titles.length; j++) {
    try {
      var gid = await chrome.tabGroups.group({ tabIds: groupsByTitle[titles[j]].tabIds });
      await chrome.tabGroups.update(gid, {
        title: titles[j],
        color: groupsByTitle[titles[j]].color,
      });
    } catch (err) {
      /* grouping saved tabs is best-effort */
    }
  }
  showWsBanner(fmt(t.wsRestored, { n: pages.length }));
}

/* ---------- tab group rules ---------- */

async function loadTabRules() {
  $("bannerRules").classList.add("hidden");
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    showRulesBanner(t.needConfig, t.openSettings, openSettings);
    renderTabRules();
    return;
  }
  var res = await made.client.getFile(RULES_FILE);
  if (!res.ok) {
    showRulesBanner(errorText(res.kind), t.openSettings, openSettings);
    renderTabRules();
    return;
  }
  appState.rulesEtag = res.etag;
  var parsed = null;
  if (res.text) {
    try {
      parsed = JSON.parse(res.text);
    } catch (err) {
      parsed = null;
    }
  }
  appState.tabRules = TabRules.normalize(parsed);
  renderTabRules();
}

async function persistTabRules() {
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    showRulesBanner(t.needConfig, t.openSettings, openSettings);
    return false;
  }
  var put = await made.client.putFile(
    RULES_FILE,
    JSON.stringify(appState.tabRules, null, 2),
    "application/json; charset=utf-8",
    appState.rulesEtag
  );
  if (put.ok) return true;
  if (put.kind === "conflict") {
    showRulesBanner(t.errConflict);
    await loadTabRules();
    return false;
  }
  showRulesBanner(errorText(put.kind), t.openSettings, openSettings);
  return false;
}

function renderTabRules() {
  $("fallbackDomain").checked = Boolean(appState.tabRules.fallbackDomain);

  var container = $("ruleList");
  container.textContent = "";
  var rules = appState.tabRules.rules;

  var empty = $("rulesEmpty");
  if (!rules.length) {
    renderEmptyState(empty, {
      title: t.emptyRulesTitle,
      desc: t.rulesEmpty,
      actions: [
        { label: t.groupCurrentWindow, kind: "primary", onClick: applyGroupsToCurrentWindow },
      ],
    });
    return;
  }
  empty.classList.add("hidden");

  for (var i = 0; i < rules.length; i++) {
    (function (rule) {
      container.appendChild(ruleRow(rule));
    })(rules[i]);
  }
}

function ruleSummary(rule) {
  var labels =
    lang === "zh"
      ? { domain: "域: ", url: "url~ ", title: "标题~ ", regex: "re: " }
      : { domain: "domains: ", url: "url~ ", title: "title~ ", regex: "re: " };
  var parts = [];
  if (rule.domain) parts.push(labels.domain + rule.domain);
  if (rule.urlIncludes) parts.push(labels.url + rule.urlIncludes);
  if (rule.titleIncludes) parts.push(labels.title + rule.titleIncludes);
  if (rule.regex) parts.push(labels.regex + rule.regex);
  return parts.join(" · ");
}

function ruleRow(rule) {
  var row = document.createElement("div");
  row.className = "row ruleRow";

  var dot = document.createElement("span");
  dot.className = "colorDot " + rule.color;
  row.appendChild(dot);

  var title = document.createElement("span");
  title.className = "rowTitle";
  title.textContent = rule.title || "—";
  row.appendChild(title);

  var summary = document.createElement("span");
  summary.className = "rowDomain";
  summary.textContent = ruleSummary(rule);
  row.appendChild(summary);

  var order = document.createElement("span");
  order.className = "chip";
  order.textContent = "#" + rule.order;
  row.appendChild(order);

  row.appendChild(
    iconButton("edit", "✎", function () {
      openRuleDialog(rule);
    })
  );
  row.appendChild(
    iconButton("del", "✕", function () {
      confirmThen(t.confirmDelete, async function () {
        appState.tabRules = TabRules.remove(appState.tabRules, rule.id);
        if (await persistTabRules()) renderTabRules();
      });
    })
  );
  return row;
}

async function applyGroupsToCurrentWindow() {
  var tabs = await chrome.tabs.query({ currentWindow: true });
  var plans = TabRules.planGroups(appState.tabRules, tabs);
  if (!plans.length) {
    showRulesBanner(t.rulesNone);
    return;
  }
  var createdGroups = 0;
  for (var i = 0; i < plans.length; i++) {
    var plan = plans[i];
    if (!plan.tabIds.length) continue;
    if (plan.kind === "domain" && plan.tabIds.length < 2) continue;
    try {
      var gid = await chrome.tabGroups.group({ tabIds: plan.tabIds });
      await chrome.tabGroups.update(gid, {
        title: plan.title || "Group",
        color: plan.color,
        collapsed: plan.collapsed,
      });
      createdGroups += 1;
    } catch (err) {
      /* grouping is best-effort per group */
    }
  }
  showRulesBanner(fmt(t.rulesApplied, { n: createdGroups }));
}

function openRuleDialog(rule) {
  editingRuleId = rule ? rule.id : null;
  $("ruleError").textContent = "";
  $("ruleDomain").value = rule ? rule.domain : "";
  $("ruleUrl").value = rule ? rule.urlIncludes : "";
  $("ruleTitle").value = rule ? rule.titleIncludes : "";
  $("ruleRegex").value = rule ? rule.regex : "";
  $("ruleName").value = rule ? rule.title : "";
  $("ruleColor").value = rule ? rule.color : "grey";
  $("ruleOrder").value = rule ? String(rule.order) : "0";
  $("ruleCollapsed").checked = rule ? rule.collapsed : false;
  $("ruleDialog").showModal();
}

async function submitRule(event) {
  event.preventDefault();
  var regex = $("ruleRegex").value.trim();
  if (regex) {
    try {
      new RegExp(regex, "i");
    } catch (err) {
      $("ruleError").textContent = t.ruleInvalidRegex;
      return;
    }
  }
  var rule = {
    id: editingRuleId || undefined,
    domain: $("ruleDomain").value.trim(),
    urlIncludes: $("ruleUrl").value.trim(),
    titleIncludes: $("ruleTitle").value.trim(),
    regex: regex,
    title: $("ruleName").value.trim(),
    color: $("ruleColor").value,
    collapsed: $("ruleCollapsed").checked,
    order: parseInt($("ruleOrder").value, 10) || 0,
  };
  if (!rule.domain && !rule.urlIncludes && !rule.titleIncludes && !rule.regex) {
    $("ruleError").textContent = t.ruleNeedCriteria;
    return;
  }
  appState.tabRules = TabRules.upsert(appState.tabRules, rule);
  $("ruleDialog").close();
  if (await persistTabRules()) renderTabRules();
}

/* ---------- snapshots ---------- */

var SNAP_FILE = "snapshots.json";
var SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Runs inside the captured page (MAIN world): best-effort inlines CORS-readable
 * images as data URLs, strips scripts/iframes, returns the serialized HTML.
 * Must stay fully self-contained — it is serialized, not closure-called.
 */
var PAGE_CAPTURE_FUNC = function () {
  return (async function () {
    var imgs = Array.prototype.slice.call(document.images || []).slice(0, 50);
    await Promise.all(
      imgs.map(function (img) {
        if (!img || !img.src || img.src.indexOf("data:") === 0) return Promise.resolve();
        return fetch(img.src, { mode: "cors", credentials: "omit" })
          .then(function (res) {
            return res.ok ? res.blob() : null;
          })
          .then(function (blob) {
            if (!blob || blob.size > 2 * 1024 * 1024) return;
            return new Promise(function (resolve) {
              var reader = new FileReader();
              reader.onload = function () {
                img.src = String(reader.result);
                resolve();
              };
              reader.onerror = function () {
                resolve();
              };
              reader.readAsDataURL(blob);
            });
          })
          .catch(function () {});
      })
    );
    var root = document.documentElement ? document.documentElement.cloneNode(true) : null;
    if (!root) return "";
    var junk = root.querySelectorAll("script, iframe, noscript");
    for (var i = 0; i < junk.length; i++) {
      if (junk[i].parentNode) junk[i].parentNode.removeChild(junk[i]);
    }
    return "<!DOCTYPE html>" + root.outerHTML;
  })();
};

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var listener = function (id, info) {
      if (id === tabId && info && info.status === "complete") {
        cleanup();
        resolve();
      }
    };
    function cleanup() {
      if (settled) return;
      settled = true;
      try {
        chrome.tabs.onUpdated.removeListener(listener);
      } catch (err) {
        /* listener already gone */
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(function () {
      cleanup();
      reject(new Error("snapshot tab timeout"));
    }, timeoutMs);
    chrome.tabs
      .get(tabId)
      .then(function (tab) {
        if (tab && tab.status === "complete") {
          cleanup();
          resolve();
        }
      })
      .catch(function () {});
  });
}

function setSnapStatus(message) {
  $("snapInfo").textContent = message || "";
}

async function loadSnapshots() {
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    appState.snapshots = Snapshots.normalize(null);
    appState.snapshotsEtag = null;
    return;
  }
  var res = await made.client.getFile(SNAP_FILE);
  // First-time libraries have no snapshots.json yet (GET 404). Treat as an
  // empty index so capture can create the file; do not surface as a hard error.
  if (!res.ok) {
    var softEmpty =
      res.missing ||
      res.status === 404 ||
      res.kind === "http404" ||
      res.kind === "disabled";
    if (softEmpty) {
      appState.snapshots = Snapshots.normalize(null);
      appState.snapshotsEtag = null;
    }
    // Transient network/auth errors: keep any prior in-memory index.
    return;
  }
  if (res.missing) {
    appState.snapshots = Snapshots.normalize(null);
    appState.snapshotsEtag = null;
    return;
  }
  appState.snapshotsEtag = res.etag;
  var parsed = null;
  if (res.text) {
    try {
      parsed = JSON.parse(res.text);
    } catch (err) {
      parsed = null;
    }
  }
  appState.snapshots = Snapshots.normalize(parsed);
}

async function persistSnapshots() {
  var made = await makeClient();
  if (!made.cfg.instanceUrl) return false;

  async function writeOnce(etag) {
    return made.client.putFile(
      SNAP_FILE,
      JSON.stringify(appState.snapshots, null, 2),
      "application/json; charset=utf-8",
      etag
    );
  }

  /** 201 Created often omits ETag; re-GET so the next replace can If-Match. */
  async function rememberEtag(put) {
    if (put && put.etag) {
      appState.snapshotsEtag = put.etag;
      return;
    }
    var tip = await made.client.getFile(SNAP_FILE);
    if (tip.ok && !tip.missing && tip.etag) {
      appState.snapshotsEtag = tip.etag;
    }
  }

  var put = await writeOnce(appState.snapshotsEtag);
  // #112: first-time create can 412 when a stale/wrong If-Match was sent
  // (or tip etag never learned after a prior 201). Keep in-memory upserts —
  // do NOT loadSnapshots() here (that wiped the new entry on GET 404).
  if (!put.ok && put.kind === "conflict") {
    var pending = appState.snapshots;
    var remote = await made.client.getFile(SNAP_FILE);
    if (!remote.ok) {
      setSnapStatus(t.snapConflict);
      return false;
    }
    if (remote.missing) {
      appState.snapshotsEtag = null;
      appState.snapshots = pending;
      put = await writeOnce(null);
    } else {
      appState.snapshotsEtag = remote.etag || null;
      appState.snapshots = pending;
      put = await writeOnce(appState.snapshotsEtag);
    }
  }

  if (put.ok) {
    await rememberEtag(put);
    return true;
  }
  if (put.kind === "conflict") {
    setSnapStatus(t.snapConflict);
  }
  return false;
}

function renderSnapSection() {
  var bookmark = tagDialogBookmark;
  if (!bookmark) return;
  var entry = Snapshots.findByBookmarkId(appState.snapshots, bookmark.id);
  $("snapCapture").textContent = entry ? t.snapUpdate : t.snapCapture;
  $("snapView").disabled = !entry;
  $("snapDownload").disabled = !entry;
  $("snapDelete").disabled = !entry;
  if (entry) {
    setSnapStatus(
      BookmarksView.formatRelative(entry.capturedAt, Date.now(), lang) +
        " · " +
        BookmarksView.formatBytes(entry.size)
    );
  } else {
    setSnapStatus(t.snapNone);
  }
}

/** True for http(s) pages that scripting may inject into once host perm is granted. */
function isCapturableUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    var u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (err) {
    return false;
  }
}

/**
 * Request optional_host_permissions for the page origin so executeScript can run.
 * Must be invoked without a prior await in the click stack — permissions.request
 * needs the user-gesture token. Already-granted origins resolve immediately.
 */
async function ensureCaptureHostPermission(pageUrl) {
  if (!chrome.permissions || typeof chrome.permissions.request !== "function") {
    return { granted: false, reason: "unavailable" };
  }
  var originPattern;
  try {
    originPattern = new URL(pageUrl).origin + "/*";
  } catch (err) {
    return { granted: false, reason: "restricted" };
  }
  try {
    var granted = await chrome.permissions.request({ origins: [originPattern] });
    return { granted: Boolean(granted), reason: granted ? "ok" : "denied" };
  } catch (err) {
    return { granted: false, reason: "denied" };
  }
}

function classifyCaptureError(err) {
  var msg = err && err.message ? String(err.message) : String(err || "");
  if (/snapshot tab timeout/i.test(msg) || /timeout/i.test(msg)) return "load";
  if (/Cannot access contents|Missing host permission|Cannot access a chrome|The extensions gallery|frame with URL/i.test(msg)) {
    return "inject";
  }
  if (/permission|host permission|Cannot create item/i.test(msg)) return "inject";
  return "generic";
}

async function captureSnapshotFor(bookmark) {
  if (!bookmark || !chrome.scripting) {
    setSnapStatus(t.snapCaptureFail);
    return;
  }
  if (!isCapturableUrl(bookmark.url)) {
    setSnapStatus(t.snapRestricted);
    return;
  }
  // Host permission FIRST — preserve click user-gesture (no prior await).
  var host = await ensureCaptureHostPermission(bookmark.url);
  if (!host.granted) {
    setSnapStatus(host.reason === "restricted" ? t.snapRestricted : t.snapHostDenied);
    return;
  }

  await loadSnapshots();
  var prior = Snapshots.findByBookmarkId(appState.snapshots, bookmark.id);
  if (prior) {
    var okReplace = await new Promise(function (resolve) {
      confirmThen(
        t.snapReplaceConfirm,
        function () {
          resolve(true);
        },
        function () {
          resolve(false);
        }
      );
    });
    if (!okReplace) return;
  }
  setSnapStatus(t.snapCapturing);

  var tab = null;
  var html = "";
  try {
    try {
      tab = await chrome.tabs.create({ url: bookmark.url, active: false });
    } catch (createErr) {
      setSnapStatus(t.snapLoadFail);
      return;
    }
    if (!tab || tab.id == null) {
      setSnapStatus(t.snapLoadFail);
      return;
    }
    try {
      await waitForTabComplete(tab.id, 25000);
    } catch (timeoutErr) {
      setSnapStatus(t.snapLoadFail);
      return;
    }
    // Reject chrome-error / blocked interstitial pages.
    try {
      var loaded = await chrome.tabs.get(tab.id);
      var loadedUrl = loaded && loaded.url ? String(loaded.url) : "";
      if (
        !loadedUrl ||
        /^chrome(?:-error|-extension)?:/i.test(loadedUrl) ||
        /^about:(?!blank)/i.test(loadedUrl)
      ) {
        setSnapStatus(t.snapLoadFail);
        return;
      }
    } catch (getErr) {
      setSnapStatus(t.snapLoadFail);
      return;
    }
    var results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: PAGE_CAPTURE_FUNC,
      });
    } catch (injectErr) {
      var kind = classifyCaptureError(injectErr);
      setSnapStatus(
        kind === "inject" ? t.snapInjectFail : kind === "load" ? t.snapLoadFail : t.snapCaptureFail
      );
      return;
    }
    html =
      results && results[0] && typeof results[0].result === "string"
        ? results[0].result
        : "";
  } finally {
    if (tab && tab.id != null) {
      try {
        chrome.tabs.remove(tab.id);
      } catch (removeErr) {
        /* tab may already be gone */
      }
    }
  }
  if (!html) {
    setSnapStatus(t.snapCaptureFail);
    return;
  }
  if (html.length > SNAPSHOT_MAX_BYTES) {
    setSnapStatus(t.snapTooLarge);
    return;
  }

  var made = await makeClient();
  var previous = Snapshots.findByBookmarkId(appState.snapshots, bookmark.id);
  var id = Snapshots.makeId();
  var put = await made.client.putFile(Snapshots.fileName(id), html, "text/html; charset=utf-8");
  if (!put.ok) {
    var writeMsg = t.snapWriteFail;
    if (put.kind === "disabled" || put.kind === "http404" || put.status === 404) {
      writeMsg = t.snapWriteFailPath;
    } else if (put.kind) {
      writeMsg = errorText(put.kind) || t.snapWriteFail;
    }
    setSnapStatus(writeMsg);
    return;
  }
  if (previous && previous.id && previous.id !== id) {
    await made.client.deleteFile(Snapshots.fileName(previous.id));
  }
  appState.snapshots = Snapshots.upsert(appState.snapshots, {
    id: id,
    bookmarkId: bookmark.id,
    url: bookmark.url,
    title: bookmark.title,
    capturedAt: Date.now(),
    size: html.length,
  });
  var ok = await persistSnapshots();
  setSnapStatus(ok ? t.snapSaved : t.snapConflict);
  renderSnapSection();
  if (ok) renderItems();
}

async function fetchSnapshotHtml(entry) {
  var made = await makeClient();
  var file = await made.client.getFile(Snapshots.fileName(entry.id));
  if (!file.ok) {
    setSnapStatus(errorText(file.kind));
    return null;
  }
  if (file.missing) {
    setSnapStatus(t.snapMissing);
    return null;
  }
  return String(file.text || "");
}

async function viewSnapshot(entry) {
  var html = await fetchSnapshotHtml(entry);
  if (html === null) return;
  var blob = new Blob([html], { type: "text/html" });
  var url = URL.createObjectURL(blob);
  chrome.tabs.create({ url: url });
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 5 * 60 * 1000);
}

async function downloadSnapshot(entry) {
  var html = await fetchSnapshotHtml(entry);
  if (html === null) return;
  var blob = new Blob([html], { type: "text/html" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = entry.id + ".html";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 5000);
}

async function deleteSnapshot(entry) {
  var made = await makeClient();
  var del = await made.client.deleteFile(Snapshots.fileName(entry.id));
  if (!del.ok) {
    setSnapStatus(errorText(del.kind));
    return;
  }
  appState.snapshots = Snapshots.remove(appState.snapshots, entry.id);
  var ok = await persistSnapshots();
  if (ok) setSnapStatus(t.snapDeleted);
  renderSnapSection();
  if (ok) renderItems();
}

/* ---------- tag / note editing ---------- */

function openAddDialog() {
  $("addError").textContent = "";
  $("addDialog").showModal();
  $("addUrl").focus();
}

/**
 * "Move to folder" dialog for one bookmark: lists Unfiled plus every folder
 * with its count; the current folder is marked. Picking a row delegates to
 * moveBookmarksToFolder (render + persist + flash included).
 */
function openMoveDialog(item) {
  editingBookmarkId = item.id;
  $("moveTarget").textContent = item.title || BookmarksView.domainOf(item.url) || item.url;
  var list = $("moveFolderList");
  list.textContent = "";
  // folderList already includes the unfiled entry ("" path) — don't prepend it.
  var entries = BookmarksView.folderList(state.model);
  var current = String(item.folder || "");
  for (var i = 0; i < entries.length; i++) {
    (function (entry) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "moveItem" + (entry.name === current ? " current" : "");
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", entry.name === current ? "true" : "false");
      var label = document.createElement("span");
      label.textContent = folderLabel(entry.name);
      btn.appendChild(label);
      var badge = document.createElement("span");
      badge.className = "count";
      badge.textContent = String(entry.count);
      btn.appendChild(badge);
      btn.addEventListener("click", function () {
        $("moveDialog").close();
        moveBookmarksToFolder([item.id], entry.name);
      });
      list.appendChild(btn);
    })(entries[i]);
  }
  $("moveDialog").showModal();
  var first = list.querySelector("button");
  if (first) first.focus();
}

function copyBookmarkLink(item) {
  var url = String(item && item.url || "");
  if (!url) return;
  var flash = function () {
    flashStatus(t.linkCopied);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(flash, function () {
      /* clipboard denied — nothing to report */
    });
  }
}

function openTagDialog(item) {
  editingBookmarkId = item.id;
  tagDialogBookmark = item;
  $("tagTarget").textContent = item.title || BookmarksView.domainOf(item.url) || item.url;
  $("tagTitleInput").value = item.title || "";
  $("tagUrlInput").value = item.url || "";
  $("tagError").textContent = "";
  $("tagError").classList.add("hidden");
  $("tagInput").value = (Array.isArray(item.tags) ? item.tags : []).join(", ");
  $("noteInput").value = item.note || "";
  $("tagDialog").showModal();
  $("tagTitleInput").focus();
  loadSnapshots().then(renderSnapSection);
}

async function submitTagForm(event) {
  event.preventDefault();
  var item = null;
  for (var i = 0; i < state.model.bookmarks.length; i++) {
    if (state.model.bookmarks[i].id === editingBookmarkId) {
      item = state.model.bookmarks[i];
      break;
    }
  }
  if (!item) {
    $("tagDialog").close();
    return;
  }
  // URL edits go through setBookmarkUrl: it rejects junk and URLs that
  // collide with another entry (a silent merge would strand rich fields).
  var nextUrl = $("tagUrlInput").value.trim();
  if (Bookmarks.urlKey(nextUrl) !== Bookmarks.urlKey(item.url)) {
    var moved = Bookmarks.setBookmarkUrl(state.model, item.id, nextUrl);
    if (!moved.ok) {
      var err = $("tagError");
      err.textContent = moved.reason === "exists" ? t.exists : t.tagUrlInvalid;
      err.classList.remove("hidden");
      $("tagUrlInput").focus();
      return;
    }
    state.model = moved.model;
  }
  var nextTitle = $("tagTitleInput").value.trim();
  state.model = Bookmarks.updateBookmark(state.model, editingBookmarkId, {
    title: nextTitle || item.title,
    tags: $("tagInput").value.split(","),
    note: $("noteInput").value,
  });
  $("tagDialog").close();
  var ok = await persist();
  if (ok) flashStatus(t.added);
}

/* ---------- add bookmark / import / export ---------- */

async function submitAdd(event) {
  event.preventDefault();
  var url = $("addUrl").value.trim();
  if (!Bookmarks.isWebUrl(url)) {
    $("addError").textContent = t.invalidUrl;
    return;
  }
  var typedTitle = $("addTitleInput").value.trim();
  var title = typedTitle || BookmarksView.domainOf(url) || url;
  // #130: re-adding a trashed URL revives the original entry (folder, tags,
  // note, added time kept); a title only replaces the old one when typed.
  var add = Bookmarks.addBookmark(
    state.model,
    { title: title, url: url, added: Date.now() },
    { overwriteTitle: Boolean(typedTitle) }
  );
  if (!add.added) {
    $("addError").textContent = t.exists;
    return;
  }
  state.model = add.model;
  $("addError").textContent = "";
  $("addDialog").close();
  $("addUrl").value = "";
  $("addTitleInput").value = "";
  var ok = await persist();
  if (ok) flashStatus(add.restored ? fmt(t.trashRestored, { n: 1 }) : t.added);
}

async function importChromeBookmarks() {
  if (!chromeBookmarksAvailable()) {
    showBanner(bookmarksPermissionDeniedMessage());
    return;
  }
  // Same pre-prompt + permissions.request path as exportChromeWrite (#109 / #107).
  // Must stay first awaits after click so the user-gesture token reaches request().
  if (!(await ensureBookmarksPermission())) {
    showBanner(bookmarksPermissionDeniedMessage());
    return;
  }
  if (!chrome.bookmarks) {
    showBanner(bookmarksPermissionDeniedMessage());
    return;
  }
  var tree = await chrome.bookmarks.getTree();
  var incoming = [];
  function walk(nodes, folderPath) {
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.url) {
        if (Bookmarks.isWebUrl(node.url)) {
          incoming.push({
            title: node.title || "",
            url: node.url,
            folder: folderPath,
            added: node.dateAdded || 0,
          });
        }
      } else if (Array.isArray(node.children)) {
        var nextPath = node.title
          ? (folderPath ? folderPath + "/" : "") + node.title
          : folderPath;
        walk(node.children, nextPath);
      }
    }
  }
  walk(tree || [], "");

  var before = state.model.bookmarks.length;
  state.model = Bookmarks.mergeModels(state.model, { bookmarks: incoming });
  var added = state.model.bookmarks.length - before;
  var ok = await persist();
  if (ok) flashStatus(fmt(added > 0 ? t.importDone : t.importNone, { n: added }));
}

/**
 * HamHome migration (issue #53): read-only import from the same instance's
 * /HamHomeSync/ directory (bookmarks/meta.json + categories.json), merged by URL.
 * Path matches HamHome sync-engine: META_JSON=/HamHomeSync/bookmarks/meta.json.
 */
async function importHamHome() {
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    showBanner(t.needConfig, t.openSettings, openSettings);
    return;
  }
  var hh = DavflareDav.createDavClient({
    instanceUrl: made.cfg.instanceUrl,
    username: made.cfg.username,
    password: made.cfg.password,
    basePath: "HamHomeSync",
  });
  var meta = await hh.getFile("bookmarks/meta.json");
  if (!meta.ok) {
    showBanner(errorText(meta.kind), t.openSettings, openSettings);
    return;
  }
  if (meta.missing) {
    showBanner(t.hhNotFound);
    return;
  }
  var cats = await hh.getFile("categories.json");
  var result = HamHome.importFrom(
    meta.text,
    cats.ok && !cats.missing ? cats.text : null
  );
  if (!result.ok) {
    showBanner(t.hhInvalid);
    return;
  }
  var before = state.model.bookmarks.length;
  state.model = Bookmarks.mergeModels(state.model, result.model);
  var added = state.model.bookmarks.length - before;
  var ok = await persist();
  if (ok) flashStatus(fmt(added > 0 ? t.hhImported : t.hhNone, { n: added }));
}

function downloadText(filename, mime, text) {
  var blob = new Blob([text], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 5000);
}

/* ---------- folder create / rename (#63) ---------- */

var folderDialogMode = "new";
var folderDialogTarget = "";

function fillFolderDatalist() {
  var datalist = $("folderOptionsList");
  datalist.textContent = "";
  var paths = Bookmarks.folderPaths(state.model);
  for (var i = 0; i < paths.length; i++) {
    var opt = document.createElement("option");
    opt.value = paths[i];
    datalist.appendChild(opt);
  }
}

function openFolderDialog(mode, path) {
  folderDialogMode = mode === "rename" ? "rename" : "new";
  folderDialogTarget = typeof path === "string" ? path : "";
  $("folderError").textContent = "";
  $("folderDialogTitle").textContent =
    folderDialogMode === "rename" ? t.folderRenameTitle : t.folderAddTitle;
  $("folderInput").value = folderDialogMode === "rename" ? folderDialogTarget : "";
  fillFolderDatalist();
  $("folderDialog").showModal();
  $("folderInput").focus();
}

async function submitFolderDialog(event) {
  event.preventDefault();
  var value = $("folderInput").value.trim().replace(/^\/+|\/+$/g, "");
  if (!value) {
    $("folderError").textContent = t.invalidName;
    return;
  }
  var segs = value.split("/");
  for (var s = 0; s < segs.length; s++) {
    if (!segs[s] || segs[s] === "." || segs[s] === "..") {
      $("folderError").textContent = t.invalidName;
      return;
    }
  }
  if (folderDialogMode === "rename") {
    if (value === folderDialogTarget) {
      $("folderDialog").close();
      return;
    }
    state.model = Bookmarks.renameFolder(state.model, folderDialogTarget, value);
    // Keep the active folder filter pointing at the renamed path.
    if (state.filter.kind === "folder") {
      if (state.filter.value === folderDialogTarget) {
        state.filter.value = value;
      } else if (state.filter.value.indexOf(folderDialogTarget + "/") === 0) {
        state.filter.value = value + state.filter.value.slice(folderDialogTarget.length);
      }
    }
  } else {
    if (Bookmarks.folderPaths(state.model).indexOf(value) !== -1) {
      $("folderError").textContent = t.folderExists;
      return;
    }
    state.model = Bookmarks.addFolder(state.model, value);
    state.filter = { kind: "folder", value: value };
  }
  $("folderDialog").close();
  renderAll();
  await persist();
}

/* ---------- filter presets (#63 P2) ---------- */

var PRESETS_KEY = "bookmarkPresets";
var FAVORITES_KEY = "bookmarkFavorites";

function sinceLabel(kind) {
  var labels = {
    all: t.sinceAll,
    today: t.sinceToday,
    week: t.sinceWeek,
    month: t.sinceMonth,
    year: t.sinceYear,
  };
  return labels[kind] || t.sinceAll;
}

async function loadPresets() {
  try {
    var stored = await chrome.storage.sync.get([PRESETS_KEY]);
    appState.presets = BookmarksView.normalizePresets(stored && stored[PRESETS_KEY]);
  } catch (err) {
    appState.presets = [];
  }
  renderPresetSelect();
}


async function savePresets() {
  var payload = {};
  payload[PRESETS_KEY] = appState.presets;
  await chrome.storage.sync.set(payload);
}

/* ---------- sidebar favorites (phase 3) ---------- */

async function loadFavorites() {
  try {
    var stored = await chrome.storage.sync.get([FAVORITES_KEY]);
    appState.favorites = BookmarksView.normalizeFavorites(
      stored && stored[FAVORITES_KEY]
    );
  } catch (err) {
    appState.favorites = [];
  }
}

async function saveFavorites() {
  var payload = {};
  payload[FAVORITES_KEY] = appState.favorites;
  try {
    await chrome.storage.sync.set(payload);
  } catch (err) {
    /* ignore quota */
  }
}

function favoriteEntry(kind, value) {
  return { kind: kind, value: kind === "pinned" ? "" : value || "" };
}

function favLabel(entry) {
  if (!entry) return "";
  if (entry.kind === "pinned") return t.favKindPinned;
  if (entry.kind === "tag") return entry.value;
  return folderLabel(entry.value || "");
}

function favKindPrefix(entry) {
  if (!entry) return "";
  if (entry.kind === "tag") return t.favKindTag;
  if (entry.kind === "pinned") return t.favKindPinned;
  return t.favKindFolder;
}

function applyFavorite(entry) {
  if (!entry) return;
  if (entry.kind === "pinned") {
    state.filter = { kind: "pinned", value: "" };
  } else if (entry.kind === "tag") {
    state.filter = { kind: "tag", value: entry.value };
  } else {
    state.filter = { kind: "folder", value: entry.value || "" };
  }
  renderAll();
}

async function toggleFavoriteEntry(kind, value) {
  appState.favorites = BookmarksView.toggleFavorite(
    appState.favorites,
    favoriteEntry(kind, value)
  );
  await saveFavorites();
  renderNav();
}

function renderFavoritesNav() {
  var title = $("favoritesTitle");
  var host = $("favoritesNav");
  if (!title || !host) return;
  title.textContent = t.favoritesTitle;
  host.textContent = "";
  var list = BookmarksView.normalizeFavorites(appState.favorites);
  if (!list.length) {
    var empty = document.createElement("p");
    empty.className = "navEmptyFav";
    empty.textContent = t.favoritesEmpty;
    host.appendChild(empty);
    return;
  }
  for (var i = 0; i < list.length; i++) {
    (function (entry) {
      var wrap = document.createElement("div");
      wrap.className = "favItemWrap";
      var active =
        (entry.kind === "pinned" && state.filter.kind === "pinned") ||
        (entry.kind === "folder" &&
          state.filter.kind === "folder" &&
          state.filter.value === (entry.value || "")) ||
        (entry.kind === "tag" &&
          state.filter.kind === "tag" &&
          state.filter.value === entry.value);
      var btn = navButton(favLabel(entry), null, active, function () {
        applyFavorite(entry);
      });
      var kind = document.createElement("span");
      kind.className = "favKind";
      kind.textContent = favKindPrefix(entry) + " · ";
      if (btn.firstChild) btn.insertBefore(kind, btn.firstChild);
      else btn.appendChild(kind);
      wrap.appendChild(btn);
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "favRemove";
      rm.title = t.favRemove;
      rm.setAttribute("aria-label", t.favRemove);
      rm.textContent = "×";
      rm.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleFavoriteEntry(entry.kind, entry.value);
      });
      wrap.appendChild(rm);
      host.appendChild(wrap);
    })(list[i]);
  }
}


function ensurePinnedFavoriteStar() {
  var pinned = $("navPinned");
  if (!pinned) return;
  var wrap = pinned.closest
    ? pinned.closest(".navItemWrap")
    : null;
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "navItemWrap hasStar pinnedWrap";
    pinned.parentNode.insertBefore(wrap, pinned);
    wrap.appendChild(pinned);
  } else {
    wrap.classList.add("hasStar");
  }
  var existing = wrap.querySelector(".navFolderStar, .navTagStar");
  if (existing) existing.remove();
  wrap.appendChild(makeFavoriteStar("pinned", ""));
}

function makeFavoriteStar(kind, value) {
  var star = document.createElement("button");
  star.type = "button";
  star.className = kind === "tag" ? "navTagStar" : "navFolderStar";
  var on = BookmarksView.isFavorite(appState.favorites, favoriteEntry(kind, value));
  star.setAttribute("aria-pressed", on ? "true" : "false");
  star.title = on ? t.favRemove : t.favAdd;
  star.setAttribute("aria-label", on ? t.favRemove : t.favAdd);
  star.textContent = on ? "★" : "☆";
  star.addEventListener("click", function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    toggleFavoriteEntry(kind, value);
  });
  return star;
}

/* ---------- storage visibility (phase 3) ---------- */

function utf8Bytes(text) {
  try {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(String(text || "")).length;
    }
  } catch (err) {
    /* fall through */
  }
  return String(text || "").length;
}

async function measureLibraryStorage() {
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    return { error: "needConfig", summary: null };
  }
  var client = made.client;
  var path = "";
  try {
    path = (client.paths && client.paths.dir) || "";
  } catch (err) {
    path = "";
  }
  var bookmarks = 0;
  var workspaces = 0;
  var tabRules = 0;
  var snapshotsIndex = 0;
  var snapshotsHtml = 0;
  var failed = false;

  // Bookmarks: prefer in-memory encode (matches what we would PUT), else GET.
  try {
    bookmarks = computeBytes();
  } catch (err2) {
    bookmarks = state.bytes || 0;
  }

  async function sizeOf(fileName) {
    var res = await client.getFile(fileName);
    if (!res.ok) {
      failed = true;
      return 0;
    }
    if (res.missing) return 0;
    return utf8Bytes(res.text || "");
  }

  workspaces = await sizeOf(WS_FILE);
  tabRules = await sizeOf(RULES_FILE);

  var snapRes = await client.getFile(SNAP_FILE);
  if (!snapRes.ok) {
    failed = true;
  } else if (!snapRes.missing) {
    snapshotsIndex = utf8Bytes(snapRes.text || "");
    var parsed = null;
    try {
      parsed = JSON.parse(snapRes.text || "null");
    } catch (err3) {
      parsed = null;
    }
    var normalized = Snapshots.normalize(parsed);
    snapshotsHtml = BookmarksView.sumSnapshotSizes(normalized);
    appState.snapshots = normalized;
    if (snapRes.etag) appState.snapshotsEtag = snapRes.etag;
  }

  return {
    error: failed ? "partial" : null,
    summary: BookmarksView.summarizeStorage({
      path: path,
      bookmarks: bookmarks,
      workspaces: workspaces,
      tabRules: tabRules,
      snapshotsIndex: snapshotsIndex,
      snapshotsHtml: snapshotsHtml,
    }),
  };
}

function renderStorageSummary(summary) {
  var dash = "—";
  function set(id, n) {
    var el = $(id);
    if (!el) return;
    el.textContent =
      typeof n === "number" && n > 0 ? BookmarksView.formatBytes(n) : n === 0 ? "0 B" : dash;
  }
  if (!summary) {
    set("storageBookmarks");
    set("storageWorkspaces");
    set("storageTabRules");
    set("storageSnaps");
    set("storageTotal");
    return;
  }
  set("storageBookmarks", summary.bookmarks);
  set("storageWorkspaces", summary.workspaces);
  set("storageTabRules", summary.tabRules);
  set("storageSnaps", summary.snapshotsIndex + summary.snapshotsHtml);
  set("storageTotal", summary.total);
  var pathHint = $("storagePathHint");
  if (pathHint) {
    pathHint.textContent = summary.path
      ? fmt(t.storagePath, { p: summary.path })
      : "";
  }
}


/** Omnibox / deep-link: bookmarks.html?q=term opens the library filtered. */
function applyLibraryQueryFromUrl() {
  var q = "";
  try {
    q = new URLSearchParams(location.search).get("q") || "";
  } catch (err) {
    q = "";
  }
  q = String(q || "").trim();
  if (!q) return;
  state.query = q;
  var search = $("search");
  if (search) search.value = q;
  switchView("bookmarks");
  renderAll();
  renderItems();
}

async function refreshStoragePanel() {
  var status = $("storageStatus");
  if (status) status.textContent = t.storageLoading;
  var result = await measureLibraryStorage();
  if (!result.summary) {
    if (status) status.textContent = t.storageNeedConfig;
    renderStorageSummary(null);
    return;
  }
  renderStorageSummary(result.summary);
  if (status) {
    status.textContent =
      result.error === "partial" ? t.storageFailed : t.storageDone;
  }
}


/** The preset matching the active tag+since filter, if any. */
function activePreset() {
  return BookmarksView.findActivePreset(
    appState.presets,
    state.filter.kind,
    state.filter.value,
    state.since
  );
}

function presetOptionLabel(p) {
  var filter = BookmarksView.presetFilterLabel(p, {
    pinned: t.presetKindPinned,
    unfiled: t.presetUnfiled,
  });
  var kind =
    p.kind === "folder"
      ? t.presetKindFolder
      : p.kind === "pinned"
        ? t.presetKindPinned
        : t.presetKindTag;
  return p.name + "（" + kind + ":" + filter + " · " + sinceLabel(p.since) + "）";
}

function renderPresetSelect() {
  var select = $("presetSelect");
  select.textContent = "";
  var placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t.presetPlaceholder;
  select.appendChild(placeholder);
  for (var i = 0; i < appState.presets.length; i++) {
    var p = appState.presets[i];
    var opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = presetOptionLabel(p);
    select.appendChild(opt);
  }
  var active = activePreset();
  select.value = active ? active.name : "";
  $("presetDelete").hidden = !active;
  var wrap = $("presetWrap");
  if (wrap) wrap.classList.toggle("isActive", Boolean(active));
}

function applyPreset(name) {
  var preset = null;
  for (var i = 0; i < appState.presets.length; i++) {
    if (appState.presets[i].name === name) {
      preset = appState.presets[i];
      break;
    }
  }
  if (!preset) {
    renderPresetSelect();
    return;
  }
  var kind = preset.kind === "folder" || preset.kind === "pinned" ? preset.kind : "tag";
  if (kind === "pinned") {
    state.filter = { kind: "pinned", value: "" };
  } else if (kind === "folder") {
    state.filter = { kind: "folder", value: preset.value || "" };
  } else {
    state.filter = { kind: "tag", value: preset.value || preset.tag || "" };
  }
  state.since = preset.since;
  $("sinceSelect").value = preset.since;
  // renderAll → renderPresetSelect so ✕ / selected option update immediately (#84).
  renderAll();
}

function openPresetDialog() {
  var kind = state.filter.kind;
  if (kind !== "tag" && kind !== "folder" && kind !== "pinned") {
    showBanner(t.presetNeedTag);
    return;
  }
  if (kind === "tag" && !state.filter.value) {
    showBanner(t.presetNeedTag);
    return;
  }
  $("presetError").textContent = "";
  $("presetName").value = "";
  var filterText =
    kind === "pinned"
      ? t.presetKindPinned
      : kind === "folder"
        ? folderLabel(state.filter.value)
        : state.filter.value;
  var kindLabel =
    kind === "folder"
      ? t.presetKindFolder
      : kind === "pinned"
        ? t.presetKindPinned
        : t.presetKindTag;
  $("presetSummary").textContent =
    kindLabel + ":" + filterText + " · " + sinceLabel(state.since);
  $("presetDialog").showModal();
  $("presetName").focus();
}

async function submitPreset(event) {
  event.preventDefault();
  var name = $("presetName").value.trim().slice(0, 40);
  if (!name) {
    $("presetError").textContent = t.invalidName;
    return;
  }
  var kind = state.filter.kind;
  if (kind !== "tag" && kind !== "folder" && kind !== "pinned") {
    $("presetError").textContent = t.presetNeedTag;
    return;
  }
  var kept = appState.presets.filter(function (p) {
    return p.name !== name;
  });
  var row = { name: name, kind: kind, value: state.filter.value || "", since: state.since };
  if (kind === "tag") row.tag = state.filter.value;
  kept.push(row);
  appState.presets = BookmarksView.normalizePresets(kept);
  await savePresets();
  $("presetDialog").close();
  renderPresetSelect();
  flashStatus(t.presetSaved);
}

function deleteActivePreset() {
  var preset = activePreset();
  if (!preset) return;
  confirmThen(fmt(t.presetDeleteConfirm, { p: preset.name }), async function () {
    appState.presets = appState.presets.filter(function (p) {
      return p.name !== preset.name;
    });
    await savePresets();
    renderPresetSelect();
  });
}

function exportHtml() {
  downloadText("bookmarks.html", "text/html", Bookmarks.serializeHtml(state.model));
  flashStatus(t.exported);
}

function exportJson() {
  downloadText(
    "davflare-bookmarks.json",
    "application/json",
    Bookmarks.modelToJsonText(state.model)
  );
  flashStatus(t.exportedJson);
}

/* ---------- write back to the browser bookmarks bar (#64) ---------- */

function chromeBookmarksAvailable() {
  // optional_permissions: chrome.bookmarks may be undefined until granted.
  // Gate only on chrome.permissions so we can still call permissions.request.
  return typeof chrome !== "undefined" && !!chrome.permissions;
}

/** In-memory grant cache so click handlers can skip contains() (which would burn the user gesture). */
var bookmarksPermGranted = null;

async function warmBookmarksPermissionCache() {
  if (!chromeBookmarksAvailable()) {
    bookmarksPermGranted = false;
    return;
  }
  try {
    bookmarksPermGranted = await chrome.permissions.contains({
      permissions: ["bookmarks"],
    });
  } catch (err) {
    bookmarksPermGranted = false;
  }
}

function bookmarksPermissionDeniedMessage() {
  return t.exportChromeDenied + " " + t.exportChromeDeniedHint;
}

if (typeof chrome !== "undefined" && chrome.permissions && chrome.permissions.onAdded) {
  try {
    chrome.permissions.onAdded.addListener(function (perm) {
      if (perm && Array.isArray(perm.permissions) && perm.permissions.indexOf("bookmarks") >= 0) {
        bookmarksPermGranted = true;
      }
    });
    chrome.permissions.onRemoved.addListener(function (perm) {
      if (perm && Array.isArray(perm.permissions) && perm.permissions.indexOf("bookmarks") >= 0) {
        bookmarksPermGranted = false;
      }
    });
  } catch (permListenErr) {
    /* older Chromium */
  }
}

/** Fill the target-folder select from the browser's bookmark tree. */
async function populateChromeFolderSelect() {
  var select = $("exportChromeFolder");
  select.textContent = "";
  var tree = await chrome.bookmarks.getTree();
  var root = tree && tree[0];
  var defaultId = null;
  function walk(node, prefix) {
    if (!Array.isArray(node.children)) return;
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i];
      if (child.url) continue;
      var label = prefix ? prefix + " / " + child.title : child.title;
      var opt = document.createElement("option");
      opt.value = child.id;
      opt.textContent = label;
      select.appendChild(opt);
      if (defaultId === null) defaultId = child.id;
      walk(child, label);
    }
  }
  walk(root || {}, "");
  if (!defaultId) {
    var fallback = document.createElement("option");
    fallback.value = root ? root.id : "";
    fallback.textContent = root ? root.title || "Bookmarks" : "Bookmarks";
    select.appendChild(fallback);
    defaultId = fallback.value;
  }
  select.value = defaultId;
}

async function ensureBookmarksPermission() {
  if (!chromeBookmarksAvailable()) return false;
  if (bookmarksPermGranted === true) return true;
  try {
    // Do NOT await permissions.contains here — that await consumes the click
    // user-gesture token and chrome.permissions.request then silently returns
    // false with no system dialog (common PM failure mode on unpacked builds).
    // permissions.request is a no-op (resolves true) when already granted.
    var proceed = true;
    try {
      proceed = window.confirm(
        t.permBookmarksTitle + "\n\n" + t.permBookmarksBody
      );
    } catch (confirmErr) {
      proceed = true;
    }
    if (!proceed) return false;
    var ok = Boolean(await chrome.permissions.request({ permissions: ["bookmarks"] }));
    bookmarksPermGranted = ok;
    return ok;
  } catch (err) {
    bookmarksPermGranted = false;
    return false;
  }
}

function collectSubtreeUrls(node, out) {
  if (!node) return;
  if (node.url) {
    var key = Bookmarks.urlKey(node.url);
    if (key) out.push(key);
  }
  if (Array.isArray(node.children)) {
    for (var i = 0; i < node.children.length; i++) collectSubtreeUrls(node.children[i], out);
  }
}

/** Map urlKey → { id, title } for bookmarks under a Chrome folder tree. */
function collectSubtreeUrlMap(node, out) {
  if (!node) return;
  if (node.url) {
    var key = Bookmarks.urlKey(node.url);
    if (key && !out[key]) {
      out[key] = { id: node.id || "", title: node.title || "" };
    }
  }
  if (Array.isArray(node.children)) {
    for (var i = 0; i < node.children.length; i++) {
      collectSubtreeUrlMap(node.children[i], out);
    }
  }
}

function countSubtree(node) {
  if (!node || !Array.isArray(node.children)) return 0;
  return node.children.length;
}

async function createChromePlan(nodes, parentId) {
  var created = 0;
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var made = await chrome.bookmarks.create({
      parentId: parentId,
      title: node.title || "",
      url: node.url || undefined,
    });
    if (node.url) {
      created += 1;
    } else if (node.children && node.children.length && made) {
      created += await createChromePlan(node.children, made.id);
    }
  }
  return created;
}

var pendingChromeConflict = null;

function closeChromeConflictDialog(action) {
  var pending = pendingChromeConflict;
  pendingChromeConflict = null;
  $("chromeConflictDialog").close();
  if (pending && typeof pending.resolve === "function") pending.resolve(action || "cancel");
}

function promptChromeConflicts(analysis) {
  return new Promise(function (resolve) {
    pendingChromeConflict = { resolve: resolve };
    $("chromeConflictTitle").textContent = t.chromeConflictTitle;
    $("chromeConflictSummary").textContent = fmt(t.chromeConflictSummary, {
      c: analysis.conflicts.length,
      n: analysis.newCount,
    });
    $("chromeConflictHint").textContent = t.chromeConflictHint;
    var list = $("chromeConflictList");
    list.textContent = "";
    var max = Math.min(analysis.conflicts.length, 40);
    for (var i = 0; i < max; i++) {
      var c = analysis.conflicts[i];
      var li = document.createElement("li");
      var titles = document.createElement("div");
      titles.className = "conflictTitles";
      var lib = document.createElement("span");
      lib.textContent = fmt(t.chromeConflictLib, { t: c.libraryTitle });
      var bro = document.createElement("span");
      bro.textContent = fmt(t.chromeConflictBrowser, { t: c.browserTitle || "—" });
      titles.appendChild(lib);
      titles.appendChild(bro);
      var url = document.createElement("div");
      url.className = "conflictUrl";
      url.textContent = c.url;
      li.appendChild(titles);
      li.appendChild(url);
      list.appendChild(li);
    }
    if (analysis.conflicts.length > max) {
      var more = document.createElement("li");
      more.textContent = "… +" + (analysis.conflicts.length - max);
      list.appendChild(more);
    }
    $("chromeConflictSkip").textContent = t.chromeConflictSkip;
    $("chromeConflictOverwrite").textContent = t.chromeConflictOverwrite;
    $("chromeConflictCancel").textContent = t.chromeConflictCancel;
    // Prefer-skip checkbox nudges the primary action.
    var preferSkip = $("exportChromeSkip").checked;
    $("chromeConflictSkip").classList.toggle("primary", preferSkip);
    $("chromeConflictSkip").classList.toggle("ghost", !preferSkip);
    $("chromeConflictOverwrite").classList.toggle("primary", !preferSkip);
    $("chromeConflictOverwrite").classList.toggle("ghost", preferSkip);
    $("chromeConflictDialog").showModal();
  });
}

async function overwriteChromeConflicts(conflicts) {
  var updated = 0;
  for (var i = 0; i < conflicts.length; i++) {
    var c = conflicts[i];
    if (!c.browserId) continue;
    try {
      await chrome.bookmarks.update(c.browserId, { title: c.libraryTitle || c.url });
      updated += 1;
    } catch (err) {
      /* best-effort title sync */
    }
  }
  return updated;
}

async function exportChromeWrite() {
  $("exportChromeStatus").textContent = "";
  if (!chromeBookmarksAvailable()) {
    $("exportChromeStatus").textContent = bookmarksPermissionDeniedMessage();
    return;
  }
  // ensureBookmarksPermission must be the first await after the click so
  // permissions.request keeps the user-gesture (see #107).
  if (!(await ensureBookmarksPermission())) {
    $("exportChromeStatus").textContent = bookmarksPermissionDeniedMessage();
    return;
  }
  if (!chrome.bookmarks) {
    $("exportChromeStatus").textContent = bookmarksPermissionDeniedMessage();
    return;
  }
  if (!$("exportChromeFolder").value) await populateChromeFolderSelect();
  var folderId = $("exportChromeFolder").value;
  if (!folderId) {
    $("exportChromeStatus").textContent = bookmarksPermissionDeniedMessage();
    return;
  }
  var clear = $("exportChromeClear").checked;
  var subtree = await chrome.bookmarks.getSubTree(folderId);
  var target = subtree && subtree[0];
  if (!target) {
    $("exportChromeStatus").textContent = t.exportChromeDenied;
    return;
  }
  if (clear && countSubtree(target) > 0) {
    var doomed = countSubtree(target);
    var confirmed = await new Promise(function (resolve) {
      confirmThen(
        fmt(t.exportChromeClearConfirm, { n: doomed }),
        function () {
          resolve(true);
        },
        function () {
          resolve(false);
        }
      );
    });
    if (!confirmed) return;
    for (var i = 0; i < target.children.length; i++) {
      await chrome.bookmarks.removeTree(target.children[i].id);
    }
  }

  var fresh = await chrome.bookmarks.getSubTree(folderId);
  var current = fresh && fresh[0];
  var existingMap = Object.create(null);
  collectSubtreeUrlMap(current, existingMap);
  var analysis = Bookmarks.collectChromeWriteConflicts(state.model, existingMap);
  var mode = "skip"; // after clear, no conflicts expected
  if (analysis.conflicts.length > 0) {
    mode = await promptChromeConflicts(analysis);
    if (mode === "cancel") return;
  }

  var existingUrls = Object.keys(existingMap);
  var created = 0;
  var updated = 0;
  if (mode === "overwrite") {
    updated = await overwriteChromeConflicts(analysis.conflicts);
    // Create only URLs that are not already present.
    var plan = Bookmarks.buildChromeWritePlan(state.model, existingUrls, {
      skipDuplicates: true,
    });
    created = await createChromePlan(plan, folderId);
  } else {
    // skip conflicts (default) — never silently duplicate same URL
    var planSkip = Bookmarks.buildChromeWritePlan(state.model, existingUrls, {
      skipDuplicates: true,
    });
    created = await createChromePlan(planSkip, folderId);
  }
  $("exportDialog").close();
  flashStatus(fmt(t.exportChromeDone, { n: created + updated }));
}

/* ---------- HamHome round-trip write (#64) ---------- */

async function exportHamHomeWrite() {
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    showBanner(t.needConfig, t.openSettings, openSettings);
    return;
  }
  var hh = DavflareDav.createDavClient({
    instanceUrl: made.cfg.instanceUrl,
    username: made.cfg.username,
    password: made.cfg.password,
    basePath: "HamHomeSync",
  });
  // Read the current remote tree first: our entries merge into it so
  // HamHome's own sync never loses data (#64).
  var meta = await hh.getFile("bookmarks/meta.json");
  if (!meta.ok) {
    showBanner(errorText(meta.kind), t.openSettings, openSettings);
    return;
  }
  var cats = await hh.getFile("categories.json");
  // Abort on read failure — never treat a network/auth error as "empty remote"
  // or we would overwrite HamHome categories.json with a rebuilt tree (#80 review).
  if (!cats.ok) {
    showBanner(errorText(cats.kind), t.openSettings, openSettings);
    return;
  }
  var res = HamHome.exportTo(
    state.model,
    meta.missing ? null : meta.text,
    cats.missing ? null : cats.text,
    Date.now()
  );
  if (!res.ok) {
    showBanner(t.hhInvalid);
    return;
  }
  var putCats = await hh.putFile(
    "categories.json",
    res.categories,
    "application/json; charset=utf-8"
  );
  if (!putCats.ok) {
    showBanner(errorText(putCats.kind), t.openSettings, openSettings);
    return;
  }
  // meta.json last, mirroring HamHome's own safe write order.
  var putMeta = await hh.putFile(
    "bookmarks/meta.json",
    res.meta,
    "application/json; charset=utf-8"
  );
  if (!putMeta.ok) {
    showBanner(errorText(putMeta.kind), t.openSettings, openSettings);
    return;
  }
  $("exportDialog").close();
  flashStatus(t.exportedHamHome);
}

/* ---------- import dialog (issue #65) ---------- */

function openImportDialog() {
  $("importStatus").textContent = "";
  $("importFile").value = "";
  $("importDialog").showModal();
}

function openExportDialog() {
  $("exportChromeStatus").textContent = "";
  $("exportDialog").showModal();
  // Pre-fill the Chrome folder list when permission is already granted;
  // otherwise exportChromeWrite asks for it on demand.
  if (chromeBookmarksAvailable()) {
    chrome.permissions
      .contains({ permissions: ["bookmarks"] })
      .then(function (granted) {
        if (granted && !$("exportChromeFolder").value) populateChromeFolderSelect();
      })
      .catch(function () {});
  }
}

/**
 * File import (issue #65): read the picked backup file, merge it into the
 * library by URL and report the count. JSON (Davflare or HamHome shape) and
 * Netscape HTML are both accepted; detection lives in Bookmarks.importBackup.
 */
async function onImportFilePicked(event) {
  var file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  $("importStatus").textContent = "";
  var text;
  try {
    text = await file.text();
  } catch (err) {
    $("importStatus").textContent = t.importInvalid;
    return;
  }
  var res = Bookmarks.importBackup(text, HamHome);
  if (!res.ok) {
    $("importStatus").textContent = res.reason === "empty" ? t.importEmpty : t.importInvalid;
    return;
  }
  var before = state.model.bookmarks.length;
  state.model = Bookmarks.mergeModels(state.model, res.model);
  var added = state.model.bookmarks.length - before;
  $("importDialog").close();
  var ok = await persist();
  if (ok) flashStatus(fmt(added > 0 ? t.importDone : t.importNone, { n: added }));
}

/* ---------- dialogs ---------- */

function confirmThen(message, fn, onCancel) {
  pendingConfirm = fn;
  pendingConfirmCancel = typeof onCancel === "function" ? onCancel : null;
  $("confirmText").textContent = message;
  $("confirmDialog").showModal();
}

function clearPendingConfirm() {
  var cancel = pendingConfirmCancel;
  pendingConfirm = null;
  pendingConfirmCancel = null;
  return cancel;
}

function openWsNameDialog(workspace, pendingPages) {
  editingWsId = workspace ? workspace.id : null;
  openWsNameDialog.pendingPages = pendingPages || null;
  $("wsNameError").textContent = "";
  $("wsNameInput").value = workspace
    ? workspace.name
    : new Date().toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
  $("wsNameDialog").showModal();
  $("wsNameInput").focus();
}

async function submitWsName(event) {
  event.preventDefault();
  var name = $("wsNameInput").value.trim();
  if (!name) {
    $("wsNameError").textContent = t.invalidName;
    return;
  }
  if (editingWsId) {
    appState.workspaces = Workspaces.rename(appState.workspaces, editingWsId, name);
  } else if (openWsNameDialog.pendingPages) {
    var ws = Workspaces.create(name, openWsNameDialog.pendingPages, Date.now());
    appState.workspaces = Workspaces.upsert(appState.workspaces, ws);
    openWsNameDialog.pendingPages = null;
  }
  $("wsNameDialog").close();
  if (await persistWorkspaces()) renderWorkspaces();
}

/* ---------- boot ---------- */

function fillSinceSelect() {
  var select = $("sinceSelect");
  var options = [
    ["all", t.sinceAll],
    ["today", t.sinceToday],
    ["week", t.sinceWeek],
    ["month", t.sinceMonth],
    ["year", t.sinceYear],
  ];
  for (var i = 0; i < options.length; i++) {
    var option = document.createElement("option");
    option.value = options[i][0];
    option.textContent = options[i][1];
    select.appendChild(option);
  }
  select.value = "all";
}

function fillSortSelect() {
  var select = $("sortSelect");
  if (!select) return;
  var options = [
    ["default", t.sortDefault],
    ["latest", t.sortLatest],
    ["oldest", t.sortOldest],
    ["title", t.sortTitle],
    ["domain", t.sortDomain],
  ];
  for (var i = 0; i < options.length; i++) {
    var option = document.createElement("option");
    option.value = options[i][0];
    option.textContent = options[i][1];
    select.appendChild(option);
  }
  select.value = state.sort;
}

function fillColorSelect() {
  var select = $("ruleColor");
  var colors = TabRules.COLORS;
  for (var i = 0; i < colors.length; i++) {
    var option = document.createElement("option");
    option.value = colors[i];
    option.textContent = colors[i];
    select.appendChild(option);
  }
}

function applyCopy() {
  document.title = t.title;
  $("brandSub").textContent = t.brandSub;
  $("switchBookmarks").textContent = t.viewBookmarks;
  $("switchDrive").textContent = t.drive;
  $("driveRefresh").textContent = t.driveReload;
  $("driveExternal").textContent = t.driveOpenExternal;
  $("libRefresh").textContent = t.libReload;
  $("switchWorkspaces").textContent = t.viewWorkspaces;
  $("switchTabRules").textContent = t.viewTabRules;
  $("switchSettings").textContent = t.viewSettings;
  $("navAllText").textContent = t.navAll;
  $("navPinnedText").textContent = t.navPinned;
  $("navTrashText").textContent = t.navTrash;
  $("navDuplicatesText").textContent = t.navDuplicates;
  if ($("favoritesTitle")) $("favoritesTitle").textContent = t.favoritesTitle;
  $("folderTitle").textContent = t.folders;
  $("folderAddBtn").title = t.folderAdd;
  $("tagTitle").textContent = t.tags;
  if ($("sortSelect")) {
    $("sortSelect").title = t.sortLabel;
    $("sortSelect").setAttribute("aria-label", t.sortLabel);
  }
  $("search").placeholder = t.searchPlaceholder;
  $("selAllBtn").textContent = t.selAll;
  $("batchMove").textContent = t.batchMove;
  $("batchTags").textContent = t.batchTags;
  $("batchDelete").textContent = t.batchDelete;
  $("batchMoveTitle").textContent = t.batchMoveTitle;
  $("batchMoveLabel").textContent = t.batchMoveLabel;
  $("batchMoveHint").textContent = t.batchMoveHint;
  $("batchMoveSave").textContent = t.batchMoveBtn;
  $("batchTagsTitle").textContent = t.batchTagsTitle;
  $("batchTagsAddLabel").textContent = t.batchTagsAdd;
  $("batchTagsRemoveLabel").textContent = t.batchTagsRemove;
  $("folderNameLabel").textContent = t.folderNameLabel;
  $("folderNameHint").textContent = t.folderNameHint;
  $("exportChromeLegend").textContent = t.exportChromeLegend;
  if ($("exportChromeConflictNote")) {
    $("exportChromeConflictNote").textContent = t.exportChromeConflictNote;
  }
  $("exportChromeFolderLabel").textContent = t.exportChromeFolderLabel;
  $("exportChromeSkipText").textContent = t.exportChromeSkip;
  $("exportChromeClearText").textContent = t.exportChromeClear;
  $("exportChromeBtn").textContent = t.exportChromeBtn;
  if ($("chromeConflictTitle")) {
    $("chromeConflictTitle").textContent = t.chromeConflictTitle;
    $("chromeConflictHint").textContent = t.chromeConflictHint;
    $("chromeConflictSkip").textContent = t.chromeConflictSkip;
    $("chromeConflictOverwrite").textContent = t.chromeConflictOverwrite;
    $("chromeConflictCancel").textContent = t.chromeConflictCancel;
  }
  $("exportHhLegend").textContent = t.exportHhLegend;
  $("exportHhHint").textContent = t.exportHhHint;
  $("exportHamHomeBtn").textContent = t.exportHhBtn;
  $("presetSave").title = t.presetSaveTitle;
  $("presetDelete").title = t.presetDeleteTitle;
  $("presetDialogTitle").textContent = t.presetDialogTitle;
  $("presetNameLabel").textContent = t.presetNameLabel;
  $("presetSaveBtn").textContent = t.save;
  $("addBtn").textContent = t.add;
  $("importBtn").textContent = t.import;
  $("exportBtn").textContent = t.export;
  $("importDialogTitle").textContent = t.importDialogTitle;
  $("importDesc").textContent = t.importDesc;
  $("importPick").textContent = t.importPick;
  $("importAltLegend").textContent = t.importAltLegend;
  $("importBrowserBtn").textContent = t.importBrowser;
  $("importHamHomeBtn").textContent = t.importHamHomeSync;
  $("importCancel").textContent = t.cancel;
  $("exportDialogTitle").textContent = t.exportDialogTitle;
  $("exportDesc").textContent = t.exportDesc;
  $("exportHtmlBtn").textContent = t.exportHtmlAction;
  $("exportJsonBtn").textContent = t.exportJsonAction;
  $("exportCancel").textContent = t.cancel;
  $("driveBtn").textContent = t.drive;
  $("settingsBtn").textContent = t.settings;
  $("moreText").textContent = t.moreLabel;
  $("addDialogTitle").textContent = t.addDialogTitle;
  $("addUrlLabel").textContent = t.urlLabel;
  $("addTitleLabel").textContent = t.titleLabel;
  $("addCancel").textContent = t.cancel;
  $("addSave").textContent = t.add;
  $("tagDialogTitle").textContent = t.tagDialogTitle;
  $("tagInputLabel").textContent = t.tagInputLabel;
  $("noteInputLabel").textContent = t.noteInputLabel;
  $("tagCancel").textContent = t.cancel;
  $("tagSave").textContent = t.save;
  $("wsNameTitle").textContent = t.wsNameTitle;
  $("wsNameCancel").textContent = t.cancel;
  $("wsNameSave").textContent = t.save;
  if ($("wsRefresh")) $("wsRefresh").textContent = t.wsReload;
  if ($("saveWindowBtn")) $("saveWindowBtn").textContent = t.saveWindow;
  $("ruleDialogTitle").textContent = t.ruleDialogTitle;
  $("ruleDomainLabel").textContent = t.ruleDomainLabel;
  $("ruleUrlLabel").textContent = t.ruleUrlLabel;
  $("ruleTitleLabel").textContent = t.ruleTitleLabel;
  $("ruleRegexLabel").textContent = t.ruleRegexLabel;
  $("ruleNameLabel").textContent = t.ruleNameLabel;
  $("ruleColorLabel").textContent = t.ruleColorLabel;
  $("ruleOrderLabel").textContent = t.ruleOrderLabel;
  $("ruleCollapsedText").textContent = t.ruleCollapsedText;
  $("ruleCancel").textContent = t.cancel;
  $("ruleSave").textContent = t.save;
  $("confirmCancel").textContent = t.cancel;
  $("confirmOk").textContent = t.deleteLabel;
  $("saveWindowBtn").textContent = t.saveWindow;
  $("applyGroupsBtn").textContent = t.groupCurrentWindow;
  $("ruleAddBtn").textContent = t.ruleAdd;
  $("fallbackText").textContent = t.fallbackText;
  $("snapLegend").textContent = t.snapLegend;
  $("snapView").textContent = t.snapView;
  $("snapDownload").textContent = t.snapDownload;
  $("snapDelete").textContent = t.snapDelete;
  $("urlLabel").textContent = t.settingsUrlLabel;
  $("urlHint").textContent = t.urlHint;
  $("pathLabel").textContent = t.pathLabel;
  $("pathHint").textContent = t.pathHint;
  $("modeLabel").textContent = t.modeLabel;
  $("modeDriveText").textContent = t.modeDrive;
  $("modeBookmarksText").textContent = t.modeBookmarks;
  $("modeHint").textContent = t.modeHint;
  $("davLabel").textContent = t.davLabel;
  $("userLabel").textContent = t.userLabel;
  $("passLabel").textContent = t.passLabel;
  $("davHint").textContent = t.davHint;
  $("settingsSave").textContent = t.save;
  $("testConn").textContent = t.testConn;
  if ($("storageLegend")) $("storageLegend").textContent = t.storageLegend;
  if ($("storageBookmarksLabel")) $("storageBookmarksLabel").textContent = t.storageBookmarks;
  if ($("storageWorkspacesLabel")) $("storageWorkspacesLabel").textContent = t.storageWorkspaces;
  if ($("storageTabRulesLabel")) $("storageTabRulesLabel").textContent = t.storageTabRules;
  if ($("storageSnapsLabel")) $("storageSnapsLabel").textContent = t.storageSnaps;
  if ($("storageTotalLabel")) $("storageTotalLabel").textContent = t.storageTotal;
  if ($("storageNote")) $("storageNote").textContent = t.storageNote;
  if ($("storageRefresh")) $("storageRefresh").textContent = t.storageRefresh;
  if ($("shortcutLegend")) $("shortcutLegend").textContent = t.shortcutLegend;
  if ($("shortcutsHint")) $("shortcutsHint").textContent = t.shortcutsHint;
}

/** Settings "Keyboard shortcuts" row (round 4): live values from Chrome so
 *  users can see (and learn) what is actually configured. */
function renderShortcuts() {
  var list = $("shortcutList");
  if (!list || !chrome.commands || typeof chrome.commands.getAll !== "function") return;
  chrome.commands.getAll(function (commands) {
    var byName = {};
    for (var i = 0; i < (commands || []).length; i++) {
      if (commands[i] && commands[i].name) byName[commands[i].name] = commands[i];
    }
    var rows = [
      { name: "save-current-page", label: t.shortcutSavePage },
      { name: "toggle-edge-panel", label: t.shortcutEdgePanel },
    ];
    list.textContent = "";
    for (var j = 0; j < rows.length; j++) {
      var cmd = byName[rows[j].name];
      if (!cmd) continue;
      var row = document.createElement("div");
      var dt = document.createElement("dt");
      var dd = document.createElement("dd");
      dt.textContent = rows[j].label;
      dd.textContent = cmd.shortcut || t.shortcutNone;
      if (!cmd.shortcut) dd.classList.add("shortcutMissing");
      row.appendChild(dt);
      row.appendChild(dd);
      list.appendChild(row);
    }
  });
}

function setView(view) {
  state.view = view;
  writeLocalPref(VIEW_KEY, view);
  $("viewGrid").classList.toggle("active", view === "grid");
  $("viewList").classList.toggle("active", view === "list");
  renderItems();
}

function setFilterAll() {
  applyLibraryFilter({ kind: "all", value: "" });
}

function wireEvents() {
  $("switchBookmarks").addEventListener("click", function () {
    switchView("bookmarks");
  });
  $("switchDrive").addEventListener("click", function () {
    switchView("drive");
  });
  $("driveRefresh").addEventListener("click", function () {
    if (window.DavflareDrive && driveMountedUrl) window.DavflareDrive.reload();
  });
  // 显式刷新入口（#77）：条件 GET，未变更时 304 秒回；外部写入漏报
  // （如缓存写入失败）时用它兜底。
  $("libRefresh").addEventListener("click", function () {
    refresh();
  });
  $("driveExternal").addEventListener("click", async function () {
    var cfg = await loadConfig();
    if (cfg.instanceUrl) chrome.tabs.create({ url: cfg.instanceUrl });
    else openSettings();
  });
  $("switchWorkspaces").addEventListener("click", function () {
    switchView("workspaces");
  });
  $("switchTabRules").addEventListener("click", function () {
    switchView("tabRules");
  });
  $("switchSettings").addEventListener("click", function () {
    switchView("settings");
  });
  $("settingsForm").addEventListener("submit", saveSettings);
  $("testConn").addEventListener("click", testConnection);
  if ($("storageRefresh")) {
    $("storageRefresh").addEventListener("click", function () {
      refreshStoragePanel();
    });
  }
  wirePopMenus();
  $("undoBtn").addEventListener("click", function () {
    undoDelete();
  });
  $("moveCancel").addEventListener("click", function () {
    $("moveDialog").close();
  });
  // 侧栏「更多」菜单项执行后收起菜单
  var footMenuItems = document.querySelectorAll("#moreMenu button");
  for (var mi = 0; mi < footMenuItems.length; mi++) {
    footMenuItems[mi].addEventListener("click", closePopMenus);
  }
  $("navAll").addEventListener("click", setFilterAll);
  $("navPinned").addEventListener("click", function () {
    applyLibraryFilter({ kind: "pinned", value: "" });
  });
  $("navTrash").addEventListener("click", function () {
    switchView("trash");
  });
  $("navDuplicates").addEventListener("click", function () {
    switchView("duplicates");
  });
  $("trashRestoreSel").addEventListener("click", restoreSelectedTrash);
  $("trashEmpty").addEventListener("click", emptyTrash);
  $("dupKeepOldestAll").addEventListener("click", keepOldestAllDuplicates);
  $("folderAddBtn").addEventListener("click", function () {
    openFolderDialog("new", "");
  });
  $("folderCancel").addEventListener("click", function () {
    $("folderDialog").close();
  });
  $("folderForm").addEventListener("submit", submitFolderDialog);
  $("selAllBtn").addEventListener("click", toggleSelAll);
  $("batchCancel").addEventListener("click", function () {
    clearSelection();
    renderItems();
  });
  $("batchMove").addEventListener("click", openBatchMoveDialog);
  $("batchMoveCancel").addEventListener("click", function () {
    $("batchMoveDialog").close();
  });
  $("batchMoveForm").addEventListener("submit", submitBatchMove);
  $("batchTags").addEventListener("click", openBatchTagsDialog);
  $("batchTagsCancel").addEventListener("click", function () {
    $("batchTagsDialog").close();
  });
  $("batchTagsForm").addEventListener("submit", submitBatchTags);
  $("batchPin").addEventListener("click", function () {
    submitBatchPin();
  });
  $("batchDelete").addEventListener("click", submitBatchDelete);
  // Search debounce (large libraries rebuild the whole list per keystroke);
  // deep-links / programmatic resets call renderItems directly, so only the
  // typing path defers.
  var searchTimer = null;
  $("search").addEventListener("input", function (event) {
    state.query = event.target.value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      searchTimer = null;
      renderItems();
    }, 180);
  });
  $("folderSelect").addEventListener("change", function (event) {
    var value = event.target.value;
    state.filter = value === "all" ? { kind: "all", value: "" } : { kind: "folder", value: value };
    renderAll();
  });
  $("sinceSelect").addEventListener("change", function (event) {
    state.since = event.target.value;
    renderItems();
    // since alone can make/break an active preset match (#84 / #82).
    renderPresetSelect();
  });
  $("sortSelect").addEventListener("change", function (event) {
    state.sort = BookmarksView.SORT_KEYS.indexOf(event.target.value) !== -1
      ? event.target.value
      : "default";
    writeLocalPref(SORT_KEY, state.sort);
    renderItems();
  });
  $("presetSelect").addEventListener("change", function (event) {
    applyPreset(event.target.value);
  });
  $("presetSave").addEventListener("click", openPresetDialog);
  $("presetDelete").addEventListener("click", deleteActivePreset);
  $("presetCancel").addEventListener("click", function () {
    $("presetDialog").close();
  });
  $("presetForm").addEventListener("submit", submitPreset);
  $("viewGrid").addEventListener("click", function () {
    setView("grid");
  });
  $("viewList").addEventListener("click", function () {
    setView("list");
  });
  $("themeToggle").addEventListener("click", toggleTheme);
  $("addBtn").addEventListener("click", openAddDialog);
  $("addCancel").addEventListener("click", function () {
    $("addDialog").close();
  });
  $("addForm").addEventListener("submit", submitAdd);
  $("tagCancel").addEventListener("click", function () {
    $("tagDialog").close();
  });
  $("tagForm").addEventListener("submit", submitTagForm);
  $("snapCapture").addEventListener("click", function () {
    captureSnapshotFor(tagDialogBookmark);
  });
  $("snapView").addEventListener("click", function () {
    var entry =
      tagDialogBookmark &&
      Snapshots.findByBookmarkId(appState.snapshots, tagDialogBookmark.id);
    if (entry) viewSnapshot(entry);
  });
  $("snapDownload").addEventListener("click", function () {
    var entry =
      tagDialogBookmark &&
      Snapshots.findByBookmarkId(appState.snapshots, tagDialogBookmark.id);
    if (entry) downloadSnapshot(entry);
  });
  $("snapDelete").addEventListener("click", function () {
    var entry =
      tagDialogBookmark &&
      Snapshots.findByBookmarkId(appState.snapshots, tagDialogBookmark.id);
    if (!entry) return;
    confirmThen(t.snapConfirmDelete, function () {
      deleteSnapshot(entry);
    });
  });
  $("wsNameCancel").addEventListener("click", function () {
    openWsNameDialog.pendingPages = null;
    $("wsNameDialog").close();
  });
  $("wsNameForm").addEventListener("submit", submitWsName);
  $("ruleAddBtn").addEventListener("click", function () {
    openRuleDialog(null);
  });
  $("ruleCancel").addEventListener("click", function () {
    $("ruleDialog").close();
  });
  $("ruleForm").addEventListener("submit", submitRule);
  $("applyGroupsBtn").addEventListener("click", applyGroupsToCurrentWindow);
  $("fallbackDomain").addEventListener("change", async function (event) {
    appState.tabRules = TabRules.normalize({
      fallbackDomain: event.target.checked,
      rules: appState.tabRules.rules,
    });
    if (await persistTabRules()) renderTabRules();
  });
  $("confirmCancel").addEventListener("click", function () {
    var cancel = clearPendingConfirm();
    $("confirmDialog").close();
    if (cancel) cancel();
  });
  $("confirmDialog").addEventListener("cancel", function () {
    // Escape closes the dialog; treat as cancel so awaiters do not hang.
    var cancel = clearPendingConfirm();
    if (cancel) cancel();
  });
  $("confirmOk").addEventListener("click", function () {
    var fn = pendingConfirm;
    pendingConfirmCancel = null;
    pendingConfirm = null;
    $("confirmDialog").close();
    if (fn) fn();
  });
  $("importBtn").addEventListener("click", openImportDialog);
  $("exportBtn").addEventListener("click", openExportDialog);
  $("importPick").addEventListener("click", function () {
    $("importFile").click();
  });
  $("importFile").addEventListener("change", onImportFilePicked);
  $("importBrowserBtn").addEventListener("click", function () {
    $("importDialog").close();
    importChromeBookmarks();
  });
  $("importHamHomeBtn").addEventListener("click", function () {
    $("importDialog").close();
    importHamHome();
  });
  $("importCancel").addEventListener("click", function () {
    $("importDialog").close();
  });
  $("exportHtmlBtn").addEventListener("click", function () {
    $("exportDialog").close();
    exportHtml();
  });
  $("exportJsonBtn").addEventListener("click", function () {
    $("exportDialog").close();
    exportJson();
  });
  $("exportChromeBtn").addEventListener("click", exportChromeWrite);
  if ($("chromeConflictCancel")) {
    $("chromeConflictCancel").addEventListener("click", function () {
      closeChromeConflictDialog("cancel");
    });
    $("chromeConflictSkip").addEventListener("click", function () {
      closeChromeConflictDialog("skip");
    });
    $("chromeConflictOverwrite").addEventListener("click", function () {
      closeChromeConflictDialog("overwrite");
    });
    $("chromeConflictDialog").addEventListener("cancel", function () {
      closeChromeConflictDialog("cancel");
    });
  }
  $("exportHamHomeBtn").addEventListener("click", exportHamHomeWrite);
  $("exportCancel").addEventListener("click", function () {
    $("exportDialog").close();
  });
  $("settingsBtn").addEventListener("click", openSettings);
  $("saveWindowBtn").addEventListener("click", saveCurrentWindow);
  if ($("wsRefresh")) {
    $("wsRefresh").addEventListener("click", function () {
      loadWorkspaces();
    });
  }
  $("driveBtn").addEventListener("click", function () {
    switchView("drive");
  });
  document.addEventListener("keydown", function (event) {
    var target = event.target;
    var typing =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        (target instanceof HTMLElement && target.tagName === "SELECT"));
    var dialogOpen = Boolean(document.querySelector("dialog[open]"));
    if (event.key === "/" && !typing && !dialogOpen) {
      event.preventDefault();
      $("search").focus();
      return;
    }
    // Esc closes a card/folder ⋯ menu and hands focus back to its toggle
    // (native <dialog> handles its own Esc).
    if (event.key === "Escape") {
      var openMenu = document.querySelector(".popMenu.open");
      if (openMenu) {
        event.preventDefault();
        var toggle = openMenu.parentElement.querySelector(".menuToggle");
        closePopMenus();
        if (toggle) toggle.focus();
      }
      return;
    }
    if (typing || dialogOpen) return;
    // Delete / Backspace removes the current selection (same confirm as the
    // batch-bar button). Library views without a bookmark selection
    // (trash/duplicates manage their own picks) are left alone.
    if (event.key === "Delete" || event.key === "Backspace") {
      var sel = appState.view === "bookmarks" ? selectedExistingIds() : [];
      if (sel.length) {
        event.preventDefault();
        submitBatchDelete();
      }
      return;
    }
    // Arrow keys walk the keyboard focus between cards / list rows;
    // Home/End jump to the first/last one. Inside an open ⋯ menu they
    // cycle the menu items instead (menus live inside cards, so check
    // that first).
    var active = document.activeElement;
    // Any open ⋯ menu owns ArrowUp/Down — also when it was opened with the
    // mouse and focus is still on its toggle (or on <body>): the first
    // press moves focus to the first/last item instead of walking cards.
    var openPop = document.querySelector(".popMenu.open");
    if (openPop && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      cyclePopMenuFocus(openPop, event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    var isHome = event.key === "Home";
    var isEnd = event.key === "End";
    var dir =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (!dir && !isHome && !isEnd) return;
    if (active && active.closest && active.closest(".card, .row")) {
      event.preventDefault();
      focusAdjacentItem(active, dir, isHome, isEnd);
    }
  });
}

/** Cycle keyboard focus across the buttons of an open ⋯ menu (wraps). */
function cyclePopMenuFocus(menu, dir) {
  var items = menu.querySelectorAll("button");
  if (!items.length) return;
  var idx = Array.prototype.indexOf.call(items, document.activeElement);
  var next = idx + dir;
  if (idx === -1) next = dir > 0 ? 0 : items.length - 1;
  else if (next < 0) next = items.length - 1;
  else if (next >= items.length) next = 0;
  items[next].focus();
}

/**
 * Move focus to the adjacent card/row's main link (roving within the
 * current grid/list). Home/End jump to the first/last item. The walk order
 * is dataset.idx (filteredItemsOrdered 顺序)——瀑布流把卡片分进各列后 DOM
 * 顺序是列优先，键盘仍按行优先语义行走。
 */
function focusAdjacentItem(from, dir, home, end) {
  var node = from.closest(".card, .row");
  if (!node) return;
  var container = node.closest("#cards, #rows");
  if (!container) return;
  var nodes = container.querySelectorAll(".card:not(.skel), .row:not(.skel)");
  var list = Array.prototype.slice.call(nodes);
  list.sort(function (a, b) {
    return Number(a.dataset.idx || 0) - Number(b.dataset.idx || 0);
  });
  if (!list.length) return;
  var target = null;
  if (home) target = list[0];
  else if (end) target = list[list.length - 1];
  else {
    var idx = list.indexOf(node);
    target = list[idx + dir];
  }
  if (!target || target === node) return;
  var link = target.querySelector("a");
  if (link) link.focus();
}

applyCopy();
fillSinceSelect();
fillSortSelect();
fillColorSelect();
// Restore the persisted grid/list choice into the toggle buttons.
setView(state.view);
loadPresets();
loadFavorites().then(function () {
  renderFavoritesNav();
});
warmBookmarksPermissionCache();
loadSnapshots();
renderShortcuts();
initTheme();
wireEvents();
window.addEventListener("resize", onMasonryResize);
renderFromCache();
// 主页初始视图：显式 ?view= 优先；否则跟随「插件主页默认视图」设置
// （resolveToolbarTarget 在未配置实例时指向 settings，保持先配置后使用）。
void (async function () {
  var params = null;
  try {
    params = new URLSearchParams(location.search);
  } catch (err) {
    params = null;
  }
  var requested = params ? params.get("view") : null;
  var query = params ? params.get("q") : null;
  if (requested && VALID_VIEWS.indexOf(requested) !== -1) {
    switchView(requested);
  } else {
    var stored = await chrome.storage.sync.get(["instanceUrl", "toolbarMode"]);
    switchView(resolveToolbarTarget(stored).action);
  }
  // Omnibox deep-link: ?q= forces the library view with the search box filled.
  if (query && String(query).trim()) {
    switchView("bookmarks");
    state.query = String(query).trim();
    var search = $("search");
    if (search) search.value = state.query;
    renderAll();
  }
  var cfg = await loadConfig();
  if (cfg.instanceUrl || appState.view === "settings") return;
  // Don't steal focus from an omnibox search deep-link.
  if (query && String(query).trim()) return;
  switchView("settings");
  showIn("bannerSettings", t.setupHint);
})();
refresh();
