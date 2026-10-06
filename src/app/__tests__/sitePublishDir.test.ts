/**
 * 公开目录：functions/sitePublish.ts 的 plan → copy×N → finish 分批通道（经 /api/sites 的 dir 分支）。
 */
import { onRequestPost } from "../../../functions/api/sites";
import { CONFIG_KEY, DEFAULT_FEATURE_FLAGS } from "../../../functions/_flags";
import {
  ALBUM_MANIFEST_NAME,
  DIR_MAX_BYTES,
  DIR_MAX_FILES,
} from "../../../functions/sitePages";
import { SITE_MANIFEST_NAME } from "../../../functions/siteManifest";
import {
  allocateSiteFileNames,
  isDirectChildKey,
  sitePublishPlanKey,
} from "../../../functions/sitePublish";
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

function post(body: unknown): Request {
  return new Request("http://drive.example.com/api/sites", {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(bucket: AnyBucket, slug: string, dir: unknown) {
  const response = await onRequestPost(makeContext(post({ slug, dir }), makeEnv(bucket)));
  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

type PlanJson = { planId: string; total: number; files: string[]; subdirs: number; bytes: number };

/** 和客户端一样：plan → 每批 batchSize 个串行 copy → finish。 */
async function publishAll(
  bucket: AnyBucket,
  slug: string,
  source: string,
  batchSize = 50,
  extra: Record<string, unknown> = {}
) {
  const plan = await call(bucket, slug, { phase: "plan", source, lang: "en", ...extra });
  expect(plan.status).toBe(200);
  const body = plan.json as unknown as PlanJson;
  const batches: number[] = [];
  for (let i = 0; i < body.files.length; i += batchSize) {
    const files = body.files.slice(i, i + batchSize);
    const copy = await call(bucket, slug, { phase: "copy", planId: body.planId, files });
    expect(copy.status).toBe(200);
    batches.push(files.length);
  }
  const finish = await call(bucket, slug, { phase: "finish", planId: body.planId });
  return { plan: body, batches, finish };
}

function seedFolder(bucket: InMemoryBucket, folder: string, count: number) {
  bucket.seedDir(folder);
  const entries = [];
  for (let i = 1; i <= count; i += 1) {
    entries.push({ key: `${folder}/file-${i}.txt`, body: `content ${i}`, contentType: "text/plain" });
  }
  bucket.seed(entries);
}

/** 让指定 key 在 list/get/head 里报告一个很大的 size（不用真造 2GB 数据）。 */
function inflateSizes(bucket: InMemoryBucket, sizes: Record<string, number>): { raw: R2Bucket } {
  const real = bucket.asBucket();
  const patch = <T extends { key: string; size: number } | null>(obj: T): T => {
    if (obj && sizes[obj.key] !== undefined) {
      return new Proxy(obj as object, {
        get(target, prop) {
          if (prop === "size") return sizes[(target as { key: string }).key];
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as T;
    }
    return obj;
  };
  const raw = new Proxy(real, {
    get(target, prop) {
      if (prop === "list") {
        return async (options?: R2ListOptions) => {
          const listing = await target.list(options);
          return { ...listing, objects: listing.objects.map((o) => patch(o)) };
        };
      }
      if (prop === "get") {
        return async (key: string, options?: R2GetOptions) => patch(await target.get(key, options));
      }
      if (prop === "head") {
        return async (key: string) => patch(await target.head(key));
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { raw };
}

describe("public directory publish: batching", () => {
  test("120 files publish in 50/50/20 batches, copies bytes and writes index + manifest", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "docs/share", 120);
    bucket.seedDir("docs/share/nested");
    bucket.seed([{ key: "docs/share/nested/deep.txt", body: "deep" }]);

    const { plan, batches, finish } = await publishAll(bucket, "share", "docs/share");
    expect(plan.total).toBe(120);
    expect(plan.subdirs).toBe(1);
    expect(batches).toEqual([50, 50, 20]);
    expect(finish.status).toBe(200);
    expect(finish.json).toMatchObject({
      slug: "share",
      kind: "dir",
      copied: 120,
      sitesHost: "sites.example.com",
    });

    // 复制的是字节，不是引用
    expect(bucket.rawText("sites/share/file-7.txt")).toBe("content 7");
    // 不递归
    expect(bucket.has("sites/share/nested/deep.txt")).toBe(false);
    expect(bucket.has("sites/share/deep.txt")).toBe(false);

    const html = bucket.rawText("sites/share/index.html") ?? "";
    expect(html).toContain('href="file-7.txt"');
    expect(html).toContain('download="file-7.txt"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("docs/share");
    expect(html).toContain("prefers-color-scheme");

    const manifest = bucket.rawJson<{ kind: string; files: string[] }>(
      `sites/share/${SITE_MANIFEST_NAME}`
    );
    expect(manifest?.kind).toBe("dir");
    expect(manifest?.files).toContain("index.html");
    expect(manifest?.files).toContain("file-120.txt");
    expect(manifest?.files).toHaveLength(122);
    // 内部计划在 finish 后删除
    expect(bucket.has(sitePublishPlanKey("share"))).toBe(false);
  });

  test("files are sorted naturally and the copy keeps content-type", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("f");
    bucket.seed([
      { key: "f/b10.png", body: "x", contentType: "image/png" },
      { key: "f/b2.png", body: "y", contentType: "image/png" },
    ]);
    const { plan } = await publishAll(bucket, "s", "f");
    expect(plan.files).toEqual(["b2.png", "b10.png"]);
    const copied = await bucket.asBucket().head("sites/s/b2.png");
    expect(copied?.httpMetadata?.contentType).toBe("image/png");
  });

  test("batch larger than server cap is rejected", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "big", 70);
    const plan = await call(bucket, "big", { phase: "plan", source: "big" });
    const body = plan.json as unknown as PlanJson;
    const copy = await call(bucket, "big", { phase: "copy", planId: body.planId, files: body.files });
    expect(copy.status).toBe(400);
    expect(copy.text).toMatch(/batch too large/);
  });

  test("finish before all files are copied is 409", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "f", 3);
    const plan = (await call(bucket, "s", { phase: "plan", source: "f" })).json as unknown as PlanJson;
    await call(bucket, "s", { phase: "copy", planId: plan.planId, files: [plan.files[0]] });
    const finish = await call(bucket, "s", { phase: "finish", planId: plan.planId });
    expect(finish.status).toBe(409);
    expect(finish.text).toBe("files not copied yet: 2");
    expect(bucket.has("sites/s/index.html")).toBe(false);
  });

  test("a newer plan supersedes the old one", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "f", 2);
    const first = (await call(bucket, "s", { phase: "plan", source: "f" })).json as unknown as PlanJson;
    const second = (await call(bucket, "s", { phase: "plan", source: "f" })).json as unknown as PlanJson;
    expect(second.planId).not.toBe(first.planId);
    const copy = await call(bucket, "s", { phase: "copy", planId: first.planId, files: first.files });
    expect(copy.status).toBe(409);
    expect(copy.text).toMatch(/superseded/);
    const missing = await call(bucket, "other", { phase: "copy", planId: "abc", files: ["x"] });
    expect(missing.status).toBe(409);
    expect(missing.text).toBe("publish plan not found");
  });

  test("source file deleted between plan and copy → 409 with the name", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "f", 2);
    const plan = (await call(bucket, "s", { phase: "plan", source: "f" })).json as unknown as PlanJson;
    await bucket.asBucket().delete("f/file-1.txt");
    const copy = await call(bucket, "s", { phase: "copy", planId: plan.planId, files: plan.files });
    expect(copy.status).toBe(409);
    expect(copy.text).toBe("source file missing: file-1.txt");
  });

  test("bad requests: bad phase / dir shape / planId / files", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "f", 1);
    expect((await call(bucket, "s", { phase: "nope" })).text).toBe("bad phase");
    expect((await call(bucket, "s", [1])).text).toBe("bad dir");
    expect((await call(bucket, "s", { phase: "copy", files: ["a"] })).text).toBe("bad planId");
    const plan = (await call(bucket, "s", { phase: "plan", source: "f" })).json as unknown as PlanJson;
    expect((await call(bucket, "s", { phase: "copy", planId: plan.planId, files: [] })).text).toBe(
      "bad files"
    );
    expect((await call(bucket, "s", { phase: "copy", planId: plan.planId, files: [3] })).text).toBe(
      "bad files"
    );
    const bad = await call(bucket, "S!", { phase: "plan", source: "f" });
    expect(bad.status).toBe(400);
  });

  test("404 when Sites feature switch is off", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      {
        key: CONFIG_KEY,
        body: JSON.stringify({ ...DEFAULT_FEATURE_FLAGS, sites: false }),
        contentType: "application/json",
      },
    ]);
    seedFolder(bucket, "f", 1);
    expect((await call(bucket, "s", { phase: "plan", source: "f" })).status).toBe(404);
  });
});

