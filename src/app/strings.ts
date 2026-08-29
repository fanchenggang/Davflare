import React from "react";

export type Lang = "zh" | "en";

export const APP_NAME = "FlareDrive";

type Entry = { zh: string; en: string };

// 双语字典：zh 为原文，en 为英文版。新增文案时两个语言都要补。
const entries: Record<string, Entry> = {
  searchPlaceholder: { zh: "搜索文件", en: "Search files" },
  searchShortcutHint: { zh: "按 / 或 Ctrl+K 搜索", en: "Press / or Ctrl+K to search" },
  upload: { zh: "上传", en: "Upload" },
  uploadFile: { zh: "上传文件", en: "Upload file" },
  uploadImageVideo: { zh: "上传图片/视频", en: "Upload image/video" },
  uploadFolder: { zh: "上传文件夹", en: "Upload folder" },
  takePhoto: { zh: "拍照", en: "Take photo" },
  createFolder: { zh: "新建文件夹", en: "New folder" },
  openTextPad: { zh: "记事本", en: "Notepad" },
  noFiles: { zh: "这里还没有文件", en: "Nothing here yet" },
  noFilesHint: { zh: "上传文件，或新建一个文件夹", en: "Upload a file, or create a folder" },
  noSearchResult: { zh: "没有找到文件", en: "No files found" },
  noSearchResultHint: { zh: "换个关键词，或切换搜索范围", en: "Try another keyword, or switch the search scope" },
  emptyTrash: { zh: "回收站是空的", en: "Trash is empty" },
  emptyTrashHint: { zh: "删除的文件会出现在这里，可随时恢复", en: "Deleted files appear here and can be restored anytime" },
  emptyShares: { zh: "还没有分享", en: "No shares yet" },
  emptySharesHint: { zh: "在文件上点 ⋯ 即可生成链接", en: "Click ⋯ on a file to create a link" },
  goToFiles: { zh: "去文件页", en: "Go to files" },
  clearSearch: { zh: "清空搜索", en: "Clear search" },
  files: { zh: "文件", en: "Files" },
  shares: { zh: "分享", en: "Shares" },
  trash: { zh: "回收站", en: "Trash" },
  select: { zh: "选择", en: "Select" },
  paste: { zh: "粘贴", en: "Paste" },
  allFiles: { zh: "全部文件", en: "All files" },
  open: { zh: "打开", en: "Open" },
  download: { zh: "下载", en: "Download" },
  rename: { zh: "重命名", en: "Rename" },
  move: { zh: "移动", en: "Move" },
  share: { zh: "分享", en: "Share" },
  copy: { zh: "复制", en: "Copy" },
  cut: { zh: "剪切", en: "Cut" },
  delete: { zh: "删除", en: "Delete" },
  login: { zh: "登录", en: "Sign in" },
  logout: { zh: "退出登录", en: "Sign out" },
  transfers: { zh: "上传任务", en: "Upload tasks" },
  webdav: { zh: "WebDAV", en: "WebDAV" },
  typeAll: { zh: "全部", en: "All" },
  typeImage: { zh: "图片", en: "Images" },
  typeVideo: { zh: "视频", en: "Videos" },
  typeDoc: { zh: "文档", en: "Docs" },
  typeOther: { zh: "其他", en: "Other" },
  showHidden: { zh: "显示隐藏文件", en: "Show hidden files" },
  searchHere: { zh: "当前文件夹", en: "Current folder" },
  searchAll: { zh: "全盘搜索", en: "Search all" },
  colName: { zh: "名称", en: "Name" },
  colSize: { zh: "大小", en: "Size" },
  colDate: { zh: "修改时间", en: "Modified" },
  folderLabel: { zh: "文件夹", en: "Folder" },
  dropToUpload: { zh: "松手上传到当前目录", en: "Drop to upload to the current folder" },
  prevFile: { zh: "上一个", en: "Previous" },
  nextFile: { zh: "下一个", en: "Next" },
  create: { zh: "新建", en: "Create" },
  newFolderOrNote: { zh: "新建文件夹或记事本", en: "New folder or note" },
  pastedImage: { zh: "粘贴图片", en: "Pasted image" },
  copyPath: { zh: "复制路径", en: "Copy path" },
  recent: { zh: "最近", en: "Recent" },
  noRecent: { zh: "暂无最近打开", en: "Nothing opened recently" },
  densityStandard: { zh: "标准", en: "Standard" },
  densityCompact: { zh: "紧凑", en: "Compact" },
  extractCode: { zh: "提取码", en: "Extract code" },
  extractCodeOptional: { zh: "提取码（可选）", en: "Extract code (optional)" },
  extractCodeHint: { zh: "留空则无需提取码", en: "Leave empty for no extract code" },
  folderItems: { zh: "项", en: "items" },
  copyWebDavGuide: { zh: "复制完整说明", en: "Copy full guide" },
  api: { zh: "API", en: "API" },
  apiKeys: { zh: "开放接口", en: "API keys" },
  apiKeysHint: {
    zh: "用密钥通过接口上传、下载、列出并双向同步（冲突时保留本地、先备份远端），完整密钥只显示一次",
    en: "Use keys to upload, download, list and sync via API (local wins on conflict, remote backed up first). Full keys are shown once",
  },
  createApiKey: { zh: "创建密钥", en: "Create key" },
  revokeApiKey: { zh: "作废", en: "Revoke" },
  apiKeyName: { zh: "名称", en: "Name" },
  apiKeyExpiry: { zh: "有效期", en: "Expires in" },
  apiKeyCustom: { zh: "自定义密钥（可选）", en: "Custom key (optional)" },
  apiKeyCustomHint: { zh: "留空则自动生成高熵密钥", en: "Leave empty to auto-generate a high-entropy key" },
  apiKeyOnce: { zh: "请立即复制，关闭后无法再查看完整密钥", en: "Copy it now — the full key cannot be viewed again after closing" },
  copyApiKey: { zh: "复制密钥", en: "Copy key" },
  copyUsage: { zh: "复制调用说明", en: "Copy usage" },
  apiUsage: { zh: "调用说明", en: "Usage" },
  apiNever: { zh: "永久", en: "Never" },
  apiLastUsed: { zh: "最近使用", en: "Last used" },
  apiNeverUsed: { zh: "尚未使用", en: "Never used" },
  apiNoKeys: { zh: "还没有 API 密钥", en: "No API keys yet" },
  apiExpiry1d: { zh: "1 天", en: "1 day" },
  apiExpiry7d: { zh: "7 天", en: "7 days" },
  apiExpiry30d: { zh: "30 天", en: "30 days" },
  apiExpiryCustom: { zh: "自定义小时数", en: "Custom hours" },
  theme: { zh: "外观", en: "Appearance" },
  themeLight: { zh: "浅色", en: "Light" },
  themeDark: { zh: "深色", en: "Dark" },
  themeSystem: { zh: "跟随系统", en: "System" },
  undo: { zh: "撤销", en: "Undo" },
  retry: { zh: "重试", en: "Retry" },
  pausedAll: { zh: "已全部暂停", en: "All paused" },
  resumedAll: { zh: "已全部恢复", en: "All resumed" },
  rotate: { zh: "旋转 90°", en: "Rotate 90°" },
  playbackSpeed: { zh: "播放倍速", en: "Playback speed" },
  siblingFolders: { zh: "同级文件夹", en: "Sibling folders" },
  loading: { zh: "加载中…", en: "Loading…" },
  noSiblingFolder: { zh: "暂无同级文件夹", en: "No sibling folders" },
  // —— 本轮新增（硬编码文案收编）——
  language: { zh: "语言", en: "Language" },
  langZh: { zh: "中文", en: "中文" },
  langEn: { zh: "English", en: "English" },
  loginTitle: { zh: "登录 FlareDrive", en: "Sign in to FlareDrive" },
  loginHint: {
    zh: "请输入 WebDAV 用户名和密码以访问你的文件。",
    en: "Enter your WebDAV username and password to access your files.",
  },
  username: { zh: "用户名", en: "Username" },
  password: { zh: "密码", en: "Password" },
  wrongCredentials: { zh: "用户名或密码错误，请重试", en: "Wrong username or password. Try again." },
  networkError: { zh: "登录失败，请检查网络后重试", en: "Sign-in failed. Check your network and try again." },
  copiedAllToast: { zh: "全文已复制", en: "Full text copied" },
  loggedInAs: { zh: "已登录：{name}", en: "Signed in: {name}" },
  uploadedToast: { zh: "已上传 {name}", en: "Uploaded {name}" },
  uploadFailedToast: { zh: "上传失败：{name}", en: "Upload failed: {name}" },
  pathCopied: { zh: "路径已复制", en: "Path copied" },
  copyFailed: { zh: "复制失败", en: "Copy failed" },
  pasteDone: { zh: "粘贴完成", en: "Paste complete" },
  renameDone: { zh: "重命名成功", en: "Renamed" },
  folderCreated: { zh: "文件夹已创建", en: "Folder created" },
  enqueuedUploads: { zh: "已加入 {count} 个上传任务", en: "{count} upload task(s) queued" },
  movedToTrashCount: { zh: "已移入回收站 {count} 项", en: "{count} item(s) moved to trash" },
  undoDeleteDone: { zh: "已撤销删除", en: "Delete undone" },
  restoreDone: { zh: "已恢复所选项目", en: "Selected items restored" },
  listingStats: {
    zh: "{folders} 个文件夹 · {files} 个文件 · 共 {size}",
    en: "{folders} folder(s) · {files} file(s) · {size}",
  },
  confirmDeleteTitle: { zh: "移入回收站", en: "Move to trash" },
  confirmDeleteMsg: {
    zh: "将删除 {count} 项，删除后可到回收站恢复。",
    en: "{count} item(s) will be moved to the trash, where they can be restored.",
  },
  confirmAction: { zh: "移入回收站", en: "Move to trash" },
  cancel: { zh: "取消", en: "Cancel" },
  ok: { zh: "确定", en: "OK" },
  close: { zh: "关闭", en: "Close" },
  name: { zh: "名称", en: "Name" },
  folderName: { zh: "文件夹名称", en: "Folder name" },
  renameTitle: { zh: "重命名", en: "Rename" },
  createFolderTitle: { zh: "新建文件夹", en: "New folder" },
  noUploadTasks: { zh: "暂无上传任务", en: "No upload tasks" },
  overallProgress: { zh: "总进度", en: "Overall" },
  statusPending: { zh: "等待中", en: "Pending" },
  statusUploading: { zh: "上传中", en: "Uploading" },
  statusMultipartUploading: { zh: "分块上传中", en: "Uploading (multipart)" },
  statusPaused: { zh: "已暂停", en: "Paused" },
  statusPausedResumable: {
    zh: "已暂停，点「继续」从已上传分块续传",
    en: "Paused — click Resume to continue from uploaded parts",
  },
  statusFailed: { zh: "失败，可重试", en: "Failed, retry available" },
  statusFailedResumable: {
    zh: "失败，点「重试」可从断点续传",
    en: "Failed — click Retry to resume from uploaded parts",
  },
  statusCompleted: { zh: "已完成", en: "Completed" },
  statusCanceled: { zh: "已取消", en: "Canceled" },
  pause: { zh: "暂停", en: "Pause" },
  resume: { zh: "继续", en: "Resume" },
  clearFailed: { zh: "清除失败", en: "Clear failed" },
  clearCompleted: { zh: "清除已完成", en: "Clear completed" },
  copyAll: { zh: "复制全文", en: "Copy all" },
  previewTooLargeTitle: { zh: "文件过大，无法在线预览", en: "File too large to preview inline" },
  previewTooLargeHint: {
    zh: "大小 {size}，超过 2 MB 限制。",
    en: "Size {size}, over the 2 MB limit.",
  },
  jsonParseFailed: { zh: "无法解析为 JSON，已显示原文", en: "Could not parse as JSON — showing raw text" },
  unsupportedPreview: { zh: "该文件类型暂不支持预览", en: "Preview is not supported for this file type" },
  saveAndUpload: { zh: "保存并上传", en: "Save & upload" },
  notePlaceholder: { zh: "写下你的笔记…", en: "Write your note…" },
  fileName: { zh: "文件名", en: "File name" },
  openFileFailed: { zh: "打开文件失败", en: "Failed to open file" },
  moreUploadWays: { zh: "更多上传方式", en: "More ways to upload" },
  originalPath: { zh: "原路径", en: "Original path" },
  deletedAt: { zh: "删除于", en: "Deleted at" },
  restoreBtn: { zh: "恢复", en: "Restore" },
  permanentDelete: { zh: "彻底删除", en: "Delete permanently" },
  clearTrash: { zh: "清空回收站", en: "Empty trash" },
  copyTextToast: { zh: "{label}已复制", en: "{label} copied" },
};

