import { authFetch } from "./auth";
import { FileItem } from "./types";
import { basename, encodeKey } from "./utils";
import { translate } from "./strings";

import { WEBDAV_ENDPOINT } from "./uploadTransfer";

function decodeHrefSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Object key from a PROPFIND href, whether relative (`/webdav/a/b`) or absolute. */
export function davHrefToKey(href: string): string {
  const raw = (href || "").trim();
  if (!raw) return "";

  let pathname = raw;
  try {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
      pathname = new URL(raw).pathname;
    }
  } catch {
    const fallback = raw.indexOf("/webdav/");
    if (fallback >= 0) pathname = raw.slice(fallback);
  }

  const marker = "/webdav/";
  const at = pathname.indexOf(marker);
  let rest: string;
  if (at >= 0) {
    rest = pathname.slice(at + marker.length);
  } else if (pathname === "/webdav") {
    rest = "";
  } else if (pathname.startsWith("/")) {
    rest = pathname.slice(1);
  } else {
    rest = pathname;
  }

  return rest.split("/").map(decodeHrefSegment).join("/").replace(/\/$/, "");
}

function firstTag(parent: Element, localName: string): Element | undefined {
  return parent.getElementsByTagName(localName)[0];
}

export async function fetchPath(path: string) {
  const res = await authFetch(`${WEBDAV_ENDPOINT}${encodeKey(path)}`, {
    method: "PROPFIND",
    headers: { Depth: "1" },
  });

  if (!res.ok) throw new Error("Failed to fetch");
  if (!res.headers.get("Content-Type")?.includes("application/xml"))
    throw new Error("Invalid response");

  const parser = new DOMParser();
  const text = await res.text();
  const document = parser.parseFromString(text, "application/xml");
  const cwdKey = path.replace(/\/$/, "");
  const items: FileItem[] = [];

  for (const response of Array.from(document.getElementsByTagName("response"))) {
    const href = firstTag(response, "href")?.textContent ?? "";
    const key = davHrefToKey(href);
    if (!href) continue;
    if (key === cwdKey) continue;

    const contentType = firstTag(response, "getcontenttype")?.textContent || "";
    const size = firstTag(response, "getcontentlength")?.textContent;
    const lastModified = firstTag(response, "getlastmodified")?.textContent;
    const thumbnail =
      response.getElementsByTagNameNS("flaredrive", "thumbnail")[0]
        ?.textContent || undefined;
    const resourceType = firstTag(response, "resourcetype");
    const isDir =
      contentType === "application/x-directory" ||
      Boolean(resourceType?.getElementsByTagName("collection").length);

    items.push({
      key,
      name: basename(key),
      isDir,
      size: size ? Number(size) : 0,
      uploaded: lastModified || new Date().toUTCString(),
      contentType: contentType || (isDir ? "application/x-directory" : ""),
      thumbnail: thumbnail || undefined,
    });
  }
  return items;
}

export interface SearchResponse {
  items: FileItem[];
  hasMore: boolean;
  nextCursor?: string;
}

// 批量统计文件夹的直接子项数（惰性计数）：单次 POST /api/counts 拿回全部，
// 失败整体返回空（调用方保留占位文案）
export async function fetchFolderCounts(
  keys: string[]
): Promise<Record<string, number>> {
  if (!keys.length) return {};
  try {
    const res = await authFetch("/api/counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: keys.slice(0, 100) }),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { counts?: Record<string, number> };
    return data.counts ?? {};
  } catch {
    return {};
  }
}

export async function searchFiles(
  query: string,
  cursor?: string,
  limit = 100
): Promise<SearchResponse> {
  const params: Record<string, string> = { q: query, limit: String(limit) };
  if (cursor) params.cursor = cursor;
  const res = await authFetch(`/api/search?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error("Search failed");
  const data = (await res.json()) as {
    items: Array<Record<string, any>>;
    hasMore: boolean;
    nextCursor?: string;
  };
  return {
    items: data.items.map((item) => ({
      key: item.key,
      name: basename(item.key),
      isDir: item.contentType === "application/x-directory",
      size: item.size,
      uploaded: item.uploaded,
      contentType: item.contentType || "",
      thumbnail: item.thumbnail || undefined,
    })),
    hasMore: data.hasMore,
    nextCursor: data.nextCursor,
  };
}

export async function openFile(key: string) {
  const res = await authFetch(`${WEBDAV_ENDPOINT}${encodeKey(key)}`);
  if (!res.ok) throw new Error(translate("openFileFailed"));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadFile(key: string) {
  const res = await authFetch(`${WEBDAV_ENDPOINT}${encodeKey(key)}`);
  if (!res.ok) throw new Error(translate("downloadFailed"));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = basename(key) || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** zip 下载名：`<文件夹名>.zip`，网盘根（空键）为 `archive.zip`；与 GET /api/archive 命名一致。 */
export function archiveNameFor(folderKey: string): string {
  const name = basename(folderKey);
  return name ? `${name}.zip` : "archive.zip";
}

/**
 * POST /api/archive 多选打包。`base`（选中项所在文件夹）会让服务端把条目路径改为相对该文件夹；
 * 不传则条目为完整网盘路径（旧行为）。
 */
export async function downloadArchive(keys: string[], name = "archive.zip", base?: string) {
  const res = await authFetch("/api/archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(base ? { keys, base } : { keys }),
  });
  if (!res.ok) throw new Error((await res.text()) || translate("archiveFailed"));
  saveBlob(await res.blob(), name);
}

/** 单个文件夹下载：与 `GET /api/archive?path=` 一致——`<文件夹名>.zip`，条目相对该文件夹。 */
export async function downloadFolderArchive(folderKey: string) {
  const key = folderKey.replace(/\/+$/, "");
  const res = await authFetch(`/api/archive?path=${encodeURIComponent(`${key}/`)}`);
  if (!res.ok) throw new Error((await res.text()) || translate("archiveFailed"));
  saveBlob(await res.blob(), archiveNameFor(key));
}

/**
 * 多选下载：选中全在当前文件夹 `cwd` 下时，zip 名为 `<cwd 名>.zip`（根目录为 archive.zip），
 * 条目相对 `cwd`；跨文件夹（如全局搜索结果）时退回完整路径 + archive.zip。
 */
export async function downloadSelectionArchive(keys: string[], cwd: string) {
  const base = cwd && keys.every((key) => key.startsWith(cwd)) ? cwd : "";
  await downloadArchive(keys, archiveNameFor(base), base || undefined);
}

export async function copyPaste(source: string, target: string, move = false) {
  const uploadUrl = `${WEBDAV_ENDPOINT}${encodeKey(source)}`;
  const destinationUrl = new URL(
    `${WEBDAV_ENDPOINT}${encodeKey(target)}`,
    window.location.href
  );
  const response = await authFetch(uploadUrl, {
    method: move ? "MOVE" : "COPY",
    headers: { Destination: destinationUrl.href },
  });
  if (!response.ok) {
    throw new Error(move ? translate("moveFailed") : translate("copyFailed2"));
  }
}

export async function createFolder(cwd: string, folderName: string) {
  const name = folderName.trim();
  if (!name) throw new Error(translate("folderNameRequired"));
  if (name.includes("/")) throw new Error(translate("folderNameNoSlash"));
  const folderKey = `${cwd}${name}`;
  const uploadUrl = `${WEBDAV_ENDPOINT}${encodeKey(folderKey)}`;
  const response = await authFetch(uploadUrl, { method: "MKCOL" });
  if (!response.ok) throw new Error(translate("createFolderFailed"));
}


export * from "./uploadTransfer";
