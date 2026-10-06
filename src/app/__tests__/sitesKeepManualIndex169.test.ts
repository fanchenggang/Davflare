/**
 * #169：只做了 plan 就放弃的文档站 / 公开目录发布，不能把站点里手动上传的 index.html 记进预清单；
 * 否则之后用普通文件夹重新发布时，它会被当成生成文件永久删除。
 */
import { onRequestPost } from "../../../functions/api/sites";
import { SITE_MANIFEST_NAME, parseSiteManifest } from "../../../functions/siteManifest";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const AUTH = basicAuthHeader("user", "pass");

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
  // 源文件夹没有 index.html；站点里的 index.html 是手动上传的
  bucket.seedDir("web");
  bucket.seed([
    { key: "web/about.html", body: "<h1>about</h1>", contentType: "text/html" },
    { key: "notes/intro.md", body: "# intro" },
    { key: "share/inbox/a.txt", body: "a" },
  ]);
}

function earlyFiles(bucket: InMemoryBucket, slug: string): string[] {
  return parseSiteManifest(bucket.rawText(`sites/${slug}/${SITE_MANIFEST_NAME}`) ?? "").files;
}

const docsPlan = (slug: string) =>
  ({ slug, docs: { phase: "plan", pages: ["intro.html"], sources: ["notes/intro.md"], images: [] } }) as const;
const dirPlan = (slug: string) => ({ slug, dir: { phase: "plan", source: "share/inbox", lang: "en" } }) as const;

describe("#169 manual index.html survives an abandoned plan + folder re-publish", () => {
  for (const [label, plan] of [
    ["docs", docsPlan],
    ["dir", dirPlan],
  ] as const) {
    test(`${label} plan abandoned → folder re-publish keeps the hand-uploaded index.html`, async () => {
      const bucket = new InMemoryBucket();
      seed(bucket);
      expect((await post(bucket, { slug: "e", source: "web" })).status).toBe(200);
      bucket.seed([{ key: "sites/e/index.html", body: "<h1>manual</h1>", contentType: "text/html" }]);

      const planned = await post(bucket, plan("e"));
      expect(planned.status).toBe(200);
      expect(earlyFiles(bucket, "e")).not.toContain("index.html");

      expect((await post(bucket, { slug: "e", source: "web" })).status).toBe(200);
      expect(bucket.rawText("sites/e/index.html")).toBe("<h1>manual</h1>");
      expect(bucket.rawText("sites/e/about.html")).toBe("<h1>about</h1>");
    });
  }

  test("two abandoned docs plans in a row still do not claim index.html", async () => {
    const bucket = new InMemoryBucket();
    seed(bucket);
    expect((await post(bucket, { slug: "e", source: "web" })).status).toBe(200);
    bucket.seed([{ key: "sites/e/index.html", body: "<h1>manual</h1>", contentType: "text/html" }]);
    expect((await post(bucket, docsPlan("e"))).status).toBe(200);
    expect((await post(bucket, docsPlan("e"))).status).toBe(200);
    expect(earlyFiles(bucket, "e")).not.toContain("index.html");
    expect((await post(bucket, { slug: "e", source: "web" })).status).toBe(200);
    expect(bucket.rawText("sites/e/index.html")).toBe("<h1>manual</h1>");
  });

  test("a fresh slug (no index.html yet) still lists index.html in the early manifest", async () => {
    const bucket = new InMemoryBucket();
    seed(bucket);
    expect((await post(bucket, docsPlan("fresh"))).status).toBe(200);
    expect(earlyFiles(bucket, "fresh")).toContain("index.html");
  });

  test("a finished docs publish writes its index.html and then owns it", async () => {
    const bucket = new InMemoryBucket();
    seed(bucket);
    bucket.seed([{ key: "sites/e/index.html", body: "<h1>manual</h1>", contentType: "text/html" }]);
    const plan = await post(bucket, docsPlan("e"));
    const planId = plan.json.planId as string;
    const pages = plan.json.pages as string[];
    expect(
      (
        await post(bucket, {
          slug: "e",
          docs: { planId, phase: "put", pages: [{ name: pages[0], html: "<p>i</p>" }, { name: "index.html", html: "<h1>gen</h1>" }] },
        })
      ).status
    ).toBe(200);
    expect((await post(bucket, { slug: "e", docs: { planId, phase: "finish" } })).status).toBe(200);
    expect(bucket.rawText("sites/e/index.html")).toBe("<h1>gen</h1>");
    expect(earlyFiles(bucket, "e")).toContain("index.html");
  });
});
