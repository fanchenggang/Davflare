/**
 * 文档站：functions/sitePublish.ts 的 kind:"docs"（plan → copy 图片 → put 页面 → finish）。
 */
import { onRequestPost } from "../../../functions/api/sites";
import { CONFIG_KEY, DEFAULT_FEATURE_FLAGS } from "../../../functions/_flags";
import { DOCS_MAX_BYTES, DOCS_MAX_FILES, docsScopeOf } from "../../../functions/sitePages";
import { SITE_MANIFEST_NAME } from "../../../functions/siteManifest";
import { DOCS_PAGE_MAX_BYTES, isPlainFileKey, sitePublishPlanKey } from "../../../functions/sitePublish";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const AUTH = basicAuthHeader("user", "pass");
type AnyBucket = InMemoryBucket | { raw: R2Bucket };

function makeEnv(bucket: AnyBucket) {
  return {
    BUCKET: "raw" in bucket ? bucket.raw : bucket.asBucket(),
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
    SITES_HOST: "sites.example.com",
  };
}

async function call(bucket: AnyBucket, slug: string, payload: Record<string, unknown>) {
  const request = new Request("http://drive.example.com/api/sites", {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({ slug, ...payload }),
  });
  const response = await onRequestPost(makeContext(request, makeEnv(bucket)));
  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

/**
 * plan 需要笔记源 key（#153：服务端由它推出发布范围）。测试没显式给时，按图片的公共目录造一组源：
 * 让既有用例的图片都落在范围内；范围相关的用例会显式传 sources。
 */
function withSources(body: Record<string, unknown>): Record<string, unknown> {
  if (body.phase !== "plan" || !Array.isArray(body.pages) || "sources" in body) return body;
  const images = Array.isArray(body.images)
    ? body.images.filter((key): key is string => typeof key === "string" && isPlainFileKey(key))
    : [];
  const scope = docsScopeOf(images);
  return { ...body, sources: body.pages.map((_, i) => (scope ? `${scope}/note-${i}.md` : `note-${i}.md`)) };
}

const docs = (bucket: AnyBucket, slug: string, body: Record<string, unknown>) =>
  call(bucket, slug, { docs: withSources(body) });

type Plan = { planId: string; pages: string[]; images: string[]; total: number };

async function publish(
  bucket: AnyBucket,
  slug: string,
  pages: Record<string, string>,
  images: string[] = []
) {
  const plan = await docs(bucket, slug, { phase: "plan", pages: Object.keys(pages), images, lang: "en", title: "T" });
  expect(plan.status).toBe(200);
  const p = plan.json as unknown as Plan;
  if (p.images.length) {
    const copy = await docs(bucket, slug, { phase: "copy", planId: p.planId, files: p.images });
    expect(copy.status).toBe(200);
  }
  const html = Object.values(pages);
  const put = await docs(bucket, slug, {
    phase: "put",
    planId: p.planId,
    pages: [...p.pages.map((name, i) => ({ name, html: html[i] })), { name: "index.html", html: "<h1>index</h1>" }],
  });
  expect(put.status).toBe(200);
  const finish = await docs(bucket, slug, { phase: "finish", planId: p.planId });
  return { plan: p, finish };
}

function inflate(bucket: InMemoryBucket, sizes: Record<string, number>): { raw: R2Bucket } {
  const real = bucket.asBucket();
  const patch = <T extends { key: string } | null>(obj: T): T =>
    obj && sizes[obj.key] !== undefined
      ? (new Proxy(obj as object, {
          get(target, prop) {
            if (prop === "size") return sizes[(target as { key: string }).key];
            const value = Reflect.get(target, prop, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as T)
      : obj;
  const raw = new Proxy(real, {
    get(target, prop) {
      if (prop === "head") return async (key: string) => patch(await target.head(key));
      if (prop === "get") return async (key: string, o?: R2GetOptions) => patch(await target.get(key, o));
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { raw };
}

describe("docs publish: happy path", () => {
  test("copies images to assets/, writes pages + index + manifest", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "vault/img/a.png", body: "PNG", contentType: "text/html" },
      { key: "vault/b.jpg", body: "JPG" },
    ]);
    const { plan, finish } = await publish(
      bucket,
      "notes",
      { "Intro.html": "<p>intro</p>", "index.html": "<p>user index</p>" },
      ["vault/img/a.png", "vault/b.jpg"]
    );
    expect(plan.pages).toEqual(["Intro.html", "index-2.html"]);
    expect(plan.images).toEqual(["assets/a.png", "assets/b.jpg"]);
    expect(plan.total).toBe(5);
    expect(finish.status).toBe(200);
    expect(finish.json).toMatchObject({ slug: "notes", kind: "docs", copied: 4, sitesHost: "sites.example.com" });
    expect(bucket.rawText("sites/notes/assets/a.png")).toBe("PNG");
    // 图片类型按扩展名强制，不沿用源文件可能错误的 text/html
    expect((await bucket.asBucket().head("sites/notes/assets/a.png"))?.httpMetadata?.contentType).toBe("image/png");
    expect(bucket.rawText("sites/notes/Intro.html")).toBe("<p>intro</p>");
    expect(bucket.rawText("sites/notes/index.html")).toBe("<h1>index</h1>");
    const manifest = bucket.rawJson<{ kind: string; files: string[] }>(`sites/notes/${SITE_MANIFEST_NAME}`);
    expect(manifest?.kind).toBe("docs");
    expect(manifest?.files.sort()).toEqual(
      ["Intro.html", "index-2.html", "index.html", "assets/a.png", "assets/b.jpg", SITE_MANIFEST_NAME].sort()
    );
    expect(bucket.has(sitePublishPlanKey("notes"))).toBe(false);
  });

  test("finish requires every page (including index) and image", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.png", body: "x" }]);
    const p = (await docs(bucket, "s", { phase: "plan", pages: ["a.html"], images: ["a.png"] })).json as unknown as Plan;
    let finish = await docs(bucket, "s", { phase: "finish", planId: p.planId });
    expect(finish.text).toBe("files not copied yet: 1");
    await docs(bucket, "s", { phase: "copy", planId: p.planId, files: p.images });
    await docs(bucket, "s", { phase: "put", planId: p.planId, pages: [{ name: "a.html", html: "a" }] });
    finish = await docs(bucket, "s", { phase: "finish", planId: p.planId });
    expect(finish.status).toBe(409);
    expect(finish.text).toBe("pages not uploaded yet: 1");
  });

  test("dir and docs plans cannot be mixed", async () => {
    const bucket = new InMemoryBucket();
    const p = (await docs(bucket, "s", { phase: "plan", pages: ["a.html"] })).json as unknown as Plan;
    const wrong = await call(bucket, "s", { dir: { phase: "copy", planId: p.planId, files: ["a.html"] } });
    expect(wrong.status).toBe(409);
    expect(wrong.text).toBe("publish plan kind mismatch");
  });

  test("feature switch off → 404; bad phase / shape → 400", async () => {
    const bucket = new InMemoryBucket();
    expect((await call(bucket, "s", { docs: [1] })).text).toBe("bad docs");
    expect((await docs(bucket, "s", { phase: "zzz" })).text).toBe("bad phase");
    expect((await docs(bucket, "s", { phase: "plan", pages: "a.html" })).text).toBe("bad pages");
    expect((await docs(bucket, "s", { phase: "plan", pages: ["a.html"], images: [1] })).text).toBe("bad images");
    expect((await docs(bucket, "s", { phase: "plan", pages: [] })).text).toBe("no files");
    bucket.seed([
      { key: CONFIG_KEY, body: JSON.stringify({ ...DEFAULT_FEATURE_FLAGS, sites: false }), contentType: "application/json" },
    ]);
    expect((await docs(bucket, "s", { phase: "plan", pages: ["a.html"] })).status).toBe(404);
  });
});

describe("docs publish: limits", () => {
  test(`more than ${DOCS_MAX_FILES} files (pages + images) is rejected`, async () => {
    const bucket = new InMemoryBucket();
    const images = Array.from({ length: 2 }, (_, i) => `p/${i}.png`);
    bucket.seed(images.map((key) => ({ key, body: "x" })));
    const pages = Array.from({ length: DOCS_MAX_FILES - 1 }, (_, i) => `${i}.html`);
    const res = await docs(bucket, "s", { phase: "plan", pages, images });
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/file limit exceeded: 201 > 200/);
    const ok = await docs(bucket, "s", { phase: "plan", pages, images: images.slice(0, 1) });
    expect(ok.status).toBe(200);
  });

  test("images over 100MB are rejected at plan", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.png", body: "x" }, { key: "b.png", body: "y" }]);
    const big = inflate(bucket, { "a.png": DOCS_MAX_BYTES, "b.png": 1 });
    const res = await docs(big, "s", { phase: "plan", pages: ["a.html"], images: ["a.png", "b.png"] });
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/size limit exceeded/);
  });

  test("html bytes count toward 100MB together with images", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.png", body: "x" }]);
    const big = inflate(bucket, { "a.png": DOCS_MAX_BYTES - 10 });
    const p = (await docs(big, "s", { phase: "plan", pages: ["a.html"], images: ["a.png"] })).json as unknown as Plan;
    expect((await docs(big, "s", { phase: "copy", planId: p.planId, files: p.images })).status).toBe(200);
    const put = await docs(big, "s", {
      phase: "put",
      planId: p.planId,
      pages: [{ name: "a.html", html: "x".repeat(20) }],
    });
    expect(put.status).toBe(400);
    expect(put.text).toMatch(/size limit exceeded/);
    expect(bucket.has("sites/s/a.html")).toBe(false);
  });

  test("a single page over the per-page cap is rejected", async () => {
    const bucket = new InMemoryBucket();
    const p = (await docs(bucket, "s", { phase: "plan", pages: ["a.html"] })).json as unknown as Plan;
    const put = await docs(bucket, "s", {
      phase: "put",
      planId: p.planId,
      pages: [{ name: "a.html", html: "x".repeat(DOCS_PAGE_MAX_BYTES + 1) }],
    });
    expect(put.status).toBe(400);
    expect(put.text).toBe("page too large: a.html");
  });
});

