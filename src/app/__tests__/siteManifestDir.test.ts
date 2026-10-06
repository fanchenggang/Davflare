import { vi } from "vitest";
import {
  ALBUM_MANIFEST_NAME,
  SITE_MANIFEST_NAME,
  deleteKeysInChunks,
  isReservedSiteName,
  loadOwnedSiteRels,
  manifestNameForKind,
  parseSiteManifest,
  serializeSiteManifest,
} from "../../../functions/siteManifest";
import {
  DIR_MAX_BYTES,
  DIR_MAX_FILES,
  checkDirLimits,
  formatSiteBytes,
  formatSiteTime,
  parseAlbumManifest,
  renderDirPage,
} from "../../../functions/sitePages";
import { InMemoryBucket } from "../testInMemoryBucket";

describe("generic site manifest", () => {
  test("kind → file name (album keeps its historical name)", () => {
    expect(manifestNameForKind("album")).toBe(ALBUM_MANIFEST_NAME);
    expect(manifestNameForKind("dir")).toBe(SITE_MANIFEST_NAME);
    expect(manifestNameForKind("docs")).toBe(SITE_MANIFEST_NAME);
  });

  test("serialize/parse round trip keeps kind, drops unsafe and duplicate rels", () => {
    const text = serializeSiteManifest("dir", ["a.txt", "a.txt", "../x", "/abs", "b/c.txt", "_$flaredrive$/x"]);
    expect(JSON.parse(text)).toMatchObject({ version: 1, kind: "dir" });
    expect(parseSiteManifest(text)).toEqual({ kind: "dir", files: ["a.txt", "b/c.txt"] });
    expect(parseSiteManifest("not json")).toEqual({ kind: null, files: [] });
    expect(parseSiteManifest("[1]")).toEqual({ kind: null, files: [] });
    expect(parseSiteManifest('{"kind":"docs"}')).toEqual({ kind: "docs", files: [] });
    expect(parseSiteManifest('{"files":["a","b","c"]}', 2).files).toEqual(["a", "b"]);
  });

  test("album manifest without kind still parses (backward compatible)", () => {
    expect(parseAlbumManifest(JSON.stringify({ version: 1, files: ["a.jpg", "index.html"] }))).toEqual([
      "a.jpg",
      "index.html",
    ]);
  });

  test("reserved names are case-insensitive", () => {
    expect(isReservedSiteName("INDEX.html")).toBe(true);
    expect(isReservedSiteName(SITE_MANIFEST_NAME.toUpperCase())).toBe(true);
    expect(isReservedSiteName(ALBUM_MANIFEST_NAME)).toBe(true);
    expect(isReservedSiteName("index.htm")).toBe(false);
  });

  test("loadOwnedSiteRels unions both manifests plus the manifest files", async () => {
    const bucket = new InMemoryBucket();
    expect(await loadOwnedSiteRels(bucket.asBucket(), "sites/s/")).toEqual([]);
    bucket.seed([
      { key: `sites/s/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("dir", ["a.txt"]) },
      { key: `sites/s/${ALBUM_MANIFEST_NAME}`, body: JSON.stringify({ files: ["b.jpg", "a.txt"] }) },
    ]);
    expect((await loadOwnedSiteRels(bucket.asBucket(), "sites/s/")).sort()).toEqual(
      [SITE_MANIFEST_NAME, ALBUM_MANIFEST_NAME, "a.txt", "b.jpg"].sort()
    );
  });

  test("deleteKeysInChunks splits at 1000", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const keys = Array.from({ length: 2001 }, (_, i) => `k${i}`);
    await deleteKeysInChunks({ delete: del } as unknown as R2Bucket, keys);
    expect(del.mock.calls.map((c) => (c[0] as string[]).length)).toEqual([1000, 1000, 1]);
    del.mockClear();
    await deleteKeysInChunks({ delete: del } as unknown as R2Bucket, []);
    expect(del).not.toHaveBeenCalled();
  });
});

describe("public directory page helpers", () => {
  test("checkDirLimits boundaries", () => {
    expect(checkDirLimits(0, 0)).toEqual({ ok: false, error: "no files" });
    expect(checkDirLimits(DIR_MAX_FILES, DIR_MAX_BYTES)).toEqual({ ok: true });
    expect(checkDirLimits(DIR_MAX_FILES + 1, 1)).toMatchObject({ ok: false });
    expect(checkDirLimits(1, DIR_MAX_BYTES + 1)).toMatchObject({ ok: false });
    expect(checkDirLimits(1, -1)).toEqual({ ok: false, error: "bad dir" });
    expect(DIR_MAX_FILES).toBe(500);
    expect(DIR_MAX_BYTES).toBe(2 * 1024 * 1024 * 1024);
  });

  test("formatSiteBytes / formatSiteTime", () => {
    expect(formatSiteBytes(0)).toBe("0 B");
    expect(formatSiteBytes(1536)).toBe("1.5 KB");
    expect(formatSiteBytes(200 * 1024 * 1024)).toBe("200 MB");
    expect(formatSiteBytes(-1)).toBe("0 B");
    expect(formatSiteTime("2026-03-04T05:06:07.000Z")).toEqual({
      iso: "2026-03-04T05:06:07.000Z",
      text: "2026-03-04 05:06 UTC",
    });
    expect(formatSiteTime("nope")).toBeNull();
  });

  test("renderDirPage: zh strings, subfolder note, no script, dark-mode CSS", () => {
    const html = renderDirPage({
      lang: "zh",
      title: "资料",
      subdirs: 2,
      files: [{ name: "a b.txt", size: 2048, uploaded: "2026-01-01T00:00:00.000Z" }],
    });
    expect(html).toContain('<html lang="zh-CN"');
    expect(html).toContain("<h1>资料</h1>");
    expect(html).toContain('href="a%20b.txt" download="a b.txt"');
    expect(html).toContain("2.0 KB");
    expect(html).toContain("2 个子文件夹");
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).not.toMatch(/<script/i);
  });

  test("renderDirPage: en, no subfolder note, bad time renders empty cell", () => {
    const html = renderDirPage({
      lang: "en",
      title: "Files",
      subdirs: 0,
      files: [{ name: "x", size: 1, uploaded: "" }],
    });
    expect(html).toContain("Download");
    expect(html).not.toContain("subfolder");
  });
});
