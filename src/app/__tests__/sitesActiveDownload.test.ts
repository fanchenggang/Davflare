import { vi } from "vitest";
/**
 * #146：生成型站点（公开目录 / 相册 / 文档站）里会执行的文件类型强制下载；
 * 普通静态站（没有清单）的 html/js 照常渲染，且不为图片/css 等多读清单。
 */
import { onRequest } from "../../../functions/_middleware";
import { onRequestPost } from "../../../functions/api/sites";
import { siteConfigKey } from "../../../functions/_sites";
import {
  ALBUM_MANIFEST_NAME,
  SITE_MANIFEST_NAME,
  isActiveSiteFile,
  loadSiteManifestKind,
  serializeSiteManifest,
  siteFileForcesDownload,
} from "../../../functions/siteManifest";
import { sha256Hex, utf8ToBase64 } from "../../../functions/api/_apikey";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const ENV_EXTRA = { SITES_HOST: "sites.example.com" };

function get(bucket: R2Bucket, path: string, options: { method?: string; host?: string; headers?: Record<string, string> } = {}) {
  const request = new Request(`http://${options.host ?? "sites.example.com"}${path}`, {
    method: options.method ?? "GET",
    headers: { Host: options.host ?? "sites.example.com", ...(options.headers ?? {}) },
  });
  return onRequest(makeContext(request, { BUCKET: bucket, ...ENV_EXTRA }, {}));
}

