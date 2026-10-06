/**
 * #147 跟进：站点根的清单文件不对外提供；自定义 404 页只属于普通静态站
 * （文档站里名叫 404.md 的笔记生成的 404.html、生成型站点里复制进来的 404.html 都不当 404 页）。
 */
import { onRequest } from "../../../functions/_middleware";
import { ALBUM_MANIFEST_NAME, SITE_MANIFEST_NAME, serializeSiteManifest } from "../../../functions/siteManifest";
import { InMemoryBucket, makeContext } from "../testInMemoryBucket";

function serve(bucket: InMemoryBucket, path: string) {
  const env = { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass", SITES_HOST: "sites.example.com" };
  return onRequest(
    makeContext(new Request(`http://sites.example.com${path}`, { headers: { Host: "sites.example.com" } }), env, {})
  );
}

describe("site manifests are not public", () => {
  test("docs / dir manifest and album manifest return 404 at the site root", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/d/index.html", body: "<h1>d</h1>", contentType: "text/html" },
      { key: `sites/d/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("docs", ["index.html", "secret-note.html"]) },
      { key: "sites/a/index.html", body: "<h1>a</h1>", contentType: "text/html" },
      { key: `sites/a/${ALBUM_MANIFEST_NAME}`, body: JSON.stringify({ images: [{ name: "x.png", src: "x.png" }] }) },
    ]);
    for (const path of [`/d/${SITE_MANIFEST_NAME}`, `/a/${ALBUM_MANIFEST_NAME}`, `/d/${ALBUM_MANIFEST_NAME}`]) {
      const response = await serve(bucket, path);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("secret-note");
    }
    // 站点本身照常
    expect((await serve(bucket, "/d/")).status).toBe(200);
    expect((await serve(bucket, "/a/")).status).toBe(200);
  });

  test("a manifest-named file in a subfolder is a normal file", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: `sites/s/sub/${SITE_MANIFEST_NAME}`, body: "{}", contentType: "application/json" }]);
    expect((await serve(bucket, `/s/sub/${SITE_MANIFEST_NAME}`)).status).toBe(200);
  });
});

describe("custom 404 page only on plain static sites", () => {
  test("a docs note named 404.md is a normal page, not the site's 404 page", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/d/index.html", body: "<h1>d</h1>", contentType: "text/html" },
      { key: "sites/d/404.html", body: "<h1>note called 404</h1>", contentType: "text/html" },
      { key: `sites/d/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("docs", ["index.html", "404.html"]) },
    ]);
    const missing = await serve(bucket, "/d/nope.html");
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toContain("note called 404");
    // 这一页本身仍可直接打开
    const page = await serve(bucket, "/d/404.html");
    expect(page.status).toBe(200);
    expect(page.headers.get("Content-Disposition")).toBeNull();
  });

  test("album / public directory: copied 404.html is not used either", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/p/index.html", body: "<h1>p</h1>", contentType: "text/html" },
      { key: "sites/p/404.html", body: "<h1>user 404</h1>", contentType: "text/html" },
      { key: `sites/p/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("dir", ["index.html", "404.html"]) },
    ]);
    const missing = await serve(bucket, "/p/nope.txt");
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toContain("user 404");
  });

  test("plain static site keeps its custom 404 page", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/s/index.html", body: "<h1>s</h1>", contentType: "text/html" },
      { key: "sites/s/404.html", body: "<h1>custom 404</h1>", contentType: "text/html" },
    ]);
    const missing = await serve(bucket, "/s/nope.html");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("custom 404");
  });
});