describe("docs publish: path safety", () => {
  test("isPlainFileKey", () => {
    expect(isPlainFileKey("a/b.png")).toBe(true);
    for (const bad of ["", "/a.png", "a/../b.png", "a//b.png", "./a.png", "a\\b.png", "a/\nb.png", "_$flaredrive$/x.png", "a/"]) {
      expect(isPlainFileKey(bad)).toBe(false);
    }
  });

  test("image sources must be plain raster files outside the target site", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "doc.pdf", body: "pdf" },
      { key: "sites/s/old.png", body: "x" },
      { key: "_$flaredrive$/secret.png", body: "x" },
    ]);
    for (const image of ["../x.png", "doc.pdf", "sites/s/old.png", "_$flaredrive$/secret.png", "a/./b.png"]) {
      const res = await docs(bucket, "s", { phase: "plan", pages: ["a.html"], images: [image] });
      expect(res.status).toBe(400);
      expect(res.text).toBe("bad image source");
    }
    const missing = await docs(bucket, "s", { phase: "plan", pages: ["a.html"], images: ["ghost.png"] });
    expect(missing.status).toBe(409);
    const dup = await docs(bucket, "s", { phase: "plan", pages: ["a.html"], images: ["doc.png", "doc.png"] });
    expect(dup.text).toBe("duplicate images");
  });

  test("page names: sanitized at plan, only planned names accepted at put", async () => {
    const bucket = new InMemoryBucket();
    expect((await docs(bucket, "s", { phase: "plan", pages: ["a.txt"] })).text).toBe("bad page name");
    const p = (await docs(bucket, "s", { phase: "plan", pages: ["../evil.html", "sub/x.html"] })).json as unknown as Plan;
    expect(p.pages).toEqual([".._evil.html", "sub_x.html"]);
    for (const name of ["../evil.html", "other.html", "assets/a.html", SITE_MANIFEST_NAME]) {
      const put = await docs(bucket, "s", { phase: "put", planId: p.planId, pages: [{ name, html: "x" }] });
      expect(put.status).toBe(400);
      expect(put.text).toBe("page not in publish plan");
    }
    expect((await docs(bucket, "s", { phase: "put", planId: p.planId, pages: [{ name: "x" }] })).text).toBe("bad pages");
  });

  test("a tampered plan pointing to a non-image or internal key is refused at copy", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.png", body: "x" }, { key: "secret.txt", body: "s" }]);
    const p = (await docs(bucket, "s", { phase: "plan", pages: ["a.html"], images: ["a.png"] })).json as unknown as Plan;
    const stored = bucket.rawJson<{ items: Array<{ from: string; to: string }> }>(sitePublishPlanKey("s"))!;
    stored.items[0].from = "secret.txt";
    bucket.seed([{ key: sitePublishPlanKey("s"), body: JSON.stringify(stored) }]);
    const copy = await docs(bucket, "s", { phase: "copy", planId: p.planId, files: p.images });
    expect(copy.status).toBe(400);
    expect(copy.text).toBe("bad image source");
    stored.items[0] = { ...stored.items[0], from: "a.png", to: "../a.png" };
    bucket.seed([{ key: sitePublishPlanKey("s"), body: JSON.stringify(stored) }]);
    const copy2 = await docs(bucket, "s", { phase: "copy", planId: p.planId, files: ["../a.png"] });
    expect(copy2.status).toBe(400);
    expect(bucket.has("sites/a.png")).toBe(false);
  });
});

