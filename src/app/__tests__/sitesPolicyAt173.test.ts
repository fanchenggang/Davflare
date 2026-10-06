/**
 * #173：生成型站点改回普通站后，直接放进 sites/ 的 html 的 Last-Modified 不能倒退。
 * 普通文件夹发布删掉清单时在站点配置里记 policyAt，Last-Modified 取 max(文件, 清单, policyAt)。
 */
import { onRequest } from "../../../functions/_middleware";
import { onRequestPost } from "../../../functions/api/sites";
import { siteConfigKey, siteConfigPolicyAt } from "../../../functions/_sites";
import { SITE_MANIFEST_NAME, serializeSiteManifest } from "../../../functions/siteManifest";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const AUTH = basicAuthHeader("user", "pass");
const OLD = new Date("2026-01-01T00:00:00.000Z");
const MID = new Date("2026-02-01T00:00:00.000Z");

function env(bucket: InMemoryBucket) {
  return { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass", SITES_HOST: "sites.example.com" };
}

async function publishFolder(bucket: InMemoryBucket, slug: string, source: string) {
  const request = new Request("http://drive.example.com/api/sites", {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({ slug, source }),
  });
  const response = await onRequestPost(makeContext(request, env(bucket)));
  expect(response.status).toBe(200);
}

function serve(bucket: InMemoryBucket, path: string, headers: Record<string, string> = {}) {
  return onRequest(
    makeContext(
      new Request(`http://sites.example.com${path}`, { headers: { Host: "sites.example.com", ...headers } }),
      env(bucket),
      {}
    )
  );
}

function config(bucket: InMemoryBucket, slug: string): Record<string, any> {
  return JSON.parse(bucket.rawText(siteConfigKey(slug)) ?? "null");
}

function seedFolder(bucket: InMemoryBucket) {
  bucket.seedDir("web");
  bucket.seed([{ key: "web/index.html", body: "<h1>home</h1>", contentType: "text/html" }]);
}

describe("#173 Last-Modified after switching back to a plain site", () => {
  test("hand-placed html: inline → generated (download) → plain again never answers 304 to the download-era date", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket);
    await publishFolder(bucket, "qa", "web");
    expect(config(bucket, "qa").policyAt).toBeUndefined();
    // WebDAV 直接放进站点目录的 html（不在源文件夹里）
    bucket.seed([{ key: "sites/qa/x.html", body: "<p>x</p>", contentType: "text/html", uploaded: OLD }]);
    const inline = await serve(bucket, "/qa/x.html");
    expect(inline.headers.get("Content-Disposition")).toBeNull();
    expect(inline.headers.get("Last-Modified")).toBe(OLD.toUTCString());

    // 变成生成型站点：x.html 改为下载，Last-Modified = 清单时间
    bucket.seed([{ key: `sites/qa/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("docs", ["index.html"]), uploaded: MID }]);
    const download = await serve(bucket, "/qa/x.html");
    expect(download.headers.get("Content-Disposition")).toMatch(/^attachment/);
    const downloadEra = download.headers.get("Last-Modified")!;
    expect(downloadEra).toBe(MID.toUTCString());

    // 改回普通站：清单被删，policyAt 记下
    const before = Date.now();
    await publishFolder(bucket, "qa", "web");
    const policyAt = siteConfigPolicyAt(config(bucket, "qa") as any)!;
    expect(policyAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(config(bucket, "qa").source).toBe("web");

    const back = await serve(bucket, "/qa/x.html", { "If-Modified-Since": downloadEra });
    expect(back.status).toBe(200);
    expect(back.headers.get("Content-Disposition")).toBeNull();
    const lastModified = back.headers.get("Last-Modified")!;
    expect(Date.parse(lastModified)).toBeGreaterThan(MID.getTime());
    // 新日期之后照常 304
    expect((await serve(bucket, "/qa/x.html", { "If-Modified-Since": lastModified })).status).toBe(304);
  });

  test("plain → plain re-publish does not touch policyAt", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket);
    await publishFolder(bucket, "qa", "web");
    await publishFolder(bucket, "qa", "web");
    expect(config(bucket, "qa").policyAt).toBeUndefined();
  });

  test("policyAt from config feeds Last-Modified for every file; broken values are ignored", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/s/index.html", body: "<h1>home</h1>", contentType: "text/html", uploaded: OLD },
      { key: "sites/s/pic.png", body: "PNG", uploaded: OLD },
      { key: siteConfigKey("s"), body: JSON.stringify({ slug: "s", policyAt: MID.toISOString() }), contentType: "application/json" },
    ]);
    for (const path of ["/s/", "/s/pic.png"]) {
      const response = await serve(bucket, path);
      expect(response.headers.get("Last-Modified")).toBe(MID.toUTCString());
      expect((await serve(bucket, path, { "If-Modified-Since": OLD.toUTCString() })).status).toBe(200);
    }
    // 文件比 policyAt 新：取文件时间
    bucket.seed([{ key: "sites/s/pic.png", body: "PNG2", uploaded: new Date("2026-04-01T00:00:00.000Z") }]);
    expect((await serve(bucket, "/s/pic.png")).headers.get("Last-Modified")).toBe(
      new Date("2026-04-01T00:00:00.000Z").toUTCString()
    );
    bucket.seed([{ key: siteConfigKey("s"), body: JSON.stringify({ slug: "s", policyAt: "garbage" }), contentType: "application/json" }]);
    expect((await serve(bucket, "/s/")).headers.get("Last-Modified")).toBe(OLD.toUTCString());
    expect(siteConfigPolicyAt(null)).toBeNull();
    expect(siteConfigPolicyAt({ slug: "s" })).toBeNull();
  });
});
