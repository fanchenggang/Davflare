import { vi } from "vitest";
/**
 * functions/_middleware.ts + functions/_sites.ts 分支级直测：
 * SITES_HOST 接管（静态命中 / index 回退 / spa / 404.html / 纯 404）、
 * 路径穿越与内部前缀保护、图片宿主 /i/{id}、产品路由开关门禁。
 */
import { onRequest } from "../../../functions/_middleware";
import { sha256Hex, utf8ToBase64 } from "../../../functions/api/_apikey";
import {
  isValidSlug,
  mimeForKey,
  parseSitesPath,
  siteConfigKey,
} from "../../../functions/_sites";
import { InMemoryBucket, makeContext } from "../testInMemoryBucket";

const HOST = "http://sites.example.com";
const IMAGE_ID = "0123456789abcdef0123456789abcdef";

interface MiddlewareEnv {
  BUCKET: R2Bucket;
  SITES_HOST?: string;
}

function makeEnv(bucket: InMemoryBucket, extra: Record<string, unknown> = {}): MiddlewareEnv {
  return { BUCKET: bucket.asBucket(), ...extra };
}

function siteRequest(
  path: string,
  env: MiddlewareEnv,
  options: { method?: string; host?: string; headers?: Record<string, string>; next?: () => Promise<Response> } = {}
) {
  const request = new Request(`${HOST}${path}`, {
    method: options.method ?? "GET",
    headers: { Host: options.host ?? "sites.example.com", ...(options.headers ?? {}) },
  });
  return onRequest(makeContext(request, env, {}, options.next));
}

function defaultEnv(bucket: InMemoryBucket) {
  return makeEnv(bucket, { SITES_HOST: "sites.example.com" });
}

describe("sites path parsing (parseSitesPath / helpers)", () => {
  test("valid slugs and keys", () => {
    expect(parseSitesPath("/blog/index.html")).toEqual({
      ok: true,
      slug: "blog",
      key: "sites/blog/index.html",
      tryIndex: false,
    });
    expect(parseSitesPath("/blog")).toEqual({
      ok: true,
      slug: "blog",
      key: "sites/blog/index.html",
      tryIndex: false,
      redirectToSlash: true,
    });
    expect(parseSitesPath("/Blog/style.CSS")).toEqual({
      ok: true,
      slug: "blog",
      key: "sites/blog/style.CSS",
      tryIndex: false,
    });
    expect(parseSitesPath("/blog/sub/page")).toEqual({
      ok: true,
      slug: "blog",
      key: "sites/blog/sub/page",
      tryIndex: true,
    });
  });

  test("rejects traversal, encoded traversal, internal prefixes and bad slugs", () => {
    expect(parseSitesPath("/blog/../secret").ok).toBe(false);
    expect(parseSitesPath("/blog/%2e%2e/secret").ok).toBe(false);
    expect(parseSitesPath("/blog/%2e%2e%2fsecret").ok).toBe(false);
    expect(parseSitesPath("/blog/_$flaredrive$/apikeys/x").ok).toBe(false);
    expect(parseSitesPath("/_$flaredrive$/config.json").ok).toBe(false);
    expect(parseSitesPath("/").ok).toBe(false);
    expect(parseSitesPath("/Bad_Slug/x").ok).toBe(false);
    // 文件名内部的合法 "a..b" 不受影响
    expect(parseSitesPath("/blog/a..b.html").ok).toBe(true);
  });

  test("slug regex and mime table", () => {
    expect(isValidSlug("blog")).toBe(true);
    expect(isValidSlug("-blog")).toBe(false);
    expect(isValidSlug("Blog")).toBe(false);
    expect(mimeForKey("sites/x/index.html")).toBe("text/html; charset=utf-8");
    expect(mimeForKey("sites/x/app.js")).toBe("text/javascript; charset=utf-8");
    expect(mimeForKey("sites/x/data.weird")).toBe("application/octet-stream");
    expect(siteConfigKey("blog")).toBe("_$flaredrive$/sites/blog.json");
  });
});