describe("public directory publish: limits", () => {
  test(`more than ${DIR_MAX_FILES} files is rejected at plan`, async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "many", DIR_MAX_FILES + 1);
    const plan = await call(bucket, "many", { phase: "plan", source: "many" });
    expect(plan.status).toBe(400);
    expect(plan.text).toMatch(/file limit exceeded/);
    expect(bucket.has(sitePublishPlanKey("many"))).toBe(false);
  });

  test(`exactly ${DIR_MAX_FILES} files is accepted`, async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "many", DIR_MAX_FILES);
    const plan = await call(bucket, "many", { phase: "plan", source: "many" });
    expect(plan.status).toBe(200);
    expect((plan.json as unknown as PlanJson).total).toBe(DIR_MAX_FILES);
  });

  test("subfolder contents do not count toward the file limit", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "top", 2);
    seedFolder(bucket, "top/sub", DIR_MAX_FILES + 5);
    const plan = await call(bucket, "top", { phase: "plan", source: "top" });
    expect(plan.status).toBe(200);
    expect((plan.json as unknown as PlanJson).total).toBe(2);
  });

  test("over 2GB total is rejected at plan", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "huge", 2);
    const big = inflateSizes(bucket, { "huge/file-1.txt": DIR_MAX_BYTES, "huge/file-2.txt": 1 });
    const plan = await call(big, "huge", { phase: "plan", source: "huge" });
    expect(plan.status).toBe(400);
    expect(plan.text).toMatch(/size limit exceeded/);
  });

  test("copy phase re-checks bytes (files grew after plan)", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "grow", 2);
    const plan = (await call(bucket, "grow", { phase: "plan", source: "grow" })).json as unknown as PlanJson;
    const grown = inflateSizes(bucket, { "grow/file-1.txt": DIR_MAX_BYTES - 5, "grow/file-2.txt": 100 });
    const copy = await call(grown, "grow", { phase: "copy", planId: plan.planId, files: plan.files });
    expect(copy.status).toBe(400);
    expect(copy.text).toMatch(/size limit exceeded/);
  });

  test("empty folder → no files; missing folder → 404", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("empty");
    bucket.seedDir("empty/only-sub");
    const empty = await call(bucket, "e", { phase: "plan", source: "empty" });
    expect(empty.status).toBe(400);
    expect(empty.text).toBe("no files");
    const missing = await call(bucket, "e", { phase: "plan", source: "ghost" });
    expect(missing.status).toBe(404);
  });
});

