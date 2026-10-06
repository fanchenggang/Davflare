/**
 * #170：站点换成生成型后，旧的内联 svg/js 不能再被 304 续用。
 * - 服务规则（强制下载 / 密码）编进 ETag；
 * - Last-Modified 取文件与清单的较新者，If-Modified-Since 也不会续用旧副本；
 * - html/svg/xml/js 带 CDN-Cache-Control: no-store，边缘不存。
 */
import { onRequest } from "../../../functions/_middleware";
import { siteVariantEtag } from "../../../functions/_sites";
import { ALBUM_MANIFEST_NAME, SITE_MANIFEST_NAME, serializeSiteManifest } from "../../../functions/siteManifest";
import { InMemoryBucket, makeContext } from "../testInMemoryBucket";

const OLD = new Date("2026-01-01T00:00:00.000Z");
const LATER = new Date("2026-03-01T00:00:00.000Z");

function serve(bucket: InMemoryBucket, path: string, headers: Record<string, string> = {}) {
  const env = { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass", SITES_HOST: "sites.example.com" };
  return onRequest(
    makeContext(new Request(`http://sites.example.com${path}`, { headers: { Host: "sites.example.com", ...headers } }), env, {})
  );
}

function seedPlain(bucket: InMemoryBucket) {
  bucket.seed([
    { key: "sites/s/index.html", body: "<h1>home</h1>", contentType: "text/html", uploaded: OLD },
    { key: "sites/s/evil.svg", body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', uploaded: OLD },
    { key: "sites/s/app.js", body: "alert(1)", uploaded: OLD },
    { key: "sites/s/pic.png", body: "PNG", uploaded: OLD },
  ]);
}

const SWITCHES: Array<[string, (bucket: InMemoryBucket) => void]> = [
  ["docs", (b) => b.seed([{ key: `sites/s/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("docs", ["index.html"]), uploaded: LATER }])],
  ["dir", (b) => b.seed([{ key: `sites/s/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("dir", ["index.html"]), uploaded: LATER }])],
  ["album", (b) => b.seed([{ key: `sites/s/${ALBUM_MANIFEST_NAME}`, body: JSON.stringify({ images: [] }), uploaded: LATER }])],
];

describe("#170 plain → generated: cached inline copies are not revalidated", () => {
  for (const [kind, switchTo] of SWITCHES) {
    for (const file of ["evil.svg", "app.js"]) {
      test(`${kind}: ${file} with the old ETag / Last-Modified gets 200 + attachment, not 304`, async () => {
        const bucket = new InMemoryBucket();
        seedPlain(bucket);
        const first = await serve(bucket, `/s/${file}`);
        expect(first.status).toBe(200);
        expect(first.headers.get("Content-Disposition")).toBeNull();
        expect(first.headers.get("CDN-Cache-Control")).toBe("no-store");
        const etag = first.headers.get("ETag")!;
        const lastModified = first.headers.get("Last-Modified")!;
        expect(etag).toBeTruthy();
        expect(lastModified).toBe(OLD.toUTCString());
        // 普通站内同一副本照常 304
        expect((await serve(bucket, `/s/${file}`, { "If-None-Match": etag })).status).toBe(304);

        switchTo(bucket);
        for (const headers of <Array<Record<string, string>>>[
          { "If-None-Match": etag },
          { "If-None-Match": `W/${etag}` },
          { "If-Modified-Since": lastModified },
        ]) {
          const revalidate = await serve(bucket, `/s/${file}`, headers);
          expect(revalidate.status).toBe(200);
          expect(revalidate.headers.get("Content-Disposition")).toMatch(/^attachment/);
          expect(revalidate.headers.get("Content-Security-Policy")).toBe("sandbox");
          expect(revalidate.headers.get("ETag")).not.toBe(etag);
        }
        // 新规则下的副本可以 304，且 304 仍带 attachment + sandbox
        const fresh = await serve(bucket, `/s/${file}`);
        const ok = await serve(bucket, `/s/${file}`, { "If-None-Match": fresh.headers.get("ETag")! });
        expect(ok.status).toBe(304);
        expect(ok.headers.get("Content-Disposition")).toMatch(/^attachment/);
        const byDate = await serve(bucket, `/s/${file}`, { "If-Modified-Since": fresh.headers.get("Last-Modified")! });
        expect(byDate.status).toBe(304);
        expect(fresh.headers.get("Last-Modified")).toBe(LATER.toUTCString());
      });
    }
  }

  test("html gets Last-Modified and If-Modified-Since 304 (ETag may be stripped by Email Obfuscation)", async () => {
    const bucket = new InMemoryBucket();
    seedPlain(bucket);
    const first = await serve(bucket, "/s/");
    expect(first.headers.get("Last-Modified")).toBe(OLD.toUTCString());
    expect(first.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect((await serve(bucket, "/s/", { "If-Modified-Since": OLD.toUTCString() })).status).toBe(304);
    expect((await serve(bucket, "/s/", { "If-Modified-Since": new Date(OLD.getTime() - 1000).toUTCString() })).status).toBe(200);
    // If-None-Match 优先：不匹配时不看 If-Modified-Since
    expect((await serve(bucket, "/s/", { "If-None-Match": '"other"', "If-Modified-Since": OLD.toUTCString() })).status).toBe(200);
    expect((await serve(bucket, "/s/", { "If-Modified-Since": "garbage" })).status).toBe(200);
  });

  test("non-active files keep edge caching and plain ETags", async () => {
    const bucket = new InMemoryBucket();
    seedPlain(bucket);
    const png = await serve(bucket, "/s/pic.png");
    expect(png.headers.get("CDN-Cache-Control")).toBeNull();
    expect(png.headers.get("ETag")).toMatch(/^"[^"]+"$/);
    expect(png.headers.get("ETag")).not.toMatch(/-dl|-p"/);
  });
});

describe("siteVariantEtag", () => {
  test("suffix goes inside the quotes; weak prefix kept; plain responses unchanged", () => {
    expect(siteVariantEtag('"abc"', {})).toBe('"abc"');
    expect(siteVariantEtag('"abc"', { download: true })).toBe('"abc-dl"');
    expect(siteVariantEtag('"abc"', { privateCache: true })).toBe('"abc-p"');
    expect(siteVariantEtag('W/"abc"', { download: true, privateCache: true })).toBe('W/"abc-dl-p"');
    expect(siteVariantEtag(undefined, { download: true })).toBeUndefined();
  });
});
