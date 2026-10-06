/**
 * #177：清单清理 / 生成首页覆盖时，用户自己的 index.html 进回收站而不是被硬删或覆盖。
 * 本服务写的首页带 davflareGenerated 标记，照旧直接覆盖 / 删除。
 */
import { vi } from "vitest";
import { onRequestPost } from "../../../functions/api/sites";
import { SITE_MANIFEST_NAME, parseSiteManifest } from "../../../functions/siteManifest";
import { SITE_GENERATED_META_KEY, deleteSiteKeys, trashUserSiteIndex } from "../../../functions/siteIndex";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const AUTH = basicAuthHeader("user", "pass");
const TRASH = "_$flaredrive$/trash/";

async function post(bucket: InMemoryBucket, body: unknown) {
  const env = { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass", SITES_HOST: "sites.example.com" };
  const request = new Request("http://drive.example.com/api/sites", {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await onRequestPost(makeContext(request, env));
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

function seed(bucket: InMemoryBucket) {
  bucket.seedDir("web");
  bucket.seed([
    { key: "web/about.html", body: "<h1>about</h1>", contentType: "text/html" },
    { key: "notes/intro.md", body: "# intro" },
    { key: "share/inbox/a.txt", body: "a" },
  ]);
}

/** 回收站里的条目：[originalKey, 文件内容] */
async function trashed(bucket: InMemoryBucket): Promise<Array<[string, string | null]>> {
  const listing = await bucket.asBucket().list({ prefix: TRASH });
  const out: Array<[string, string | null]> = [];
  for (const object of listing.objects) {
    const rest = object.key.slice(TRASH.length);
    if (!rest.endsWith(".json") || rest.includes("/")) continue;
    const meta = JSON.parse(bucket.rawText(object.key)!);
    const id = rest.replace(/\.json$/, "");
    out.push([meta.originalKey, bucket.rawText(`${TRASH}${id}/index.html`) ?? null]);
  }
  return out;
}

function manifestFiles(bucket: InMemoryBucket, slug: string): string[] {
  return parseSiteManifest(bucket.rawText(`sites/${slug}/${SITE_MANIFEST_NAME}`) ?? "").files;
}

async function headMeta(bucket: InMemoryBucket, key: string) {
  return (await bucket.asBucket().head(key))?.customMetadata ?? {};
}

const docsPlan = (slug: string) =>
  ({ slug, docs: { phase: "plan", pages: ["intro.html"], sources: ["notes/intro.md"], images: [] } }) as const;

describe("#177 user index.html goes to the trash", () => {
  test("B: index.html uploaded while a docs plan is open → folder re-publish trashes it instead of deleting", async () => {
    const bucket = new InMemoryBucket();
    seed(bucket);
    expect((await post(bucket, docsPlan("e"))).status).toBe(200);
    expect(manifestFiles(bucket, "e")).toContain("index.html"); // 当时没有首页，计划认领了它
    bucket.seed([{ key: "sites/e/index.html", body: "<h1>manual</h1>", contentType: "text/html" }]);

    expect((await post(bucket, { slug: "e", source: "web" })).status).toBe(200);
    expect(bucket.rawText("sites/e/index.html") ?? null).toBeNull();
    expect(await trashed(bucket)).toEqual([["sites/e/index.html", "<h1>manual</h1>"]]);
  });

  test("A: docs put over a manual index.html → manual one trashed, generated one owned and cleaned up later", async () => {
    const bucket = new InMemoryBucket();
    seed(bucket);
    expect((await post(bucket, { slug: "e", source: "web" })).status).toBe(200);
    bucket.seed([{ key: "sites/e/index.html", body: "<h1>manual</h1>", contentType: "text/html" }]);
    const plan = await post(bucket, docsPlan("e"));
    expect(plan.status).toBe(200);
    expect(manifestFiles(bucket, "e")).not.toContain("index.html"); // #172
    const { planId, pages } = plan.json as { planId: string; pages: string[] };
    const put = await post(bucket, {
      slug: "e",
      docs: { planId, phase: "put", pages: [{ name: pages[0], html: "<p>i</p>" }, { name: "index.html", html: "<h1>gen</h1>" }] },
    });
    expect(put.status).toBe(200);
    expect(bucket.rawText("sites/e/index.html")).toBe("<h1>gen</h1>");
    expect((await headMeta(bucket, "sites/e/index.html"))[SITE_GENERATED_META_KEY]).toBe("1");
    expect(manifestFiles(bucket, "e")).toContain("index.html"); // 写入后补记
    expect(await trashed(bucket)).toEqual([["sites/e/index.html", "<h1>manual</h1>"]]);

    // 放弃（不 finish）→ 普通文件夹重新发布：生成的首页被清掉，不再残留；回收站里仍只有手动那份
    expect((await post(bucket, { slug: "e", source: "web" })).status).toBe(200);
    expect(bucket.rawText("sites/e/index.html") ?? null).toBeNull();
    expect(bucket.rawText("sites/e/about.html")).toBe("<h1>about</h1>");
    expect(await trashed(bucket)).toHaveLength(1);
  });

  test("re-publishing generated sites over their own index.html never touches the trash", async () => {
    const bucket = new InMemoryBucket();
    seed(bucket);
    for (let round = 0; round < 2; round++) {
      const plan = await post(bucket, { slug: "d", dir: { phase: "plan", source: "share/inbox", lang: "en" } });
      expect(plan.status).toBe(200);
      const { planId, files } = plan.json as { planId: string; files: string[] };
      expect((await post(bucket, { slug: "d", dir: { planId, phase: "copy", files } })).status).toBe(200);
      expect((await post(bucket, { slug: "d", dir: { planId, phase: "finish" } })).status).toBe(200);
      expect((await headMeta(bucket, "sites/d/index.html"))[SITE_GENERATED_META_KEY]).toBe("1");
    }
    // 公开目录 → 普通站：生成的首页直接删
    expect((await post(bucket, { slug: "d", source: "web" })).status).toBe(200);
    expect(bucket.rawText("sites/d/index.html") ?? null).toBeNull();
    expect(await trashed(bucket)).toEqual([]);
  });

  test("dir finish over a manual index.html trashes the manual one first", async () => {
    const bucket = new InMemoryBucket();
    seed(bucket);
    bucket.seed([{ key: "sites/d/index.html", body: "<h1>mine</h1>", contentType: "text/html" }]);
    const plan = await post(bucket, { slug: "d", dir: { phase: "plan", source: "share/inbox", lang: "en" } });
    const { planId, files } = plan.json as { planId: string; files: string[] };
    await post(bucket, { slug: "d", dir: { planId, phase: "copy", files } });
    expect((await post(bucket, { slug: "d", dir: { planId, phase: "finish" } })).status).toBe(200);
    expect(bucket.rawText("sites/d/index.html")).not.toBe("<h1>mine</h1>");
    expect(await trashed(bucket)).toEqual([["sites/d/index.html", "<h1>mine</h1>"]]);
  });

  test("nav and album publishes protect a manual index.html too", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/n/index.html", body: "<h1>nav-mine</h1>", contentType: "text/html" },
      { key: "sites/a/index.html", body: "<h1>album-mine</h1>", contentType: "text/html" },
      { key: "pics/p.png", body: "PNG", contentType: "image/png" },
    ]);
    const nav = await post(bucket, {
      slug: "n",
      nav: { title: "N", groups: [{ name: "g", links: [{ title: "x", href: "https://example.com" }] }] },
    });
    expect(nav.status).toBe(200);
    const album = await post(bucket, { slug: "a", album: { files: ["pics/p.png"] } });
    expect(album.status).toBe(200);
    expect((await trashed(bucket)).map(([, body]) => body).sort()).toEqual(["<h1>album-mine</h1>", "<h1>nav-mine</h1>"]);
    expect((await headMeta(bucket, "sites/a/index.html"))[SITE_GENERATED_META_KEY]).toBe("1");
    // 再发一次相册：自己的首页不进回收站
    expect((await post(bucket, { slug: "a", album: { files: ["pics/p.png"] } })).status).toBe(200);
    expect(await trashed(bucket)).toHaveLength(2);
  });
});

describe("siteIndex helpers", () => {
  test("deleteSiteKeys without index.html does not look at the index", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "sites/x/a.html", body: "a" }, { key: "sites/x/index.html", body: "keep" }]);
    const raw = bucket.asBucket();
    const head = vi.spyOn(raw, "head");
    await deleteSiteKeys(raw, "sites/x/", ["sites/x/a.html"]);
    expect(head).not.toHaveBeenCalled();
    expect(bucket.rawText("sites/x/a.html") ?? null).toBeNull();
    expect(bucket.rawText("sites/x/index.html")).toBe("keep");
  });

  test("trashUserSiteIndex: none / generated / trashed", async () => {
    const bucket = new InMemoryBucket();
    expect(await trashUserSiteIndex(bucket.asBucket(), "sites/y/")).toBe("none");
    await bucket.asBucket().put("sites/y/index.html", "gen", { customMetadata: { [SITE_GENERATED_META_KEY]: "1" } });
    expect(await trashUserSiteIndex(bucket.asBucket(), "sites/y/")).toBe("generated");
    bucket.seed([{ key: "sites/y/index.html", body: "user" }]);
    expect(await trashUserSiteIndex(bucket.asBucket(), "sites/y/")).toBe("trashed");
    expect(bucket.rawText("sites/y/index.html") ?? null).toBeNull();
  });
});
