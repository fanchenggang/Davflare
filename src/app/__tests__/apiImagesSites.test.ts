/**
 * functions/api/images + sites 分支级直测：图床开关 404、上传类型/大小校验、
 * 记录元数据与公开 URL；站点列表/统计缓存、发布拷贝、spa/密码/主机名配置、
 * 删除（含 purge）。
 */
import {
  onRequestGet as imagesOnGet,
  onRequestPost as imagesOnPost,
  onRequestDelete as imagesOnDelete,
} from "../../../functions/api/images";
import {
  onRequestGet as sitesOnGet,
  onRequestPost as sitesOnPost,
  onRequestDelete as sitesOnDelete,
} from "../../../functions/api/sites";
import { IMAGE_PREFIX, imageObjectKey } from "../../../functions/_images";
import { siteConfigKey, siteHostnameKey } from "../../../functions/_sites";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const HOST = "http://drive.example.com";
const AUTH = basicAuthHeader("user", "pass");
const CONFIG_KEY = "_$flaredrive$/config.json";
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeEnv(bucket: InMemoryBucket, extra: Record<string, unknown> = {}) {
  return {
    BUCKET: bucket.asBucket(),
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
    ...extra,
  };
}

function request(path: string, method: string, init?: { body?: BodyInit; headers?: Record<string, string> }) {
  return new Request(`${HOST}${path}`, {
    method,
    headers: { Authorization: AUTH, ...init?.headers },
    body: init?.body,
  });
}

function seedFlagOff(bucket: InMemoryBucket, flag: string) {
  bucket.seed([
    { key: CONFIG_KEY, body: JSON.stringify({ [flag]: false }), contentType: "application/json" },
  ]);
}

