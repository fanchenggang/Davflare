/**
 * #160：普通文件夹重新发布要清掉生成型站点的清单 / 生成文件 / 发布计划；
 * 只做 plan 就放弃的发布会过期、不算占用；删站点连计划一起删；文档站只渲染清单里的页面。
 */
import { onRequest } from "../../../functions/_middleware";
import { onRequestDelete, onRequestGet, onRequestPost } from "../../../functions/api/sites";
import {
  ALBUM_MANIFEST_NAME,
  SITE_MANIFEST_NAME,
  serializeSiteManifest,
  siteFileForcesDownload,
} from "../../../functions/siteManifest";
import { SITE_PUBLISH_PLAN_TTL_MS, isSitePublishPlanExpired, sitePublishPlanKey } from "../../../functions/sitePublish";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const AUTH = basicAuthHeader("user", "pass");

function env(bucket: InMemoryBucket) {
  return { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass", SITES_HOST: "sites.example.com" };
}

async function api(bucket: InMemoryBucket, method: string, query = "", body?: unknown) {
  const request = new Request(`http://drive.example.com/api/sites${query}`, {
    method,
    headers: { Authorization: AUTH, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const handler = method === "GET" ? onRequestGet : method === "DELETE" ? onRequestDelete : onRequestPost;
  const response = await handler(makeContext(request, env(bucket)));
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

function serve(bucket: InMemoryBucket, path: string) {
  return onRequest(
    makeContext(new Request(`http://sites.example.com${path}`, { headers: { Host: "sites.example.com" } }), env(bucket), {})
  );
}

async function isDownload(bucket: InMemoryBucket, path: string) {
  const response = await serve(bucket, path);
  expect(response.status).toBe(200);
  return (response.headers.get("Content-Disposition") || "").startsWith("attachment");
}

function seedStaticFolder(bucket: InMemoryBucket) {
  bucket.seedDir("web");
  bucket.seed([
    { key: "web/index.html", body: "<h1>home</h1>", contentType: "text/html" },
    { key: "web/app.js", body: "console.log(1)", contentType: "text/javascript" },
    { key: "web/logo.svg", body: "<svg/>", contentType: "image/svg+xml" },
    { key: "notes/intro.md", body: "# intro" },
  ]);
}

function ageAllPlans(bucket: InMemoryBucket, slug: string) {
  const key = sitePublishPlanKey(slug);
  const plan = JSON.parse(bucket.rawText(key) ?? "null");
  plan.createdAt = new Date(Date.now() - SITE_PUBLISH_PLAN_TTL_MS - 60_000).toISOString();
  bucket.seed([{ key, body: JSON.stringify(plan), contentType: "application/json" }]);
}

describe("folder re-publish clears generated-site state (#160)", () => {
  test("static site → abandoned docs plan → folder re-publish restores js/svg inline", async () => {
    const bucket = new InMemoryBucket();
    seedStaticFolder(bucket);
    expect((await api(bucket, "POST", "", { slug: "qa", source: "web" })).status).toBe(200);
    expect(await isDownload(bucket, "/qa/app.js")).toBe(false);

    const plan = await api(bucket, "POST", "", {
      slug: "qa",
      docs: { phase: "plan", pages: ["intro.html"], sources: ["notes/intro.md"], images: [] },
    });
    expect(plan.status).toBe(200);
    expect(await isDownload(bucket, "/qa/app.js")).toBe(true);
    expect(await isDownload(bucket, "/qa/logo.svg")).toBe(true);
    expect((await api(bucket, "GET", "?check=qa")).json.kind).toBe("docs");

    expect((await api(bucket, "POST", "", { slug: "qa", source: "web" })).status).toBe(200);
    expect(await isDownload(bucket, "/qa/app.js")).toBe(false);
    expect(await isDownload(bucket, "/qa/logo.svg")).toBe(false);
    expect(bucket.has(`sites/qa/${SITE_MANIFEST_NAME}`)).toBe(false);
    expect(bucket.has(`sites/qa/${ALBUM_MANIFEST_NAME}`)).toBe(false);
    expect(bucket.has(sitePublishPlanKey("qa"))).toBe(false);
    const check = (await api(bucket, "GET", "?check=qa")).json;
    expect(check).toMatchObject({ exists: true, kind: "static", source: "web" });
  });

  test("generated files that the new folder does not contain are removed; user files kept", async () => {
    const bucket = new InMemoryBucket();
    seedStaticFolder(bucket);
    bucket.seed([
      { key: "sites/qa/index.html", body: "<h1>listing</h1>", contentType: "text/html" },
      { key: "sites/qa/evil.svg", body: "<svg onload=alert(1)/>", contentType: "image/svg+xml" },
      { key: "sites/qa/hand-made.txt", body: "mine" },
      { key: `sites/qa/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("dir", ["index.html", "evil.svg", SITE_MANIFEST_NAME]) },
      { key: `sites/qa/${ALBUM_MANIFEST_NAME}`, body: JSON.stringify({ version: 1, kind: "album", files: ["old.png"] }) },
      { key: "sites/qa/old.png", body: "png" },
    ]);
    expect((await api(bucket, "POST", "", { slug: "qa", source: "web" })).status).toBe(200);
    expect(bucket.has("sites/qa/evil.svg")).toBe(false);
    expect(bucket.has("sites/qa/old.png")).toBe(false);
    expect(bucket.has("sites/qa/hand-made.txt")).toBe(true);
    expect(bucket.rawText("sites/qa/index.html")).toBe("<h1>home</h1>");
  });

  test("manifest files at the source folder root are not copied", async () => {
    const bucket = new InMemoryBucket();
    seedStaticFolder(bucket);
    bucket.seed([
      { key: `web/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("dir", ["app.js"]) },
      { key: `web/${ALBUM_MANIFEST_NAME}`, body: "{}" },
      { key: `web/sub/${SITE_MANIFEST_NAME}`, body: "{}" },
    ]);
    const res = await api(bucket, "POST", "", { slug: "qa", source: "web" });
    expect(res.status).toBe(200);
    expect(bucket.has(`sites/qa/${SITE_MANIFEST_NAME}`)).toBe(false);
    expect(bucket.has(`sites/qa/${ALBUM_MANIFEST_NAME}`)).toBe(false);
    expect(bucket.has(`sites/qa/sub/${SITE_MANIFEST_NAME}`)).toBe(true);
    expect(await isDownload(bucket, "/qa/app.js")).toBe(false);
  });
});

describe("abandoned publish plans (#160)", () => {
  test("plan expiry helper", () => {
    const now = Date.now();
    expect(isSitePublishPlanExpired({ createdAt: new Date(now).toISOString() }, now)).toBe(false);
    expect(isSitePublishPlanExpired({ createdAt: new Date(now - SITE_PUBLISH_PLAN_TTL_MS - 1).toISOString() }, now)).toBe(true);
    expect(isSitePublishPlanExpired({}, now)).toBe(true);
  });

  test("an abandoned plan-only site is not occupied or listed once the plan expires; copy is refused", async () => {
    const bucket = new InMemoryBucket();
    seedStaticFolder(bucket);
    const plan = await api(bucket, "POST", "", {
      slug: "ghost",
      docs: { phase: "plan", pages: ["intro.html"], sources: ["notes/intro.md"], images: [] },
    });
    expect(plan.status).toBe(200);
    // 计划还在有效期内：发布进行中，算占用
    expect((await api(bucket, "GET", "?check=ghost")).json.exists).toBe(true);
    ageAllPlans(bucket, "ghost");
    expect((await api(bucket, "GET", "?check=ghost")).json).toMatchObject({ exists: false, kind: null });
    const list = await api(bucket, "GET");
    expect(list.json.sites.map((site: { slug: string }) => site.slug)).not.toContain("ghost");
    const put = await api(bucket, "POST", "", {
      slug: "ghost",
      docs: { phase: "put", planId: plan.json.planId, pages: [{ name: "intro.html", html: "<p>x</p>" }] },
    });
    expect(put.status).toBe(409);
    expect(put.text).toContain("expired");
  });

  test("a real site with content is still listed even with an expired plan", async () => {
    const bucket = new InMemoryBucket();
    seedStaticFolder(bucket);
    await api(bucket, "POST", "", { slug: "live", source: "web" });
    await api(bucket, "POST", "", {
      slug: "live",
      docs: { phase: "plan", pages: ["intro.html"], sources: ["notes/intro.md"], images: [] },
    });
    ageAllPlans(bucket, "live");
    expect((await api(bucket, "GET", "?check=live")).json.exists).toBe(true);
    expect((await api(bucket, "GET")).json.sites.map((site: { slug: string }) => site.slug)).toContain("live");
  });

  test("DELETE (plain and purge) removes the saved publish plan", async () => {
    for (const query of ["?slug=ghost", "?slug=ghost&purge=1"]) {
      const bucket = new InMemoryBucket();
      seedStaticFolder(bucket);
      await api(bucket, "POST", "", {
        slug: "ghost",
        docs: { phase: "plan", pages: ["intro.html"], sources: ["notes/intro.md"], images: [] },
      });
      expect(bucket.has(sitePublishPlanKey("ghost"))).toBe(true);
      expect((await api(bucket, "DELETE", query)).status).toBe(200);
      expect(bucket.has(sitePublishPlanKey("ghost"))).toBe(false);
      expect(bucket.has(`sites/ghost/${SITE_MANIFEST_NAME}`)).toBe(false);
    }
  });
});

describe("docs sites only render pages listed in the manifest (#160)", () => {
  test("siteFileForcesDownload with the docs page list", () => {
    const pages = new Set(["intro.html", "guide/a.html"]);
    expect(siteFileForcesDownload("docs", "intro.html", pages)).toBe(false);
    expect(siteFileForcesDownload("docs", "guide/a.html", pages)).toBe(false);
    expect(siteFileForcesDownload("docs", "evil.html", pages)).toBe(true);
    expect(siteFileForcesDownload("docs", "intro.html")).toBe(true);
    expect(siteFileForcesDownload("docs", "index.html", new Set())).toBe(false);
  });

  test("middleware: listed page inline, unlisted html downloads", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/manual/index.html", body: "<h1>docs</h1>", contentType: "text/html" },
      { key: "sites/manual/intro.html", body: "<p>intro</p>", contentType: "text/html" },
      { key: "sites/manual/dropped-in.html", body: "<script>alert(1)</script>", contentType: "text/html" },
      { key: `sites/manual/${SITE_MANIFEST_NAME}`, body: serializeSiteManifest("docs", ["index.html", "intro.html", SITE_MANIFEST_NAME]) },
    ]);
    expect(await isDownload(bucket, "/manual/intro.html")).toBe(false);
    expect(await isDownload(bucket, "/manual/dropped-in.html")).toBe(true);
    expect(await isDownload(bucket, "/manual/")).toBe(false);
  });
});
