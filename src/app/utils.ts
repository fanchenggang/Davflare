import { isTextPreviewable } from "./preview";
import { translate } from "./strings";
import { FileItem } from "./types";

export function humanReadableSize(size: number) {
  if (!Number.isFinite(size) || size < 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (size >= 1024) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

export function humanReadableSpeed(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "";
  return `${humanReadableSize(bytesPerSecond)}/s`;
}

// 剩余时间：秒 →「45 秒」「2 分 10 秒」，无限/无效返回空串
export function formatEta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return translate("etaSeconds", { n: Math.ceil(seconds) });
  const minutes = Math.floor(seconds / 60);
  const rest = Math.ceil(seconds % 60);
  if (minutes < 60) return translate("etaMinSec", { m: minutes, s: rest });
  const hours = Math.floor(minutes / 60);
  return translate("etaHourMin", { h: hours, m: minutes % 60 });
}

export function formatDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

// 24 小时内显示相对时间（N 分钟前），更早显示日期；「刚刚」门槛 60 秒
export function formatRelativeDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0 || diffMs > 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString();
  }
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return translate("justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return translate("minutesAgo", { m: minutes });
  const hours = Math.floor(minutes / 60);
  return translate("hoursAgo", { h: hours });
}

export function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function basename(key: string) {
  return key.replace(/\/$/, "").split("/").pop() ?? "";
}

export function isDirectory(file: Pick<FileItem, "isDir">) {
  return file.isDir;
}

const OFFICE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
]);

const DOC_NAME =
  /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|markdown|csv|tsv|rtf|json|jsonc|xml|html|htm|yaml|yml)$/;

export function fileTypeCategory(
  file: FileItem
): "folder" | "image" | "video" | "doc" | "other" {
  if (file.isDir) return "folder";
  const type = (file.contentType || "").toLowerCase().split(";")[0].trim();
  const name = file.name.toLowerCase();
  if (type.startsWith("video/")) return "video";
  // svg+xml is text-previewable and should count as a document, not an image.
  if (type.startsWith("image/") && type !== "image/svg+xml") return "image";
  const office =
    type.includes("wordprocessing") ||
    type.includes("spreadsheet") ||
    type.includes("presentation") ||
    type.includes("opendocument") ||
    OFFICE_TYPES.has(type);
  const docName = DOC_NAME.test(name);
  if (
    type.startsWith("text/") ||
    office ||
    docName ||
    isTextPreviewable(file)
  ) {
    return "doc";
  }
  return "other";
}

const JUNK_EXACT = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

/** macOS/Windows junk names; hide from the grid, never delete. */
export function isJunkFileName(name: string) {
  const lower = name.toLowerCase();
  if (JUNK_EXACT.has(lower)) return true;
  if (name.startsWith("._")) return true;
  return false;
}

export function formatListingSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${Math.round(size)} B`;
  return humanReadableSize(size);
}

export function uniqueName(name: string, taken: Set<string>) {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let index = 2;
  while (taken.has(`${stem} (${index})${ext}`)) index++;
  return `${stem} (${index})${ext}`;
}

/** Rename dropped/picked files so they do not overwrite existing names. */
export function uniquifyUploadFiles(files: File[], taken: Iterable<string>): File[] {
  const used = new Set(taken);
  const topMap = new Map<string, string>();
  return files.map((file) => {
    const rel = file.webkitRelativePath || "";
    const parts = rel.split("/").filter(Boolean);
    if (parts.length > 1) {
      const top = parts[0];
      let mapped = topMap.get(top);
      if (!mapped) {
        mapped = uniqueName(top, used);
        topMap.set(top, mapped);
        used.add(mapped);
      }
      const newRel = [mapped, ...parts.slice(1)].join("/");
      if (newRel === rel) return file;
      const next = new File([file], parts[parts.length - 1], {
        type: file.type,
        lastModified: file.lastModified,
      });
      try {
        Object.defineProperty(next, "webkitRelativePath", {
          value: newRel,
          configurable: true,
        });
      } catch {
        // ignore
      }
      return next;
    }
    const unique = uniqueName(file.name, used);
    used.add(unique);
    if (unique === file.name) return file;
    return new File([file], unique, {
      type: file.type,
      lastModified: file.lastModified,
    });
  });
}
