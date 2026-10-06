import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
/**
 * #151：发布前的地址占用检查。
 * - GET /api/sites?check=<slug>：exists / kind / source
 * - 发布时记录源文件夹（普通站 / 公开目录），相册 / 文档站清掉
 * - siteSlugConflictMessage 规则
 * - 对话框：冲突时先警告、按钮变「覆盖发布」，再点才发布；改地址清掉警告
 */
import { onRequestGet, onRequestPost } from "../../../functions/api/sites";
import { siteConfigKey } from "../../../functions/_sites";
import { ALBUM_MANIFEST_NAME, SITE_MANIFEST_NAME, serializeSiteManifest } from "../../../functions/siteManifest";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";
import PublishSiteDialog from "../../PublishSiteDialog";
import PublishAlbumDialog from "../../PublishAlbumDialog";
import PublishDirDialog from "../../PublishDirDialog";
import { checkSiteSlug, publishAlbumSite, publishDirSite, publishSite, siteSlugConflictMessage } from "../sites";
import { strings, translate } from "../strings";
import { fetchPath } from "../transfer";
import { FileItem } from "../types";

vi.mock("../sites", async () => {
  const actual = await vi.importActual<typeof import("../sites")>("../sites");
  return {
    ...actual,
    checkSiteSlug: vi.fn(),
    publishSite: vi.fn(),
    publishAlbumSite: vi.fn(),
    publishDirSite: vi.fn(),
  };
});
vi.mock("../transfer", async () => {
  const actual = await vi.importActual<typeof import("../transfer")>("../transfer");
  return { ...actual, fetchPath: vi.fn() };
});

const AUTH = basicAuthHeader("user", "pass");

function env(bucket: InMemoryBucket) {
  return { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass", SITES_HOST: "sites.example.com" };
}

async function check(bucket: InMemoryBucket, slug: string, auth = AUTH) {
  const response = await onRequestGet(
    makeContext(
      new Request(`http://drive.example.com/api/sites?check=${encodeURIComponent(slug)}`, { headers: { Authorization: auth } }),
      env(bucket)
    )
  );
  return { status: response.status, json: response.status === 200 ? await response.json() : null };
}

async function post(bucket: InMemoryBucket, body: unknown) {
  const response = await onRequestPost(
    makeContext(
      new Request("http://drive.example.com/api/sites", {
        method: "POST",
        headers: { Authorization: AUTH, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env(bucket)
    )
  );
  return { status: response.status, json: (await response.json().catch(() => null)) as Record<string, unknown> | null };
}

function storedSource(bucket: InMemoryBucket, slug: string): string | null {
  const raw = bucket.rawText(siteConfigKey(slug));
  if (!raw) return null;
  return (JSON.parse(raw) as { source?: string }).source ?? null;
}

describe("GET /api/sites?check=", () => {
  test("missing slug → exists false", async () => {
    const result = await check(new InMemoryBucket(), "nothing");
    expect(result.json).toEqual({ slug: "nothing", exists: false, kind: null, source: null });
  });

  test("ordinary site → static; generated sites → their manifest kind", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/blog/index.html", body: "<h1/>" },
      { key: "sites/pics/index.html", body: "<h1/>" },
      { key: `sites/pics/${ALBUM_MANIFEST_NAME}`, body: JSON.stringify({ kind: "album", files: [] }) },
      { key: "sites/files/index.html", body: "<h1/>" },
      { key: `sites/files/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("dir", []) },
      { key: siteConfigKey("files"), body: JSON.stringify({ slug: "files", source: "share/files" }) },
      { key: "sites/manual/index.html", body: "<h1/>" },
      { key: `sites/manual/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("docs", []) },
    ]);
    expect((await check(bucket, "blog")).json).toMatchObject({ exists: true, kind: "static", source: null });
    expect((await check(bucket, "pics")).json).toMatchObject({ exists: true, kind: "album" });
    expect((await check(bucket, "Files")).json).toEqual({ slug: "files", exists: true, kind: "dir", source: "share/files" });
    expect((await check(bucket, "manual")).json).toMatchObject({ exists: true, kind: "docs" });
  });

  test("a leftover config without files is not 'taken'", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: siteConfigKey("gone"), body: JSON.stringify({ slug: "gone", source: "x", spa: true }) }]);
    expect((await check(bucket, "gone")).json).toEqual({ slug: "gone", exists: false, kind: null, source: null });
  });

  test("bad slug 400, unauthorized 401", async () => {
    expect((await check(new InMemoryBucket(), "Bad_Slug")).status).toBe(400);
    expect((await check(new InMemoryBucket(), "blog", basicAuthHeader("user", "wrong"))).status).toBe(401);
  });
});