const HOSTILE = [
  { key: "x.html", body: "<script>alert(1)</script>" },
  { key: "x.HTM", body: "<script>alert(1)</script>" },
  { key: "x.svg", body: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>' },
  { key: "x.xml", body: '<x:script xmlns:x="http://www.w3.org/1999/xhtml">alert(1)</x:script>' },
  { key: "x.xhtml", body: "<html/>" },
  { key: "x.js", body: "alert(1)" },
];

function seedDirSite(bucket: InMemoryBucket, slug = "files") {
  const files = [...HOSTILE.map((f) => f.key), "photo.png", "notes.txt", "404.html", "index.html", SITE_MANIFEST_NAME];
  bucket.seed([
    { key: `sites/${slug}/index.html`, body: "<h1>listing</h1>", contentType: "text/html" },
    ...HOSTILE.map((f) => ({ key: `sites/${slug}/${f.key}`, body: f.body })),
    { key: `sites/${slug}/photo.png`, body: "PNG", contentType: "image/png" },
    { key: `sites/${slug}/notes.txt`, body: "hi", contentType: "text/plain" },
    { key: `sites/${slug}/404.html`, body: "<script>alert(404)</script>", contentType: "text/html" },
    { key: `sites/${slug}/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("dir", files) },
  ]);
}

function expectDownload(response: Response, filename: string) {
  expect(response.status).toBe(200);
  const disposition = response.headers.get("Content-Disposition") || "";
  expect(disposition.startsWith("attachment;")).toBe(true);
  expect(disposition).toContain(`filename="${filename}"`);
  expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
}

function expectInline(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Disposition")).toBeNull();
  expect(response.headers.get("Content-Security-Policy")).toBeNull();
}

describe("policy helpers", () => {
  test("isActiveSiteFile covers html/svg/xml/js families case-insensitively", () => {
    for (const name of ["a.html", "a.HTM", "a.xhtml", "a.xht", "a.shtml", "a.svg", "a.svgz", "a.xml", "a.xsl", "a.xslt", "a.js", "a.mjs", "sub/a.Html"]) {
      expect(isActiveSiteFile(name)).toBe(true);
    }
    for (const name of ["a.png", "a.pdf", "a.txt", "a.css", "a.json", "README", "a.html.txt"]) {
      expect(isActiveSiteFile(name)).toBe(false);
    }
  });

  test("siteFileForcesDownload per kind", () => {
    expect(siteFileForcesDownload(null, "x.html")).toBe(false);
    for (const kind of ["dir", "album", "weird-future-kind"]) {
      expect(siteFileForcesDownload(kind, "index.html")).toBe(false);
      // 只放行生成的首页本身：手工放的 INDEX.HTML / Index.html 是另一个对象，必须下载
      expect(siteFileForcesDownload(kind, "INDEX.HTML")).toBe(true);
      expect(siteFileForcesDownload(kind, "Index.html")).toBe(true);
      expect(siteFileForcesDownload(kind, "x.html")).toBe(true);
      expect(siteFileForcesDownload(kind, "sub/index.html")).toBe(true);
      expect(siteFileForcesDownload(kind, "x.svg")).toBe(true);
      expect(siteFileForcesDownload(kind, "x.png")).toBe(false);
    }
    // 文档站：生成的 html 页面要能渲染，复制进来的 svg 等仍下载
    expect(siteFileForcesDownload("docs", "guide/intro.html")).toBe(false);
    expect(siteFileForcesDownload("docs", "img/diagram.svg")).toBe(true);
    expect(siteFileForcesDownload("docs", "x.js")).toBe(true);
  });

  test("loadSiteManifestKind: none / album / generic / strictest / corrupt / failing bucket", async () => {
    const bucket = new InMemoryBucket();
    const raw = bucket.asBucket();
    expect(await loadSiteManifestKind(raw, "sites/a/")).toBeNull();
    bucket.seed([{ key: `sites/b/${ALBUM_MANIFEST_NAME}`, body: JSON.stringify({ kind: "album", files: [] }) }]);
    expect(await loadSiteManifestKind(raw, "sites/b/")).toBe("album");
    bucket.seed([{ key: `sites/c/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("docs", []) }]);
    expect(await loadSiteManifestKind(raw, "sites/c/")).toBe("docs");
    bucket.seed([
      { key: `sites/d/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("docs", []) },
      { key: `sites/d/${ALBUM_MANIFEST_NAME}`, body: "{}" },
    ]);
    expect(await loadSiteManifestKind(raw, "sites/d/")).toBe("album");
    bucket.seed([{ key: `sites/e/${SITE_MANIFEST_NAME}`, body: "not json" }]);
    expect(await loadSiteManifestKind(raw, "sites/e/")).toBe("dir");
    const failing = { get: async () => { throw new Error("boom"); }, head: async () => null } as unknown as R2Bucket;
    expect(await loadSiteManifestKind(failing, "sites/f/")).toBe("dir");
  });
});

describe("public directory site (kind dir)", () => {
  test("html/htm/svg/xml/xhtml/js download as attachments with CSP sandbox", async () => {
    const bucket = new InMemoryBucket();
    seedDirSite(bucket);
    for (const file of HOSTILE) {
      const response = await get(bucket.asBucket(), `/files/${file.key}`);
      expectDownload(response, file.key);
      expect(await response.text()).toBe(file.body);
    }
  });

  test("a manually placed root INDEX.HTML is downloaded, only the generated index.html renders", async () => {
    const bucket = new InMemoryBucket();
    seedDirSite(bucket);
    bucket.seed([
      { key: "sites/files/INDEX.HTML", body: "<script>alert(1)</script>", contentType: "text/html" },
      { key: "sites/files/Index.html", body: "<script>alert(2)</script>", contentType: "text/html" },
    ]);
    for (const name of ["INDEX.HTML", "Index.html"]) {
      expectDownload(await get(bucket.asBucket(), `/files/${name}`), name);
    }
    expectInline(await get(bucket.asBucket(), "/files/index.html"));
  });

  test("HEAD carries the same attachment headers", async () => {
    const bucket = new InMemoryBucket();
    seedDirSite(bucket);
    expectDownload(await get(bucket.asBucket(), "/files/x.svg", { method: "HEAD" }), "x.svg");
  });

  test("generated listing page and inert files stay inline", async () => {
    const bucket = new InMemoryBucket();
    seedDirSite(bucket);
    const index = await get(bucket.asBucket(), "/files/");
    expectInline(index);
    expect(await index.text()).toBe("<h1>listing</h1>");
    expectInline(await get(bucket.asBucket(), "/files/index.html"));
    expectInline(await get(bucket.asBucket(), "/files/photo.png"));
    expectInline(await get(bucket.asBucket(), "/files/notes.txt"));
  });

  test("a copied 404.html is not rendered as the site's not-found page", async () => {
    const bucket = new InMemoryBucket();
    seedDirSite(bucket);
    const response = await get(bucket.asBucket(), "/files/missing.bin");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
    // 直接访问 404.html 本身也是下载
    expectDownload(await get(bucket.asBucket(), "/files/404.html"), "404.html");
  });

  test("non-ASCII file names get an ASCII fallback plus filename*", async () => {
    const bucket = new InMemoryBucket();
    seedDirSite(bucket);
    bucket.seed([{ key: "sites/files/报告.html", body: "<p>x</p>" }]);
    const response = await get(bucket.asBucket(), `/files/${encodeURIComponent("报告.html")}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      `attachment; filename="__.html"; filename*=UTF-8''${encodeURIComponent("报告.html")}`
    );
  });

  test("password-protected dir site: gate first, then attachment", async () => {
    const bucket = new InMemoryBucket();
    seedDirSite(bucket);
    bucket.seed([
      { key: siteConfigKey("files"), body: JSON.stringify({ slug: "files", passwordHash: await sha256Hex("pw") }) },
    ]);
    expect((await get(bucket.asBucket(), "/files/x.html")).status).toBe(401);
    const ok = await get(bucket.asBucket(), "/files/x.html", { headers: { Authorization: `Basic ${utf8ToBase64(":pw")}` } });
    expectDownload(ok, "x.html");
    expect(ok.headers.get("Cache-Control")).toBe("private, max-age=60");
  });

  test("custom hostname dir site applies the same policy", async () => {
    const bucket = new InMemoryBucket();
    seedDirSite(bucket);
    bucket.seed([
      { key: "_$flaredrive$/site-hostnames/files.example.org", body: "files" },
      { key: siteConfigKey("files"), body: JSON.stringify({ slug: "files", hostname: "files.example.org" }) },
    ]);
    expectDownload(await get(bucket.asBucket(), "/x.svg", { host: "files.example.org" }), "x.svg");
    expectInline(await get(bucket.asBucket(), "/", { host: "files.example.org" }));
  });
});