describe("docs publish: manifest overwrite", () => {
  test("republish removes old pages/assets from the manifest and keeps user files", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "v/a.png", body: "A" },
      { key: "v/b.png", body: "B" },
      { key: "sites/s/mine.html", body: "user page" },
      { key: "sites/s/assets/mine.png", body: "user img" },
    ]);
    await publish(bucket, "s", { "one.html": "1", "two.html": "2" }, ["v/a.png", "v/b.png"]);
    expect(bucket.has("sites/s/two.html")).toBe(true);
    await publish(bucket, "s", { "one.html": "1b" }, ["v/a.png"]);
    expect(bucket.rawText("sites/s/one.html")).toBe("1b");
    expect(bucket.has("sites/s/two.html")).toBe(false);
    expect(bucket.has("sites/s/assets/b.png")).toBe(false);
    expect(bucket.has("sites/s/assets/a.png")).toBe(true);
    expect(bucket.rawText("sites/s/mine.html")).toBe("user page");
    expect(bucket.rawText("sites/s/assets/mine.png")).toBe("user img");
  });

  test("user files with the same name are not overwritten (page and asset renamed)", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "v/mine.png", body: "drive" },
      { key: "sites/s/note.html", body: "hand-written" },
      { key: "sites/s/assets/MINE.png", body: "hand image" },
    ]);
    const { plan } = await publish(bucket, "s", { "note.html": "generated" }, ["v/mine.png"]);
    expect(plan.pages).toEqual(["note-2.html"]);
    expect(plan.images).toEqual(["assets/mine-2.png"]);
    expect(bucket.rawText("sites/s/note.html")).toBe("hand-written");
    expect(bucket.rawText("sites/s/assets/MINE.png")).toBe("hand image");
  });

  test("docs over a public directory removes the directory's files", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("f");
    bucket.seed([{ key: "f/file.zip", body: "zip" }, { key: "sites/s/keep.txt", body: "k" }]);
    const plan = (await call(bucket, "s", { dir: { phase: "plan", source: "f" } })).json as { planId: string; files: string[] };
    await call(bucket, "s", { dir: { phase: "copy", planId: plan.planId, files: plan.files } });
    await call(bucket, "s", { dir: { phase: "finish", planId: plan.planId } });
    expect(bucket.has("sites/s/file.zip")).toBe(true);
    await publish(bucket, "s", { "a.html": "a" });
    expect(bucket.has("sites/s/file.zip")).toBe(false);
    expect(bucket.rawText("sites/s/keep.txt")).toBe("k");
    expect(bucket.rawJson<{ kind: string }>(`sites/s/${SITE_MANIFEST_NAME}`)?.kind).toBe("docs");
  });

  test("interrupted docs publish is repaired without duplicates", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "v/a.png", body: "A" }]);
    const p = (await docs(bucket, "s", { phase: "plan", pages: ["a.html"], images: ["v/a.png"] })).json as unknown as Plan;
    await docs(bucket, "s", { phase: "copy", planId: p.planId, files: p.images });
    await docs(bucket, "s", { phase: "put", planId: p.planId, pages: [{ name: "a.html", html: "half" }] });
    const { plan } = await publish(bucket, "s", { "a.html": "full" }, ["v/a.png"]);
    expect(plan.pages).toEqual(["a.html"]);
    expect(plan.images).toEqual(["assets/a.png"]);
    expect(bucket.rawText("sites/s/a.html")).toBe("full");
  });
});