describe("publish records the source folder", () => {
  test("folder publish records source; album publish clears it", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("blog");
    bucket.seed([
      { key: "blog/index.html", body: "<h1>hi</h1>" },
      { key: "pics/a.png", body: "PNG", contentType: "image/png" },
    ]);
    expect((await post(bucket, { slug: "site", source: "blog/" })).status).toBe(200);
    expect(storedSource(bucket, "site")).toBe("blog");
    expect((await check(bucket, "site")).json).toMatchObject({ kind: "static", source: "blog" });
    expect((await post(bucket, { slug: "site", album: { files: ["pics/a.png"] } })).status).toBe(200);
    expect(storedSource(bucket, "site")).toBeNull();
    expect((await check(bucket, "site")).json).toMatchObject({ kind: "album", source: null });
  });

  test("album publish on a fresh slug does not create a config file", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "pics/a.png", body: "PNG", contentType: "image/png" }]);
    expect((await post(bucket, { slug: "pics", album: { files: ["pics/a.png"] } })).status).toBe(200);
    expect(bucket.has(siteConfigKey("pics"))).toBe(false);
  });

  test("public directory finish records the folder and keeps other config", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("share/inbox");
    bucket.seed([
      { key: "share/inbox/a.txt", body: "A" },
      { key: siteConfigKey("inbox"), body: JSON.stringify({ slug: "inbox", spa: true }) },
    ]);
    const plan = await post(bucket, { slug: "inbox", dir: { phase: "plan", source: "share/inbox" } });
    const planId = plan.json?.planId as string;
    await post(bucket, { slug: "inbox", dir: { phase: "copy", planId, files: ["a.txt"] } });
    expect((await post(bucket, { slug: "inbox", dir: { phase: "finish", planId } })).status).toBe(200);
    const config = JSON.parse(bucket.rawText(siteConfigKey("inbox")) ?? "{}") as { spa?: boolean; source?: string };
    expect(config).toMatchObject({ spa: true, source: "share/inbox" });
    expect((await check(bucket, "inbox")).json).toMatchObject({ kind: "dir", source: "share/inbox" });
  });
});

describe("siteSlugConflictMessage", () => {
  const free = { slug: "x", exists: false, kind: null, source: null };
  test("free slug never warns", () => {
    for (const kind of ["static", "album", "dir", "docs"] as const) {
      expect(siteSlugConflictMessage(free, kind, "a")).toBeNull();
    }
  });

  test("different kind warns with the existing kind", () => {
    const message = siteSlugConflictMessage({ slug: "blog", exists: true, kind: "static", source: null }, "album", null);
    expect(message).toBe(translate("siteSlugTakenKind", { slug: "blog", kind: translate("siteKindStatic") }));
    expect(siteSlugConflictMessage({ slug: "x", exists: true, kind: "dir", source: "a" }, "static", "a")).toContain(
      translate("siteKindDir")
    );
    expect(siteSlugConflictMessage({ slug: "x", exists: true, kind: "future", source: null }, "dir", "a")).toContain(
      translate("siteKindUnknown")
    );
  });

  test("same kind: album/docs republish silently; static/dir compare the source folder", () => {
    expect(siteSlugConflictMessage({ slug: "x", exists: true, kind: "album", source: null }, "album", null)).toBeNull();
    expect(siteSlugConflictMessage({ slug: "x", exists: true, kind: "docs", source: null }, "docs", null)).toBeNull();
    expect(siteSlugConflictMessage({ slug: "x", exists: true, kind: "dir", source: "a" }, "dir", "a")).toBeNull();
    expect(siteSlugConflictMessage({ slug: "x", exists: true, kind: "dir", source: "a" }, "dir", "b")).toBe(
      translate("siteSlugTakenSource", { slug: "x", source: "a" })
    );
    // 旧的公开目录没有记录来源：同类型不打扰
    expect(siteSlugConflictMessage({ slug: "x", exists: true, kind: "dir", source: null }, "dir", "b")).toBeNull();
    expect(siteSlugConflictMessage({ slug: "x", exists: true, kind: "static", source: "a" }, "static", "a")).toBeNull();
    expect(siteSlugConflictMessage({ slug: "x", exists: true, kind: "static", source: "a" }, "static", "b")).toBe(
      translate("siteSlugTakenSource", { slug: "x", source: "a" })
    );
    // 普通站来源未知（WebDAV / zip 部署）：提示
    expect(siteSlugConflictMessage({ slug: "x", exists: true, kind: "static", source: null }, "static", "b")).toBe(
      translate("siteSlugTakenStatic", { slug: "x" })
    );
  });
});

