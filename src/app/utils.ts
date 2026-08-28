import { FileItem } from "./types";

export function humanReadableSize(size: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (size >= 1024) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

export function formatDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
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

export function fileTypeCategory(
  file: FileItem
): "folder" | "image" | "video" | "doc" | "other" {
  if (file.isDir) return "folder";
  const type = (file.contentType || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  const office =
    type.includes("wordprocessing") ||
    type.includes("spreadsheet") ||
    type.includes("presentation") ||
    type.includes("opendocument") ||
    [
      "application/pdf",
      "application/msword",
      "application/rtf",
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint",
    ].includes(type);
  const docName = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv|rtf)$/.test(name);
  if (type.startsWith("text/") || office || docName) return "doc";
  return "other";
}