describe("sites host: static serving", () => {
  function seedSite(bucket: InMemoryBucket, slug = "blog") {
    bucket.seed([
      { key: `sites/${slug}/index.html`, body: "<h1>home</h1>", contentType: "text/html" },
      { key: `sites/${slug}/app.js`, body: "console.log(1)", contentType: "text/javascript" },
      { key: `sites/${slug}/data.bin`, body: "\x00\x01", contentType: "application/octet-stream" },
    ]);
  }

  test("site content always revalidates; a matching ETag gets 304 without a body (#156)", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const first = await siteRequest("/blog/app.js", defaultEnv(bucket));
    const etag = first.headers.get("ETag")!;
    expect(first.headers.get("Cache-Control")).toBe("public, no-cache");
    const again = await siteRequest("/blog/app.js", defaultEnv(bucket), { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect(again.headers.get("ETag")).toBe(etag);
    expect(again.headers.get("Cache-Control")).toBe("public, no-cache");
    const weak = await siteRequest("/blog/app.js", defaultEnv(bucket), { headers: { "If-None-Match": `"x", W/${etag}` } });
    expect(weak.status).toBe(304);
    const stale = await siteRequest("/blog/app.js", defaultEnv(bucket), { headers: { "If-None-Match": '"old"' } });
    expect(stale.status).toBe(200);
  });

  test("after a password is set, a revalidating cached copy gets 401, not 304 (#156)", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const first = await siteRequest("/blog/app.js", defaultEnv(bucket));
    const etag = first.headers.get("ETag")!;
    const passwordHash = await sha256Hex("gate");
    bucket.seed([{ key: siteConfigKey("blog"), body: JSON.stringify({ slug: "blog", passwordHash }), contentType: "application/json" }]);
    const revalidate = await siteRequest("/blog/app.js", defaultEnv(bucket), { headers: { "If-None-Match": etag } });
    expect(revalidate.status).toBe(401);
    const authed = await siteRequest("/blog/app.js", defaultEnv(bucket), {
      headers: { "If-None-Match": etag, Authorization: `Basic ${utf8ToBase64(":gate")}` },
    });
    // 公开时缓存的副本（旧 ETag）换了规则：拿到完整的 200 和新的 private 头，而不是 304 续用旧头（#170）
    expect(authed.status).toBe(200);
    expect(authed.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(authed.headers.get("Vary")).toBe("Authorization");
    const privateEtag = authed.headers.get("ETag")!;
    expect(privateEtag).not.toBe(etag);
    const again = await siteRequest("/blog/app.js", defaultEnv(bucket), {
      headers: { "If-None-Match": privateEtag, Authorization: `Basic ${utf8ToBase64(":gate")}` },
    });
    expect(again.status).toBe(304);
    expect(again.headers.get("Cache-Control")).toBe("private, no-cache");
  });

  test("exact object hit returns 200 with mime/nosniff/cache headers", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const response = await siteRequest("/blog/app.js", defaultEnv(bucket));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("public, no-cache");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(response.headers.get("ETag")).toMatch(/^"/);
    expect(await response.text()).toBe("console.log(1)");
  });

  test("extensionless directory path 301s to its slash form; slash form serves index.html (#145)", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    bucket.seed([
      { key: "sites/blog/about/index.html", body: "<h1>about</h1>", contentType: "text/html" },
    ]);
    const redirect = await siteRequest("/blog/about?x=1&y=%E4%B8%AD", defaultEnv(bucket));
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("Location")).toBe("http://sites.example.com/blog/about/?x=1&y=%E4%B8%AD");
    expect(redirect.headers.get("Cache-Control")).toBe("public, max-age=300");
    const response = await siteRequest("/blog/about/", defaultEnv(bucket));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe("<h1>about</h1>");
  });

  test("folder-marker objects are directories: 301 when sub/index.html exists (#157)", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    // MKCOL / 新建文件夹 / 上传 API 都会写 0 字节 x-directory 标记，key 不带尾斜杠
    bucket.seedDir("sites/blog/guide");
    bucket.seedDir("sites/blog/v1.2");
    bucket.seed([
      { key: "sites/blog/guide/index.html", body: "<h1>guide</h1>", contentType: "text/html" },
      { key: "sites/blog/v1.2/index.html", body: "<h1>v1.2</h1>", contentType: "text/html" },
    ]);
    for (const method of ["GET", "HEAD"]) {
      const redirect = await siteRequest("/blog/guide?x=1", defaultEnv(bucket), { method });
      expect(redirect.status).toBe(301);
      expect(redirect.headers.get("Location")).toBe("http://sites.example.com/blog/guide/?x=1");
    }
    // 目录名带点（tryIndex=false）也按目录处理
    const dotted = await siteRequest("/blog/v1.2", defaultEnv(bucket));
    expect(dotted.status).toBe(301);
    expect(dotted.headers.get("Location")).toBe("http://sites.example.com/blog/v1.2/");
    const page = await siteRequest("/blog/guide/", defaultEnv(bucket));
    expect(page.status).toBe(200);
    expect(await page.text()).toBe("<h1>guide</h1>");
  });

  test("a folder marker without index.html is never served as an empty 200 file (#157)", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    bucket.seedDir("sites/blog/empty");
    bucket.seed([
      { key: "sites/blog/typed", body: new Uint8Array(0), contentType: "application/x-directory" },
      { key: "sites/blog/meta", body: new Uint8Array(0), customMetadata: { resourcetype: "<collection />" } },
    ]);
    for (const path of ["/blog/empty", "/blog/typed", "/blog/meta"]) {
      const response = await siteRequest(path, defaultEnv(bucket));
      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).not.toBe("application/x-directory");
    }
    // 站点有 404.html 时走 404 页面，同样不是 200
    bucket.seed([{ key: "sites/blog/404.html", body: "<h1>nope</h1>", contentType: "text/html" }]);
    const custom = await siteRequest("/blog/empty", defaultEnv(bucket));
    expect(custom.status).toBe(404);
    expect(await custom.text()).toBe("<h1>nope</h1>");
  });

  test("folder marker on a password-protected site: gate first, then private redirect (#157)", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const passwordHash = await sha256Hex("gate");
    bucket.seedDir("sites/blog/guide");
    bucket.seed([
      { key: "sites/blog/guide/index.html", body: "<h1>guide</h1>", contentType: "text/html" },
      { key: siteConfigKey("blog"), body: JSON.stringify({ slug: "blog", passwordHash }), contentType: "application/json" },
    ]);
    expect((await siteRequest("/blog/guide", defaultEnv(bucket))).status).toBe(401);
    const ok = await siteRequest("/blog/guide", defaultEnv(bucket), {
      headers: { Authorization: `Basic ${utf8ToBase64(":gate")}` },
    });
    expect(ok.status).toBe(301);
    expect(ok.headers.get("Cache-Control")).toBe("private, max-age=60");
  });

  test("ordinary extensionless files are still served as files", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    bucket.seed([{ key: "sites/blog/LICENSE", body: "MIT", contentType: "text/plain" }]);
    const response = await siteRequest("/blog/LICENSE", defaultEnv(bucket));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("MIT");
  });

  test("site root without trailing slash 301s to /{slug}/ keeping the query (#145)", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const response = await siteRequest("/blog?utm=a%20b", defaultEnv(bucket));
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("http://sites.example.com/blog/?utm=a%20b");
    expect(await response.text()).toBe("");
    const head = await siteRequest("/Blog", defaultEnv(bucket), { method: "HEAD" });
    expect(head.status).toBe(301);
    expect(head.headers.get("Location")).toBe("http://sites.example.com/Blog/");
  });

  test("root redirect is unconditional: no R2 read, no password/existence leak (#145)", async () => {
    const bucket = new InMemoryBucket();
    const passwordHash = await sha256Hex("gate");
    bucket.seed([
      { key: "sites/secret/index.html", body: "<h1>s</h1>", contentType: "text/html" },
      { key: siteConfigKey("secret"), body: JSON.stringify({ slug: "secret", passwordHash }), contentType: "application/json" },
    ]);
    const env = defaultEnv(bucket);
    const getSpy = vi.spyOn(env.BUCKET, "get");
    const secret = await siteRequest("/secret", env);
    const missing = await siteRequest("/nope", env);
    expect(secret.status).toBe(301);
    expect(missing.status).toBe(301);
    // 只有 flags 读取；不读站点配置、不读 index.html
    expect(getSpy.mock.calls.map((call) => String(call[0])).filter((key) => key.includes("sites"))).toEqual([]);
  });

  test("a real extensionless file wins over the directory redirect", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    bucket.seed([
      { key: "sites/blog/LICENSE", body: "MIT", contentType: "text/plain" },
      { key: "sites/blog/LICENSE/index.html", body: "<h1>dir</h1>", contentType: "text/html" },
    ]);
    const response = await siteRequest("/blog/LICENSE", defaultEnv(bucket));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("MIT");
  });

  test("extensionless path without a directory index is a plain miss, not a redirect", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const response = await siteRequest("/blog/nothing", defaultEnv(bucket));
    expect(response.status).toBe(404);
    expect(response.headers.get("Location")).toBeNull();
  });

  test("redirect location stays on this origin for //-prefixed paths", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const response = await siteRequest("//blog", defaultEnv(bucket));
    expect(response.status).toBe(301);
    const location = new URL(response.headers.get("Location") || "", "http://other.invalid");
    expect(location.host).toBe("sites.example.com");
  });

  test("root path serves index.html directly", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const response = await siteRequest("/blog/", defaultEnv(bucket));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<h1>home</h1>");
  });

  test("unknown extension falls back to octet-stream", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const response = await siteRequest("/blog/data.bin", defaultEnv(bucket));
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  test("HEAD returns headers without body", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const response = await siteRequest("/blog/app.js", defaultEnv(bucket), { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  test("plain miss without spa/404 page is a bare 404", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const response = await siteRequest("/blog/missing.png", defaultEnv(bucket));
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("Not Found");
  });

  test("spa=true falls back to the site index.html on miss", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    bucket.seed([
      {
        key: siteConfigKey("blog"),
        body: JSON.stringify({ slug: "blog", spa: true }),
        contentType: "application/json",
      },
    ]);
    const response = await siteRequest("/blog/missing.png", defaultEnv(bucket));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe("<h1>home</h1>");
  });

  test("custom 404.html is served with 404 status and no-store", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    bucket.seed([
      { key: "sites/blog/404.html", body: "<h1>custom 404</h1>", contentType: "text/html" },
    ]);
    const response = await siteRequest("/blog/missing.png", defaultEnv(bucket));
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("<h1>custom 404</h1>");
  });

  test("non-GET/HEAD methods on the sites host are 405", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const response = await siteRequest("/blog/app.js", defaultEnv(bucket), { method: "DELETE" });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
  });

  test("malformed paths (traversal / internal prefix / root) are plain 404", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    // WHATWG URL 会把 /blog/%2e%2e/secret 规范化成 /secret（裸 slug），按 #145 跳到 /secret/，那里同样 404
    const normalized = await siteRequest("/blog/%2e%2e/secret", defaultEnv(bucket));
    expect(normalized.status).toBe(301);
    expect(normalized.headers.get("Location")).toBe("http://sites.example.com/secret/");
    expect((await siteRequest("/secret/", defaultEnv(bucket))).status).toBe(404);
    for (const path of [
      "/blog/%2e%2e%2fsecret",
      "/blog/_$flaredrive$/apikeys/x.json",
      "/_$flaredrive$/config.json",
      "/",
      "/Bad_Slug/x",
    ]) {
      const response = await siteRequest(path, defaultEnv(bucket));
      expect(response.status).toBe(404);
    }
  });


  test("passwordProtected site rejects without auth and allows with Basic password", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const passwordHash = await sha256Hex("s3cret");
    bucket.seed([
      {
        key: siteConfigKey("blog"),
        body: JSON.stringify({ slug: "blog", passwordHash }),
        contentType: "application/json",
      },
    ]);
    const env = defaultEnv(bucket);

    const rejected = await siteRequest("/blog/app.js", env);
    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("WWW-Authenticate")).toMatch(/Basic/i);
    expect(rejected.headers.get("Cache-Control")).toBe("no-store");

    const wrong = await siteRequest("/blog/app.js", env, {
      headers: { Authorization: `Basic ${utf8ToBase64("anyone:wrong")}` },
    });
    expect(wrong.status).toBe(401);

    const allowed = await siteRequest("/blog/app.js", env, {
      headers: { Authorization: `Basic ${utf8ToBase64(":s3cret")}` },
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toBe("console.log(1)");
    expect(allowed.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(allowed.headers.get("Vary")).toBe("Authorization");
  });

  test("password gate blocks before SPA / 404 content", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    bucket.seed([
      {
        key: siteConfigKey("blog"),
        body: JSON.stringify({
          slug: "blog",
          spa: true,
          passwordHash: await sha256Hex("gate"),
        }),
        contentType: "application/json",
      },
      { key: "sites/blog/404.html", body: "<h1>custom 404</h1>", contentType: "text/html" },
    ]);
    const blocked = await siteRequest("/blog/missing.png", defaultEnv(bucket));
    expect(blocked.status).toBe(401);

    const withAuth = await siteRequest("/blog/missing.png", defaultEnv(bucket), {
      headers: { Authorization: `Basic ${utf8ToBase64("u:gate")}` },
    });
    expect(withAuth.status).toBe(200);
    expect(await withAuth.text()).toBe("<h1>home</h1>");
  });

  test("public site still uses public cache when no passwordHash", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const response = await siteRequest("/blog/app.js", defaultEnv(bucket));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, no-cache");
    expect(response.headers.get("Vary")).toBeNull();
  });

  test("custom hostname serves slug at domain root", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    bucket.seed([
      {
        key: "_$flaredrive$/site-hostnames/blog.example.com",
        body: "blog",
        contentType: "text/plain",
      },
      {
        key: siteConfigKey("blog"),
        body: JSON.stringify({ slug: "blog", hostname: "blog.example.com" }),
        contentType: "application/json",
      },
    ]);
    const env = makeEnv(bucket, { SITES_HOST: "sites.example.com" });
    const root = await siteRequest("/", env, { host: "blog.example.com" });
    expect(root.status).toBe(200);
    expect(await root.text()).toBe("<h1>home</h1>");

    const asset = await siteRequest("/app.js", env, { host: "blog.example.com" });
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("console.log(1)");

    // Path-based SITES_HOST still works
    const pathBased = await siteRequest("/blog/app.js", env);
    expect(pathBased.status).toBe(200);
  });

  test("custom hostname does not shadow /collect (#154 N2)", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    bucket.seed([
      { key: "_$flaredrive$/site-hostnames/blog.example.com", body: "blog", contentType: "text/plain" },
      {
        key: siteConfigKey("blog"),
        body: JSON.stringify({ slug: "blog", hostname: "blog.example.com" }),
        contentType: "application/json",
      },
      // 站点里恰好有 collect/ 目录：也不能把收集链接盖掉
      { key: "sites/blog/collect/index.html", body: "<h1>site collect</h1>", contentType: "text/html" },
    ]);
    const env = makeEnv(bucket, { SITES_HOST: "sites.example.com" });
    const next = vi.fn(async () => new Response("next-ok", { status: 200 }));
    for (const path of ["/collect", "/collect/", "/collect/0123456789abcdef0123456789abcdef"]) {
      next.mockClear();
      const response = await siteRequest(path, env, { host: "blog.example.com", next });
      expect(next).toHaveBeenCalledTimes(1);
      expect(await response.text()).toBe("next-ok");
    }
    // 只排除 /collect 本身与其子路径，/collector 之类仍走站点
    next.mockClear();
    const other = await siteRequest("/collector", env, { host: "blog.example.com", next });
    expect(next).not.toHaveBeenCalled();
    expect(other.status).toBe(404);
  });

  test("custom hostname: subdirectory without slash 301s, password gate first (#145)", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const passwordHash = await sha256Hex("gate");
    bucket.seed([
      { key: "sites/blog/docs/index.html", body: "<h1>docs</h1>", contentType: "text/html" },
      { key: "_$flaredrive$/site-hostnames/blog.example.com", body: "blog", contentType: "text/plain" },
      {
        key: siteConfigKey("blog"),
        body: JSON.stringify({ slug: "blog", hostname: "blog.example.com", passwordHash }),
        contentType: "application/json",
      },
    ]);
    const env = makeEnv(bucket, { SITES_HOST: "sites.example.com" });
    const blocked = await siteRequest("/docs?q=1", env, { host: "blog.example.com" });
    expect(blocked.status).toBe(401);
    const ok = await siteRequest("/docs?q=1", env, {
      host: "blog.example.com",
      headers: { Authorization: `Basic ${utf8ToBase64(":gate")}` },
    });
    expect(ok.status).toBe(301);
    expect(new URL(ok.headers.get("Location") || "").pathname).toBe("/docs/");
    expect(new URL(ok.headers.get("Location") || "").search).toBe("?q=1");
    expect(ok.headers.get("Cache-Control")).toBe("private, max-age=60");
    expect(ok.headers.get("Vary")).toBe("Authorization");
  });

  test("custom hostname respects password gate then content", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const passwordHash = await sha256Hex("gate");
    bucket.seed([
      {
        key: "_$flaredrive$/site-hostnames/blog.example.com",
        body: "blog",
        contentType: "text/plain",
      },
      {
        key: siteConfigKey("blog"),
        body: JSON.stringify({
          slug: "blog",
          hostname: "blog.example.com",
          passwordHash,
        }),
        contentType: "application/json",
      },
    ]);
    const env = makeEnv(bucket, { SITES_HOST: "sites.example.com" });
    const blocked = await siteRequest("/", env, { host: "blog.example.com" });
    expect(blocked.status).toBe(401);
    const ok = await siteRequest("/", env, {
      host: "blog.example.com",
      headers: { Authorization: `Basic ${utf8ToBase64(":gate")}` },
    });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("<h1>home</h1>");
  });

  test("sites flag off 404s slug routes but keeps images host working", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    bucket.seed([
      {
        key: "_$flaredrive$/config.json",
        body: JSON.stringify({ sites: false }),
        contentType: "application/json",
      },
      {
        key: "_$flaredrive$/img/" + IMAGE_ID,
        body: "png",
        customMetadata: { contentType: "image/png" },
      },
    ]);
    const env = makeEnv(bucket, { SITES_HOST: "sites.example.com" });
    const slug = await siteRequest("/blog/app.js", env);
    expect(slug.status).toBe(404);
    const image = await siteRequest(`/i/${IMAGE_ID}`, env);
    expect(image.status).toBe(200);
  });
});