describe("album and docs sites", () => {
  test("album: index renders, leftover svg/html download, images inline", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/pics/index.html", body: "<h1>album</h1>" },
      { key: "sites/pics/a.png", body: "PNG" },
      { key: "sites/pics/old.svg", body: "<svg/>" },
      { key: "sites/pics/old.html", body: "<p/>" },
      { key: `sites/pics/${ALBUM_MANIFEST_NAME}`, body: JSON.stringify({ version: 1, kind: "album", files: ["a.png", "index.html"] }) },
    ]);
    expectInline(await get(bucket.asBucket(), "/pics/"));
    expectInline(await get(bucket.asBucket(), "/pics/a.png"));
    expectDownload(await get(bucket.asBucket(), "/pics/old.svg"), "old.svg");
    expectDownload(await get(bucket.asBucket(), "/pics/old.html"), "old.html");
  });

  test("docs: generated html pages render; svg/js download", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/manual/index.html", body: "<h1>docs</h1>" },
      { key: "sites/manual/guide/intro.html", body: "<h1>intro</h1>" },
      { key: "sites/manual/img/diagram.svg", body: "<svg/>" },
      { key: `sites/manual/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("docs", ["index.html", "guide/intro.html", "img/diagram.svg"]) },
    ]);
    expectInline(await get(bucket.asBucket(), "/manual/guide/intro.html"));
    expectDownload(await get(bucket.asBucket(), "/manual/img/diagram.svg"), "diagram.svg");
  });
});

describe("ordinary static sites are unaffected", () => {
  function seedPlain(bucket: InMemoryBucket) {
    bucket.seed([
      { key: "sites/blog/index.html", body: "<h1>home</h1>" },
      { key: "sites/blog/about.html", body: "<h1>about</h1>" },
      { key: "sites/blog/app.js", body: "console.log(1)" },
      { key: "sites/blog/logo.svg", body: "<svg/>" },
      { key: "sites/blog/style.css", body: "body{}" },
      { key: "sites/blog/404.html", body: "<h1>custom 404</h1>" },
    ]);
  }

  test("html/js/svg render inline and the custom 404 page still works", async () => {
    const bucket = new InMemoryBucket();
    seedPlain(bucket);
    for (const path of ["/blog/", "/blog/about.html", "/blog/app.js", "/blog/logo.svg"]) {
      expectInline(await get(bucket.asBucket(), path));
    }
    const missing = await get(bucket.asBucket(), "/blog/missing.bin");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("<h1>custom 404</h1>");
  });

  test("inert assets and the home page never read the manifest", async () => {
    const bucket = new InMemoryBucket();
    seedPlain(bucket);
    const raw = bucket.asBucket();
    const getSpy = vi.spyOn(raw, "get");
    const headSpy = vi.spyOn(raw, "head");
    await get(raw, "/blog/style.css");
    await get(raw, "/blog/");
    const touched = [...getSpy.mock.calls, ...headSpy.mock.calls].map((call) => String(call[0]));
    expect(touched.some((key) => key.includes(".davflare-"))).toBe(false);
    // active 类型才读清单：一次 get + 一次 head
    getSpy.mockClear();
    headSpy.mockClear();
    await get(raw, "/blog/app.js");
    expect(getSpy.mock.calls.filter((call) => String(call[0]).includes(SITE_MANIFEST_NAME))).toHaveLength(1);
    expect(headSpy.mock.calls.filter((call) => String(call[0]).includes(ALBUM_MANIFEST_NAME))).toHaveLength(1);
  });
});

describe("public directory publish marks the site before copying", () => {
  test("after plan (before copy/finish) copied html already downloads", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("inbox");
    bucket.seed([{ key: "inbox/evil.html", body: "<script>alert(1)</script>" }]);
    const env = { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass", SITES_HOST: "sites.example.com" };
    const post = (dir: unknown) =>
      onRequestPost(
        makeContext(
          new Request("http://drive.example.com/api/sites", {
            method: "POST",
            headers: { Authorization: basicAuthHeader("user", "pass"), "Content-Type": "application/json" },
            body: JSON.stringify({ slug: "inbox", dir }),
          }),
          env
        )
      );
    const plan = (await (await post({ phase: "plan", source: "inbox", lang: "en" })).json()) as { planId: string };
    const manifest = JSON.parse(bucket.rawText(`sites/inbox/${SITE_MANIFEST_NAME}`) ?? "") as { kind: string; files: string[] };
    expect(manifest.kind).toBe("dir");
    expect(manifest.files).toEqual(expect.arrayContaining(["evil.html", "index.html", SITE_MANIFEST_NAME]));
    // 只复制、不 finish（模拟中途放弃）
    expect((await post({ phase: "copy", planId: plan.planId, files: ["evil.html"] })).status).toBe(200);
    expectDownload(await get(bucket.asBucket(), "/inbox/evil.html"), "evil.html");
  });
});