describe("images", () => {
  test("未授权 401；imageHost 关闭时三个动词都 404", async () => {
    const bucket = new InMemoryBucket();
    const noAuth = await imagesOnGet(
      makeContext(new Request(`${HOST}/api/images`), makeEnv(bucket))
    );
    expect(noAuth.status).toBe(401);

    seedFlagOff(bucket, "imageHost");
    const env = makeEnv(bucket);
    expect((await imagesOnGet(makeContext(request("/api/images", "GET"), env))).status).toBe(404);
    expect(
      (await imagesOnPost(makeContext(request("/api/images", "POST", { body: PNG_BYTES }), env))).status
    ).toBe(404);
    expect(
      (await imagesOnDelete(makeContext(request("/api/images?id=x", "DELETE"), env))).status
    ).toBe(404);
  });

  test("GET 列表：跳过非法 id、按上传时间倒序、无 SITES_HOST 时 url 为 null", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      {
        key: imageObjectKey("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"),
        body: PNG_BYTES,
        contentType: "image/png",
        customMetadata: { name: "one.png", contentType: "image/png" },
        uploaded: new Date("2026-02-01T00:00:00.000Z"),
      },
      {
        key: imageObjectKey("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2"),
        body: PNG_BYTES,
        contentType: "image/png",
        customMetadata: { name: "two.png", contentType: "image/png" },
        uploaded: new Date("2026-03-01T00:00:00.000Z"),
      },
      // 非 32 hex 的键不是图床对象，跳过
      { key: `${IMAGE_PREFIX}not-an-id`, body: "x" },
    ]);
    const response = await imagesOnGet(makeContext(request("/api/images", "GET"), makeEnv(bucket)));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      sitesHost: string | null;
      images: Array<Record<string, unknown>>;
    };
    expect(body.sitesHost).toBeNull();
    expect(body.images.map((image) => image.name)).toEqual(["two.png", "one.png"]);
    expect(body.images[0].url).toBeNull();
    expect(body.images[0].markdown).toBe("");
    expect(body.images[0].size).toBe(PNG_BYTES.byteLength);
  });

  test("GET 列表：SITES_HOST 存在时给公开 URL 与 markdown", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      {
        key: imageObjectKey("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
        body: PNG_BYTES,
        contentType: "image/png",
        customMetadata: { name: "pic.png", contentType: "image/png" },
      },
    ]);
    const response = await imagesOnGet(
      makeContext(request("/api/images", "GET"), makeEnv(bucket, { SITES_HOST: "img.example.com" }))
    );
    const body = (await response.json()) as { images: Array<Record<string, string>> };
    expect(body.images[0].url).toBe("https://img.example.com/i/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(body.images[0].markdown).toBe("![](https://img.example.com/i/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)");
  });

  test("POST raw body：按 X-File-Name/Content-Type 入库并返回记录", async () => {
    const bucket = new InMemoryBucket();
    const response = await imagesOnPost(
      makeContext(
        request("/api/images", "POST", {
          body: PNG_BYTES,
          headers: { "Content-Type": "image/png", "X-File-Name": "shot.png" },
        }),
        makeEnv(bucket, { SITES_HOST: "img.example.com" })
      )
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; name: string; contentType: string; url: string };
    expect(body.id).toMatch(/^[0-9a-f]{32}$/);
    expect(body.name).toBe("shot.png");
    expect(body.contentType).toBe("image/png");
    expect(body.url).toBe(`https://img.example.com/i/${body.id}`);

    const head = await bucket.asBucket().head(imageObjectKey(body.id));
    expect(head?.httpMetadata?.contentType).toBe("image/png");
    expect(head?.customMetadata).toEqual({ name: "shot.png", contentType: "image/png" });
  });

  test("POST：Content-Type 不可用时按扩展名猜测；X-File-Name 带路径时取末段", async () => {
    const bucket = new InMemoryBucket();
    const response = await imagesOnPost(
      makeContext(
        request("/api/images", "POST", {
          body: PNG_BYTES,
          headers: { "Content-Type": "application/octet-stream", "X-File-Name": "dir/pic.PNG" },
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(201);
    expect(((await response.json()) as { contentType: string }).contentType).toBe("image/png");
  });

  test("POST 校验：空文件 400 / 非 4xx 之外的类型 400 / 超 20MB 413", async () => {
    const bucket = new InMemoryBucket();
    const env = makeEnv(bucket);
    const empty = await imagesOnPost(
      makeContext(request("/api/images", "POST", { body: new Uint8Array(0) }), env)
    );
    expect(empty.status).toBe(400);
    expect(await empty.text()).toBe("空文件");

    const notImage = await imagesOnPost(
      makeContext(
        request("/api/images", "POST", {
          body: new TextEncoder().encode("hello"),
          headers: { "Content-Type": "text/plain", "X-File-Name": "a.txt" },
        }),
        env
      )
    );
    expect(notImage.status).toBe(400);
    expect(await notImage.text()).toBe("仅支持图片文件");

    const tooBig = await imagesOnPost(
      makeContext(
        request("/api/images", "POST", {
          body: new Uint8Array(20 * 1024 * 1024 + 1),
          headers: { "Content-Type": "image/png" },
        }),
        env
      )
    );
    expect(tooBig.status).toBe(413);
    expect(await tooBig.text()).toBe("图片超过 20MB 上限");
  });

  test("DELETE：非法 id 400 / 不存在 404 / 成功移除", async () => {
    const bucket = new InMemoryBucket();
    const env = makeEnv(bucket);
    const badId = await imagesOnDelete(
      makeContext(request("/api/images?id=nope", "DELETE"), env)
    );
    expect(badId.status).toBe(400);

    const missing = await imagesOnDelete(
      makeContext(request(`/api/images?id=${"c".repeat(32)}`, "DELETE"), env)
    );
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("Not Found");

    bucket.seed([{ key: imageObjectKey("d".repeat(32)), body: PNG_BYTES }]);
    const ok = await imagesOnDelete(
      makeContext(request(`/api/images?id=${"d".repeat(32)}`, "DELETE"), env)
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ id: "d".repeat(32), deleted: true });
    expect(bucket.has(imageObjectKey("d".repeat(32)))).toBe(false);
  });
});

describe("sites GET", () => {
  test("未授权 401；列出 slug 与配置摘要", async () => {
    const bucket = new InMemoryBucket();
    const noAuth = await sitesOnGet(
      makeContext(new Request(`${HOST}/api/sites`), makeEnv(bucket))
    );
    expect(noAuth.status).toBe(401);

    bucket.seed([
      { key: "sites/blog/index.html", body: "<h1>hi", contentType: "text/html; charset=utf-8" },
      { key: "sites/docs/a.txt", body: "A" },
      {
        key: siteConfigKey("blog"),
        body: JSON.stringify({ slug: "blog", spa: true, hostname: "blog.example.com" }),
        contentType: "application/json",
      },
      // 无配置的站点回退 {slug}
      { key: "sites/plain/readme.md", body: "R" },
    ]);
    const response = await sitesOnGet(
      makeContext(request("/api/sites", "GET"), makeEnv(bucket, { SITES_HOST: "sites.example.com" }))
    );
    const body = (await response.json()) as {
      sitesHost: string | null;
      sites: Array<Record<string, unknown>>;
    };
    expect(body.sitesHost).toBe("sites.example.com");
    const bySlug = Object.fromEntries(body.sites.map((site) => [site.slug, site]));
    expect(bySlug.blog).toMatchObject({ spa: true, passwordProtected: false, hostname: "blog.example.com", stats: null });
    expect(bySlug.docs).toMatchObject({ spa: false, passwordProtected: false, hostname: null });
    expect(bySlug.plain).toMatchObject({ slug: "plain", spa: false });
  });

  test("stats=1 计算文件数与总大小并写回配置缓存", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/blog/index.html", body: "12345", contentType: "text/html; charset=utf-8" },
      { key: "sites/blog/app.js", body: "123", contentType: "text/javascript; charset=utf-8" },
    ]);
    const response = await sitesOnGet(
      makeContext(request("/api/sites?stats=1&slug=blog", "GET"), makeEnv(bucket))
    );
    const body = (await response.json()) as { sites: Array<Record<string, any>> };
    expect(body.sites[0].stats).toMatchObject({ objects: 2, size: 8 });
    expect(typeof body.sites[0].stats.cachedAt).toBe("string");

    const stored = bucket.rawJson<{ stats: { objects: number } }>(siteConfigKey("blog"));
    expect(stored?.stats.objects).toBe(2);
  });
});