describe("sites host: image routes (/i/{id})", () => {
  function seedImage(bucket: InMemoryBucket, contentType = "image/png", name?: string) {
    bucket.seed([
      {
        key: "_$flaredrive$/img/" + IMAGE_ID,
        body: "image-bytes",
        customMetadata: {
          contentType,
          ...(name ? { name } : {}),
        },
      },
    ]);
  }

  test("serves the image with inline disposition and long cache", async () => {
    const bucket = new InMemoryBucket();
    seedImage(bucket, "image/png", "shot.png");
    const response = await siteRequest(`/i/${IMAGE_ID}`, defaultEnv(bucket));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Content-Disposition")).toBe("inline");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(await response.text()).toBe("image-bytes");
  });

  test("svg content is forced to attachment", async () => {
    const bucket = new InMemoryBucket();
    seedImage(bucket, "image/svg+xml", "logo.svg");
    const response = await siteRequest(`/i/${IMAGE_ID}`, defaultEnv(bucket));
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment;/);
  });

  test("missing image is 404; bad id is 404", async () => {
    const bucket = new InMemoryBucket();
    expect((await siteRequest(`/i/${IMAGE_ID}`, defaultEnv(bucket))).status).toBe(404);
    expect((await siteRequest("/i/nothex", defaultEnv(bucket))).status).toBe(404);
  });

  test("imageHost flag off 404s image routes even when sites is on", async () => {
    const bucket = new InMemoryBucket();
    seedImage(bucket);
    bucket.seed([
      {
        key: "_$flaredrive$/config.json",
        body: JSON.stringify({ imageHost: false }),
        contentType: "application/json",
      },
    ]);
    const response = await siteRequest(`/i/${IMAGE_ID}`, defaultEnv(bucket));
    expect(response.status).toBe(404);
  });
});

