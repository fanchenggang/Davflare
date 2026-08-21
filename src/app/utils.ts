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

export function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function basename(key: string) {
  return key.replace(/\/$/, "").split("/").pop() ?? "";
}

export function isDirectory(file: Pick<FileItem, "isDir">) {
  return file.isDir;
}
