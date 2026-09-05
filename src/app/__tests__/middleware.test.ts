/**
 * functions/_middleware.ts + functions/_sites.ts 分支级直测：
 * SITES_HOST 接管（静态命中 / index 回退 / spa / 404.html / 纯 404）、
 * 路径穿越与内部前缀保护、图片宿主 /i/{id}、产品路由开关门禁。
 */
import { onRequest } from "../../../functions/_middleware";
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

  test("exact object hit returns 200 with mime/nosniff/cache headers", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    const response = await siteRequest("/blog/app.js", defaultEnv(bucket));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(response.headers.get("ETag")).toMatch(/^"/);
    expect(await response.text()).toBe("console.log(1)");
  });

  test("extensionless directory path falls back to its own index.html", async () => {
    const bucket = new InMemoryBucket();
    seedSite(bucket);
    bucket.seed([
      { key: "sites/blog/about/index.html", body: "<h1>about</h1>", contentType: "text/html" },
    ]);
    const response = await siteRequest("/blog/about", defaultEnv(bucket));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe("<h1>about</h1>");
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
    for (const path of [
      "/blog/%2e%2e/secret",
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
    const next = jest.fn(async () => new Response("next-ok", { status: 200 }));
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
    const next = jest.fn(async () => new Response("next-ok", { status: 200 }));
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

    const next = jest.fn(async () => new Response("next-ok", { status: 200 }));
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
    const next = jest.fn(async () => new Response("next-ok", { status: 200 }));
    for (const path of ["/webdav/", "/mcp", "/api/upload", "/share/tok"]) {
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
