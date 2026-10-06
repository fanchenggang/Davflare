/**
 * #146 跟进：相册、文档站与公开目录一样，在复制任何文件之前写预清单，
 * 发布途中（finish 之前 / 中途放弃）站点已按生成型站点服务。
 */
import { onRequest } from "../../../functions/_middleware";
import { onRequestPost } from "../../../functions/api/sites";
import {
  ALBUM_MANIFEST_NAME,
  SITE_MANIFEST_NAME,
  loadSiteManifestKind,
  serializeSiteManifest,
  writeEarlySiteManifest,
} from "../../../functions/siteManifest";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

function env(bucket: R2Bucket) {
  return { BUCKET: bucket, WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass", SITES_HOST: "sites.example.com" };
}

async function post(bucket: R2Bucket, body: unknown) {
  const response = await onRequestPost(
    makeContext(
      new Request("http://drive.example.com/api/sites", {
        method: "POST",
        headers: { Authorization: basicAuthHeader("user", "pass"), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env(bucket)
    )
  );
  return { status: response.status, json: (await response.json().catch(() => null)) as Record<string, unknown> | null };
}

function serve(bucket: R2Bucket, path: string) {
  return onRequest(
    makeContext(new Request(`http://sites.example.com${path}`, { headers: { Host: "sites.example.com" } }), env(bucket), {})
  );
}

function manifest(bucket: InMemoryBucket, slug: string, name = SITE_MANIFEST_NAME) {
  return JSON.parse(bucket.rawText(`sites/${slug}/${name}`) ?? "null") as { kind: string; files: string[] } | null;
}

describe("writeEarlySiteManifest", () => {
  test("writes kind + deduped safe files + its own name", async () => {
    const bucket = new InMemoryBucket();
    await writeEarlySiteManifest(bucket.asBucket(), "sites/a/", "docs", ["x.html", "x.html", "../bad", "assets/a.png"]);
    expect(manifest(bucket, "a")).toEqual({ version: 1, kind: "docs", files: ["x.html", "assets/a.png", SITE_MANIFEST_NAME] });
    await writeEarlySiteManifest(bucket.asBucket(), "sites/b/", "album", ["a.png"]);
    expect(manifest(bucket, "b", ALBUM_MANIFEST_NAME)?.kind).toBe("album");
  });

  test("keeps a stricter kind already in the same manifest file; corrupt counts as dir", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: `sites/d/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("dir", ["evil.html"]) },
      { key: `sites/e/${SITE_MANIFEST_NAME}`, body: "{{" },
      { key: `sites/f/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("docs", []) },
    ]);
    await writeEarlySiteManifest(bucket.asBucket(), "sites/d/", "docs", ["evil.html"]);
    expect(manifest(bucket, "d")?.kind).toBe("dir");
    await writeEarlySiteManifest(bucket.asBucket(), "sites/e/", "docs", []);
    expect(manifest(bucket, "e")?.kind).toBe("dir");
    await writeEarlySiteManifest(bucket.asBucket(), "sites/f/", "dir", []);
    expect(manifest(bucket, "f")?.kind).toBe("dir");
  });
});

describe("docs publish", () => {
  function seed(bucket: InMemoryBucket) {
    bucket.seed([{ key: "notes/a.png", body: "PNG", contentType: "image/png" }]);
  }

  test("plan writes a docs manifest before any page or image lands", async () => {
    const bucket = new InMemoryBucket();
    seed(bucket);
    const plan = await post(bucket.asBucket(), { slug: "manual", docs: { phase: "plan", pages: ["intro.html"], images: ["notes/a.png"] } });
    expect(plan.status).toBe(200);
    const early = manifest(bucket, "manual");
    expect(early?.kind).toBe("docs");
    expect(early?.files).toEqual(expect.arrayContaining(["intro.html", "index.html", "assets/a.png"]));
    expect(await loadSiteManifestKind(bucket.asBucket(), "sites/manual/")).toBe("docs");
  });

  test("docs over a public directory stays strict until finish, then becomes docs", async () => {
    const bucket = new InMemoryBucket();
    seed(bucket);
    bucket.seed([
      { key: "sites/mix/index.html", body: "<h1>dir</h1>" },
      { key: "sites/mix/evil.html", body: "<script>alert(1)</script>" },
      { key: `sites/mix/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("dir", ["index.html", "evil.html", SITE_MANIFEST_NAME]) },
    ]);
    const plan = await post(bucket.asBucket(), { slug: "mix", docs: { phase: "plan", pages: ["intro.html"], images: [] } });
    const planId = plan.json?.planId as string;
    expect(manifest(bucket, "mix")?.kind).toBe("dir");
    const during = await serve(bucket.asBucket(), "/mix/evil.html");
    expect(during.headers.get("Content-Disposition")).toMatch(/^attachment;/);

    const put = await post(bucket.asBucket(), {
      slug: "mix",
      docs: { phase: "put", planId, pages: [{ name: "intro.html", html: "<h1>i</h1>" }, { name: "index.html", html: "<h1>home</h1>" }] },
    });
    expect(put.status).toBe(200);
    expect((await post(bucket.asBucket(), { slug: "mix", docs: { phase: "finish", planId } })).status).toBe(200);
    expect(manifest(bucket, "mix")?.kind).toBe("docs");
    expect(bucket.has("sites/mix/evil.html")).toBe(false);
    const page = await serve(bucket.asBucket(), "/mix/intro.html");
    expect(page.headers.get("Content-Disposition")).toBeNull();
  });
});

describe("album publish", () => {
  test("the album manifest is written before the first image copy and before stale deletes", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "pics/a.png", body: "PNG", contentType: "image/png" }]);
    const raw = bucket.asBucket();
    const order: string[] = [];
    const tracked = new Proxy(raw, {
      get(target, prop) {
        if (prop === "put") {
          return (key: string, ...rest: unknown[]) => {
            order.push(`put:${key}`);
            return (target.put as (...args: unknown[]) => unknown)(key, ...rest);
          };
        }
        if (prop === "delete") {
          return (keys: string | string[]) => {
            order.push(`delete:${String(keys)}`);
            return target.delete(keys);
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as R2Bucket;
    expect((await post(tracked, { slug: "pics", album: { files: ["pics/a.png"] } })).status).toBe(200);
    const manifestIdx = order.indexOf(`put:sites/pics/${ALBUM_MANIFEST_NAME}`);
    const imageIdx = order.indexOf("put:sites/pics/a.png");
    expect(manifestIdx).toBeGreaterThanOrEqual(0);
    expect(imageIdx).toBeGreaterThan(manifestIdx);
    expect(order.findIndex((entry) => entry.startsWith("delete:"))).toBe(-1);
    expect(manifest(bucket, "pics", ALBUM_MANIFEST_NAME)).toMatchObject({ kind: "album" });
    expect(manifest(bucket, "pics", ALBUM_MANIFEST_NAME)?.files).toEqual(
      expect.arrayContaining(["a.png", "index.html", ALBUM_MANIFEST_NAME])
    );
  });
});