let currentLang: Lang = detectLang();
const listeners = new Set<() => void>();

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem("flaredrive.lang");
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // ignore persistence failures
  }
  return typeof navigator !== "undefined" &&
    navigator.language?.toLowerCase().startsWith("zh")
    ? "zh"
    : "en";
}

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang) {
  currentLang = lang;
  try {
    localStorage.setItem("flaredrive.lang", lang);
  } catch {
    // ignore persistence failures
  }
  for (const listener of listeners) listener();
}

export function subscribeLang(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 参数化翻译：translate("listingStats", { folders: 2, files: 5, size: "1 KB" }) */
export function translate(
  key: string,
  params?: Record<string, string | number>
): string {
  const entry = entries[key];
  const text = entry ? entry[currentLang] : key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_match, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  );
}

// Proxy 让现有 strings.xxx 用法在语言切换后自然返回对应语言（组件重渲染时读取）。
// 开发期 key 拼错会原样返回 key 名，便于发现。
export const strings = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (typeof key !== "string") return "";
      return translate(key);
    },
  }
) as { [key: string]: string };

/** 订阅语言变化（App 根部用于触发整树重渲染） */
export function useLang(): Lang {
  const [lang, setLangState] = React.useState<Lang>(currentLang);
  React.useEffect(
    () =>
      subscribeLang(() => {
        setLangState(currentLang);
      }),
    []
  );
  return lang;
}

export default strings;