describe("public directory publish: path traversal", () => {
  test("isDirectChildKey only accepts direct children", () => {
    expect(isDirectChildKey("a/b", "a/b/c.txt")).toBe(true);
    expect(isDirectChildKey("a/b", "a/b/c/d.txt")).toBe(false);
    expect(isDirectChildKey("a/b", "a/bc/d.txt")).toBe(false);
    expect(isDirectChildKey("a/b", "a/b/")).toBe(false);
    expect(isDirectChildKey("a/b", "a/b/..")).toBe(false);
    expect(isDirectChildKey("a/b", "a/b/.")).toBe(false);
    expect(isDirectChildKey("a/b", "a/b/x\\..\\y")).toBe(false);
    expect(isDirectChildKey("a/b", "a/b/x\ny")).toBe(false);
    expect(isDirectChildKey("a/b", "a/other.txt")).toBe(false);
    expect(isDirectChildKey("", "x.txt")).toBe(false);
    expect(isDirectChildKey("_$flaredrive$", "_$flaredrive$/flags.json")).toBe(false);
  });

  test("source with .. or internal prefix or the target site itself is rejected", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "f", 1);
    bucket.seed([{ key: "sites/s/old.txt", body: "x" }]);
    for (const source of ["../f", "f/..", "_$flaredrive$", "sites/s", "sites/s/sub"]) {
      const res = await call(bucket, "s", { phase: "plan", source });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect(bucket.has(sitePublishPlanKey("s"))).toBe(false);
  });

  test("copy only accepts names from the server plan", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "f", 1);
    bucket.seed([{ key: "secret/key.txt", body: "top secret" }]);
    const plan = (await call(bucket, "s", { phase: "plan", source: "f" })).json as unknown as PlanJson;
    for (const name of ["../secret/key.txt", "secret/key.txt", "../../secret/key.txt", "index.html"]) {
      const copy = await call(bucket, "s", { phase: "copy", planId: plan.planId, files: [name] });
      expect(copy.status).toBe(400);
      expect(copy.text).toBe("file not in publish plan");
    }
    expect(bucket.has("sites/s/key.txt")).toBe(false);
  });

  test("a tampered plan pointing outside the source is refused at copy", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "f", 1);
    bucket.seed([{ key: "secret/key.txt", body: "top secret" }]);
    const plan = (await call(bucket, "s", { phase: "plan", source: "f" })).json as unknown as PlanJson;
    const stored = bucket.rawJson<{ items: Array<{ from: string; to: string }> }>(
      sitePublishPlanKey("s")
    )!;
    stored.items[0].from = "secret/key.txt";
    bucket.seed([{ key: sitePublishPlanKey("s"), body: JSON.stringify(stored) }]);
    const copy = await call(bucket, "s", { phase: "copy", planId: plan.planId, files: plan.files });
    expect(copy.status).toBe(400);
    expect(copy.text).toBe("file outside source folder");
    const stored2 = { ...stored, items: [{ ...stored.items[0], from: "f/file-1.txt", to: "../escape.txt" }] };
    bucket.seed([{ key: sitePublishPlanKey("s"), body: JSON.stringify(stored2) }]);
    const copy2 = await call(bucket, "s", { phase: "copy", planId: plan.planId, files: ["../escape.txt"] });
    expect(copy2.status).toBe(400);
    expect(bucket.has("sites/escape.txt")).toBe(false);
  });

  test("allocateSiteFileNames avoids reserved and blocked names case-insensitively", () => {
    expect(
      allocateSiteFileNames(
        ["index.html", "INDEX.HTML", "a.txt", "A.TXT", SITE_MANIFEST_NAME, "user.txt"],
        new Set(["user.txt"])
      )
    ).toEqual(["index-2.html", "INDEX-3.HTML", "a.txt", "A-2.TXT", ".davflare-manifest-2.json", "user-2.txt"]);
  });
});