describe("sites host host-matching", () => {
  test("non-matching Host falls through to product routing (next)", async () => {
    const bucket = new InMemoryBucket();
    const next = vi.fn(async () => new Response("next-ok", { status: 200 }));
    const response = await siteRequest("/blog/app.js", defaultEnv(bucket), {
      host: "drive.example.com",
      next,
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("next-ok");
  });

  test("SITES_HOST comparison ignores case, port and trailing dot", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/blog/index.html", body: "hi", contentType: "text/html" },
    ]);
    const env = makeEnv(bucket, { SITES_HOST: "Sites.Example.com." });
    const response = await siteRequest("/blog/", env, { host: "sites.example.com:8443" });
    expect(response.status).toBe(200);
  });

  test("missing SITES_HOST config never takes over", async () => {
    const bucket = new InMemoryBucket();
    const next = vi.fn(async () => new Response("next-ok", { status: 200 }));
    const response = await siteRequest("/blog/", makeEnv(bucket), { next });
    expect(next).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe("next-ok");
  });
});

describe("drive product route gates (webdav/mcp)", () => {
  test("webdav disabled returns 404 unless the UI client header is present", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      {
        key: "_$flaredrive$/config.json",
        body: JSON.stringify({ webdav: false }),
        contentType: "application/json",
      },
    ]);
    const blocked = await siteRequest("/webdav/", makeEnv(bucket), {
      host: "drive.example.com",
    });
    expect(blocked.status).toBe(404);
    expect(blocked.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const next = vi.fn(async () => new Response("next-ok", { status: 200 }));
    const allowed = await siteRequest("/webdav/", makeEnv(bucket), {
      host: "drive.example.com",
      headers: { "X-Davflare-UI": "1" },
      next,
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(allowed.status).toBe(200);
  });

  test("mcp requires both mcp and apiKey flags", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      {
        key: "_$flaredrive$/config.json",
        body: JSON.stringify({ mcp: false, apiKey: true }),
        contentType: "application/json",
      },
    ]);
    const blocked = await siteRequest("/mcp", makeEnv(bucket), {
      host: "drive.example.com",
    });
    expect(blocked.status).toBe(404);

    const bucket2 = new InMemoryBucket();
    bucket2.seed([
      {
        key: "_$flaredrive$/config.json",
        body: JSON.stringify({ mcp: true, apiKey: false }),
        contentType: "application/json",
      },
    ]);
    const blocked2 = await siteRequest("/mcp", makeEnv(bucket2), {
      host: "drive.example.com",
    });
    expect(blocked2.status).toBe(404);
  });

  test("enabled product routes and /api/* paths pass through to next", async () => {
    const bucket = new InMemoryBucket();
    const next = vi.fn(async () => new Response("next-ok", { status: 200 }));
    for (const path of ["/webdav/", "/mcp", "/api/upload", "/share/tok", "/collect/tok"]) {
      next.mockClear();
      const response = await siteRequest(path, makeEnv(bucket), {
        host: "drive.example.com",
        next,
      });
      expect(next).toHaveBeenCalledTimes(1);
      expect(await response.text()).toBe("next-ok");
    }
  });
});