describe("checkDocsLimits", () => {
  test("boundaries", async () => {
    const { checkDocsLimits } = await import("../../../functions/sitePages");
    expect(checkDocsLimits(0, 0, 0)).toEqual({ ok: false, error: "no files" });
    expect(checkDocsLimits(100, 100, DOCS_MAX_BYTES)).toEqual({ ok: true });
    expect(checkDocsLimits(100, 101, 1)).toMatchObject({ ok: false });
    expect(checkDocsLimits(1, 0, DOCS_MAX_BYTES + 1)).toMatchObject({ ok: false });
    expect(checkDocsLimits(1, 0, -1)).toEqual({ ok: false, error: "bad docs" });
    expect(DOCS_MAX_FILES).toBe(200);
    expect(DOCS_MAX_BYTES).toBe(100 * 1024 * 1024);
  });
});

describe("docs publish: publish scope (#153)", () => {
  function seedScope(bucket: InMemoryBucket) {
    bucket.seed([
      { key: "vault/notes/a.md", body: "# a" },
      { key: "vault/notes/img/ok.png", body: "OK" },
      { key: "vault/secret.png", body: "S" },
      { key: "private/top.png", body: "P" },
      { key: "root.png", body: "R" },
    ]);
  }

  test("plan requires one markdown source per page", async () => {
    const bucket = new InMemoryBucket();
    seedScope(bucket);
    const base = { phase: "plan", pages: ["a.html"], images: [] };
    for (const sources of [undefined, [], ["a.md", "b.md"], ["a.txt"], ["../a.md"], ["/a.md"], ["_$flaredrive$/a.md"], [1]]) {
      const body: Record<string, unknown> = { ...base, sources };
      if (sources === undefined) delete body.sources;
      const res = await call(bucket, "s", { docs: body });
      expect(res.status).toBe(400);
      expect(res.text).toBe("bad sources");
    }
  });

  test("images outside the notes' folder subtree are rejected", async () => {
    const bucket = new InMemoryBucket();
    seedScope(bucket);
    const sources = ["vault/notes/a.md"];
    for (const image of ["vault/secret.png", "private/top.png", "root.png"]) {
      const res = await docs(bucket, "s", { phase: "plan", pages: ["a.html"], sources, images: [image] });
      expect(res.status).toBe(400);
      expect(res.text).toBe(`image outside the published folder: ${image.split("/").pop()}`);
    }
    const ok = await docs(bucket, "s", { phase: "plan", pages: ["a.html"], sources, images: ["vault/notes/img/ok.png"] });
    expect(ok.status).toBe(200);
  });

  test("notes at the drive root only allow root-level images (never the whole drive)", async () => {
    const bucket = new InMemoryBucket();
    seedScope(bucket);
    const sources = ["a.md"];
    const deep = await docs(bucket, "s", { phase: "plan", pages: ["a.html"], sources, images: ["private/top.png"] });
    expect(deep.status).toBe(400);
    expect(deep.text).toBe("image outside the published folder: top.png");
    const root = await docs(bucket, "s", { phase: "plan", pages: ["a.html"], sources, images: ["root.png"] });
    expect(root.status).toBe(200);
  });

  test("notes spread over different top-level folders do not widen the scope", async () => {
    const bucket = new InMemoryBucket();
    seedScope(bucket);
    const res = await docs(bucket, "s", {
      phase: "plan",
      pages: ["a.html", "b.html"],
      sources: ["vault/notes/a.md", "private/b.md"],
      images: ["vault/notes/img/ok.png"],
    });
    expect(res.status).toBe(400);
  });

  test("an over-long page name is shortened (keeps .html) instead of failing the publish", async () => {
    const bucket = new InMemoryBucket();
    const longName = `${"长".repeat(150)}${"x".repeat(150)}.html`;
    const { plan, finish } = await publish(bucket, "s", { [longName]: "<p>long</p>" });
    expect(finish.status).toBe(200);
    expect(plan.pages[0].length).toBeLessThanOrEqual(200);
    expect(plan.pages[0].endsWith(".html")).toBe(true);
    expect(plan.pages[0].startsWith("长长长")).toBe(true);
    expect(bucket.has(`sites/s/${plan.pages[0]}`)).toBe(true);
  });

  test("an over-long image name is shortened inside assets/", async () => {
    const bucket = new InMemoryBucket();
    const key = `v/${"p".repeat(260)}.png`;
    bucket.seed([{ key, body: "PNG" }]);
    const { plan, finish } = await publish(bucket, "s", { "a.html": "<p>a</p>" }, [key]);
    expect(finish.status).toBe(200);
    expect(plan.images[0].startsWith("assets/")).toBe(true);
    expect(plan.images[0].endsWith(".png")).toBe(true);
    expect(plan.images[0].length).toBeLessThanOrEqual("assets/".length + 200);
  });
});