function folderItem(key: string): FileItem {
  return { key, name: key.split("/").pop() || key, isDir: true, size: 0, uploaded: "", contentType: "application/x-directory" };
}

describe("dialogs warn before overwriting", () => {
  beforeEach(() => {
    vi.mocked(checkSiteSlug).mockReset();
    vi.mocked(publishSite).mockReset();
    vi.mocked(publishAlbumSite).mockReset();
    vi.mocked(publishDirSite).mockReset();
    vi.mocked(fetchPath).mockReset();
  });

  test("album onto an ordinary site: warning first, Overwrite publishes", async () => {
    vi.mocked(checkSiteSlug).mockResolvedValue({ slug: "a", exists: true, kind: "static", source: "blog" });
    vi.mocked(publishAlbumSite).mockResolvedValue({ slug: "a", kind: "album", copied: 1, bytes: 3, sitesHost: "sites.example.com" } as never);
    const image: FileItem = { key: "pics/a.png", name: "a.png", isDir: false, size: 3, uploaded: "", contentType: "image/png" };
    render(<PublishAlbumDialog open images={[image]} ignoredCount={0} onClose={vi.fn()} onNotify={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    await waitFor(() =>
      expect(screen.getByText(translate("siteSlugTakenKind", { slug: "a", kind: translate("siteKindStatic") }))).toBeInTheDocument()
    );
    expect(publishAlbumSite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: strings.siteSlugOverwrite }));
    await waitFor(() => expect(publishAlbumSite).toHaveBeenCalledTimes(1));
    expect(checkSiteSlug).toHaveBeenCalledTimes(1);
  });

  test("changing the slug clears the warning and re-checks; a free slug publishes directly", async () => {
    vi.mocked(checkSiteSlug).mockImplementation(async (slug: string) =>
      slug === "my-blog"
        ? { slug, exists: true, kind: "static", source: "Other" }
        : { slug, exists: false, kind: null, source: null }
    );
    vi.mocked(publishSite).mockResolvedValue({ slug: "fresh", source: "My Blog", copied: 1, sitesHost: "sites.example.com" });
    render(<PublishSiteDialog open folder={folderItem("My Blog")} onClose={vi.fn()} onNotify={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    await waitFor(() =>
      expect(screen.getByText(translate("siteSlugTakenSource", { slug: "my-blog", source: "Other" }))).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText(strings.publishSiteSlug), { target: { value: "fresh" } });
    expect(screen.queryByRole("button", { name: strings.siteSlugOverwrite })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    await waitFor(() => expect(publishSite).toHaveBeenCalledWith("My Blog", "fresh"));
    expect(checkSiteSlug).toHaveBeenLastCalledWith("fresh");
  });

  test("republishing the same folder to its own slug does not warn", async () => {
    vi.mocked(checkSiteSlug).mockResolvedValue({ slug: "inbox", exists: true, kind: "dir", source: "share/inbox" });
    vi.mocked(fetchPath).mockResolvedValue([
      { key: "share/inbox/a.txt", name: "a.txt", isDir: false, size: 1, uploaded: "", contentType: "text/plain" },
    ]);
    vi.mocked(publishDirSite).mockResolvedValue({ slug: "inbox", kind: "dir", copied: 1, bytes: 1, sitesHost: "sites.example.com" } as never);
    render(<PublishDirDialog open folder={folderItem("share/inbox")} onClose={vi.fn()} onNotify={vi.fn()} />);
    const submit = await screen.findByRole("button", { name: strings.publishSiteSubmit });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(publishDirSite).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: strings.siteSlugOverwrite })).toBeNull();
  });

  test("a failing check does not block publishing", async () => {
    vi.mocked(checkSiteSlug).mockRejectedValue(new Error("offline"));
    vi.mocked(publishSite).mockResolvedValue({ slug: "my-blog", source: "My Blog", copied: 1, sitesHost: null });
    render(<PublishSiteDialog open folder={folderItem("My Blog")} onClose={vi.fn()} onNotify={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    await waitFor(() => expect(publishSite).toHaveBeenCalledTimes(1));
  });
});