describe("sites POST", () => {
  test("未授权 401 / 坏 JSON 400 / 非法 slug 400", async () => {
    const bucket = new InMemoryBucket();
    const noAuth = await sitesOnPost(
      makeContext(new Request(`${HOST}/api/sites`, { method: "POST" }), makeEnv(bucket))
    );
    expect(noAuth.status).toBe(401);

    const badJson = await sitesOnPost(
      makeContext(request("/api/sites", "POST", { body: "{nope" }), makeEnv(bucket))
    );
    expect(badJson.status).toBe(400);

    const badSlug = await sitesOnPost(
      makeContext(request("/api/sites", "POST", { body: JSON.stringify({ slug: "Bad Slug!" }) }), makeEnv(bucket))
    );
    expect(badSlug.status).toBe(400);
    expect(await badSlug.text()).toBe("Bad slug");
  });

  test("发布：拷贝 source 目录内容到 sites/{slug}/（跳过目录 marker）", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("www");
    bucket.seed([
      { key: "www/index.html", body: "<h1>hi", contentType: "text/html; charset=utf-8" },
      { key: "www/assets/app.js", body: "console.log(1)", contentType: "text/javascript; charset=utf-8" },
      // 文件名包含 .. 的相对路径被防御性跳过
      { key: "www/a..b.txt", body: "skip" },
    ]);
    const response = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", source: "www" }) }),
        makeEnv(bucket, { SITES_HOST: "sites.example.com" })
      )
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { copied: number; source: string; sitesHost: string | null };
    expect(body.copied).toBe(2);
    expect(body.source).toBe("www");
    expect(body.sitesHost).toBe("sites.example.com");
    expect(bucket.rawText("sites/blog/index.html")).toBe("<h1>hi");
    expect(bucket.rawText("sites/blog/assets/app.js")).toBe("console.log(1)");
    expect(bucket.has("sites/blog/a..b.txt")).toBe(false);
  });

  test("发布校验：sites 开关关 404 / source 缺失 404 / source 是目标自身 400", async () => {
    const bucket = new InMemoryBucket();
    const off = new InMemoryBucket();
    seedFlagOff(off, "sites");
    const disabled = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", source: "www" }) }),
        makeEnv(off)
      )
    );
    expect(disabled.status).toBe(404);
    expect(disabled.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const missing = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", source: "ghost" }) }),
        makeEnv(bucket)
      )
    );
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("source folder not found");

    bucket.seed([{ key: "sites/blog/index.html", body: "x" }]);
    const selfTarget = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", source: "sites/blog" }) }),
        makeEnv(bucket)
      )
    );
    expect(selfTarget.status).toBe(400);
    expect(await selfTarget.text()).toBe("source cannot be the target site folder");
  });

  test("配置更新：站点不存在 404；spa 开关写入", async () => {
    const bucket = new InMemoryBucket();
    const notFound = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "ghost", spa: true }) }),
        makeEnv(bucket)
      )
    );
    expect(notFound.status).toBe(404);
    expect(await notFound.text()).toBe("Site not found");

    bucket.seed([{ key: "sites/blog/index.html", body: "x" }]);
    const response = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", spa: true }) }),
        makeEnv(bucket)
      )
    );
    expect(await response.json()).toMatchObject({ slug: "blog", spa: true, passwordProtected: false });
    expect(bucket.rawJson<{ spa: boolean }>(siteConfigKey("blog"))?.spa).toBe(true);
  });

  test("密码：写入 hash（不回显明文）、清除、超长/类型错误", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "sites/blog/index.html", body: "x" }]);
    const env = makeEnv(bucket);

    const set = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", password: "secret" }) }),
        env
      )
    );
    const setBody = (await set.json()) as Record<string, unknown>;
    expect(setBody.passwordProtected).toBe(true);
    expect(JSON.stringify(setBody)).not.toContain("secret");
    const stored = bucket.rawJson<{ passwordHash?: string }>(siteConfigKey("blog"));
    expect(stored?.passwordHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.passwordHash).not.toBe("secret");

    const clear = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", password: null }) }),
        env
      )
    );
    expect(((await clear.json()) as Record<string, unknown>).passwordProtected).toBe(false);
    expect(bucket.rawJson<{ passwordHash?: string }>(siteConfigKey("blog"))?.passwordHash).toBeUndefined();

    const tooLong = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", password: "x".repeat(129) }) }),
        env
      )
    );
    expect(tooLong.status).toBe(400);
    expect(await tooLong.text()).toBe("Password too long");

    const badType = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", password: 42 }) }),
        env
      )
    );
    expect(badType.status).toBe(400);
    expect(await badType.text()).toBe("Bad password");
  });

  test("主机名：写入反查索引、清理旧索引、校验与冲突", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "sites/blog/index.html", body: "x" }]);
    const env = makeEnv(bucket, { SITES_HOST: "sites.example.com" });

    const set = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", hostname: "Blog.Example.com" }) }),
        env
      )
    );
    expect(((await set.json()) as Record<string, unknown>).hostname).toBe("blog.example.com");
    expect(bucket.rawText(siteHostnameKey("blog.example.com"))).toBe("blog");

    // 换主机名 → 旧索引删除
    const change = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", hostname: "new.example.com" }) }),
        env
      )
    );
    expect(((await change.json()) as Record<string, unknown>).hostname).toBe("new.example.com");
    expect(bucket.has(siteHostnameKey("blog.example.com"))).toBe(false);
    expect(bucket.rawText(siteHostnameKey("new.example.com"))).toBe("blog");

    // 清除（null）→ 索引删除
    await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", hostname: null }) }),
        env
      )
    );
    expect(bucket.has(siteHostnameKey("new.example.com"))).toBe(false);

    // 非法主机名
    for (const hostname of ["192.168.1.1", "not a host", "localhost"]) {
      const bad = await sitesOnPost(
        makeContext(
          request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", hostname }) }),
          env
        )
      );
      expect(bad.status).toBe(400);
      expect(await bad.text()).toBe("Bad hostname");
    }

    // 与 SITES_HOST 相同
    const sameAsHost = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", hostname: "sites.example.com" }) }),
        env
      )
    );
    expect(sameAsHost.status).toBe(400);
    expect(await sameAsHost.text()).toBe("Hostname cannot equal SITES_HOST");

    // 已被其他站点占用 → 409
    bucket.seed([
      { key: "sites/other/index.html", body: "x" },
      { key: siteHostnameKey("taken.example.com"), body: "other", contentType: "text/plain; charset=utf-8" },
    ]);
    const conflict = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", hostname: "taken.example.com" }) }),
        env
      )
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.text()).toBe("Hostname already in use");

    // 非字符串类型
    const badType = await sitesOnPost(
      makeContext(
        request("/api/sites", "POST", { body: JSON.stringify({ slug: "blog", hostname: 7 }) }),
        env
      )
    );
    expect(badType.status).toBe(400);
  });
});