describe("public directory publish: escaping", () => {
  test("hostile file names and title are escaped in the listing page", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("x");
    bucket.seed([
      { key: 'x/<img src=x onerror=alert(1)>.txt', body: "1" },
      { key: 'x/"quote" & \'apos\'.txt', body: "2" },
    ]);
    const { finish } = await publishAll(bucket, "x", "x", 50, { title: "<script>alert(1)</script>" });
    expect(finish.status).toBe(200);
    const html = bucket.rawText("sites/x/index.html") ?? "";
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;.txt");
    expect(html).toContain("%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E.txt");
    expect(html).toContain("&quot;quote&quot; &amp; &#39;apos&#39;.txt");
    expect(html).not.toMatch(/<script/i);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll("script, img, iframe, object")).toHaveLength(0);
    for (const element of Array.from(doc.querySelectorAll("*"))) {
      for (const attr of Array.from(element.attributes)) {
        expect(attr.name.startsWith("on")).toBe(false);
      }
    }
    const names = Array.from(doc.querySelectorAll("td.name a")).map((a) => a.textContent);
    expect(names).toEqual(['"quote" & \'apos\'.txt', "<img src=x onerror=alert(1)>.txt"]);
  });
});

describe("public directory publish: manifest overwrite", () => {
  test("republish deletes only paths from the previous manifest and keeps user files", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("f");
    bucket.seed([
      { key: "f/keep.txt", body: "v1" },
      { key: "f/gone.txt", body: "old" },
      { key: "sites/s/user-note.txt", body: "mine" },
      { key: "sites/s/user-dir/a.txt", body: "mine too" },
    ]);
    await publishAll(bucket, "s", "f");
    expect(bucket.has("sites/s/gone.txt")).toBe(true);

    await bucket.asBucket().delete("f/gone.txt");
    bucket.seed([
      { key: "f/keep.txt", body: "v2" },
      { key: "f/new.txt", body: "n" },
    ]);
    const { finish } = await publishAll(bucket, "s", "f");
    expect(finish.status).toBe(200);
    expect(bucket.has("sites/s/gone.txt")).toBe(false);
    expect(bucket.rawText("sites/s/keep.txt")).toBe("v2");
    expect(bucket.has("sites/s/new.txt")).toBe(true);
    expect(bucket.rawText("sites/s/user-note.txt")).toBe("mine");
    expect(bucket.rawText("sites/s/user-dir/a.txt")).toBe("mine too");
  });

  test("user file with the same name is not overwritten; copy is renamed", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("f");
    bucket.seed([
      { key: "f/readme.txt", body: "from drive" },
      { key: "sites/s/readme.txt", body: "hand written" },
    ]);
    const { plan } = await publishAll(bucket, "s", "f");
    expect(plan.files).toEqual(["readme-2.txt"]);
    expect(bucket.rawText("sites/s/readme.txt")).toBe("hand written");
    expect(bucket.rawText("sites/s/readme-2.txt")).toBe("from drive");
  });

  test("dir publish over an album removes the album's files and its manifest", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/s/photo.jpg", body: "img" },
      { key: "sites/s/index.html", body: "<album/>" },
      { key: "sites/s/mine.txt", body: "user" },
      {
        key: `sites/s/${ALBUM_MANIFEST_NAME}`,
        body: JSON.stringify({ version: 1, files: ["photo.jpg", "index.html", ALBUM_MANIFEST_NAME] }),
      },
    ]);
    bucket.seedDir("f");
    bucket.seed([{ key: "f/doc.pdf", body: "pdf" }]);
    await publishAll(bucket, "s", "f");
    expect(bucket.has("sites/s/photo.jpg")).toBe(false);
    expect(bucket.has(`sites/s/${ALBUM_MANIFEST_NAME}`)).toBe(false);
    expect(bucket.has("sites/s/doc.pdf")).toBe(true);
    expect(bucket.rawText("sites/s/mine.txt")).toBe("user");
    expect(bucket.rawText("sites/s/index.html")).toContain("doc.pdf");
  });

  test("album publish over a dir site removes the dir files (shared manifest logic)", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("f");
    bucket.seed([
      { key: "f/doc.pdf", body: "pdf" },
      { key: "pics/a.jpg", body: "jpg", contentType: "image/jpeg" },
      { key: "sites/s/mine.txt", body: "user" },
    ]);
    await publishAll(bucket, "s", "f");
    const res = await onRequestPost(
      makeContext(post({ slug: "s", album: { files: ["pics/a.jpg"], lang: "en" } }), makeEnv(bucket))
    );
    expect(res.status).toBe(200);
    expect(bucket.has("sites/s/doc.pdf")).toBe(false);
    expect(bucket.has(`sites/s/${SITE_MANIFEST_NAME}`)).toBe(false);
    expect(bucket.has(`sites/s/${ALBUM_MANIFEST_NAME}`)).toBe(true);
    expect(bucket.rawText("sites/s/mine.txt")).toBe("user");
  });

  test("an interrupted publish is repaired by republishing without -2 duplicates", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "f", 3);
    const plan = (await call(bucket, "s", { phase: "plan", source: "f" })).json as unknown as PlanJson;
    await call(bucket, "s", { phase: "copy", planId: plan.planId, files: [plan.files[0]] });
    // 中途放弃：sites/s/file-1.txt 已写入但没有清单
    expect(bucket.has("sites/s/file-1.txt")).toBe(true);
    const { plan: second, finish } = await publishAll(bucket, "s", "f");
    expect(finish.status).toBe(200);
    expect(second.files).toEqual(["file-1.txt", "file-2.txt", "file-3.txt"]);
    expect(bucket.has("sites/s/file-1-2.txt")).toBe(false);
  });

  test("interrupted publish of other names: stale targets are cleaned on the next finish", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket, "f", 2);
    bucket.seedDir("g");
    bucket.seed([{ key: "g/only.txt", body: "g" }]);
    const plan = (await call(bucket, "s", { phase: "plan", source: "f" })).json as unknown as PlanJson;
    await call(bucket, "s", { phase: "copy", planId: plan.planId, files: plan.files });
    await publishAll(bucket, "s", "g");
    expect(bucket.has("sites/s/file-1.txt")).toBe(false);
    expect(bucket.has("sites/s/only.txt")).toBe(true);
  });
});