describe("sites DELETE", () => {
  test("非法 slug 400；删除对象保留配置；purge 连配置和主机名索引一起删", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/blog/index.html", body: "x" },
      { key: "sites/blog/a.js", body: "y" },
      {
        key: siteConfigKey("blog"),
        body: JSON.stringify({ slug: "blog", hostname: "blog.example.com" }),
        contentType: "application/json",
      },
      { key: siteHostnameKey("blog.example.com"), body: "blog", contentType: "text/plain; charset=utf-8" },
    ]);
    const env = makeEnv(bucket);

    // slug 会先 toLowerCase，因此用小写后仍不合法的值
    const badSlug = await sitesOnDelete(
      makeContext(request("/api/sites?slug=nope!", "DELETE"), env)
    );
    expect(badSlug.status).toBe(400);

    const soft = await sitesOnDelete(
      makeContext(request("/api/sites?slug=blog", "DELETE"), env)
    );
    expect(await soft.json()).toEqual({ slug: "blog", deleted: 2 });
    expect(bucket.has("sites/blog/index.html")).toBe(false);
    expect(bucket.has(siteConfigKey("blog"))).toBe(true);
    expect(bucket.has(siteHostnameKey("blog.example.com"))).toBe(true);

    const purge = await sitesOnDelete(
      makeContext(request("/api/sites?slug=blog&purge=1", "DELETE"), env)
    );
    expect(await purge.json()).toEqual({ slug: "blog", deleted: 0 });
    expect(bucket.has(siteConfigKey("blog"))).toBe(false);
    expect(bucket.has(siteHostnameKey("blog.example.com"))).toBe(false);
  });

  test("未授权 401", async () => {
    const bucket = new InMemoryBucket();
    const noAuth = await sitesOnDelete(
      makeContext(new Request(`${HOST}/api/sites?slug=blog`, { method: "DELETE" }), makeEnv(bucket))
    );
    expect(noAuth.status).toBe(401);
  });
});
