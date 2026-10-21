import { onRequestPost } from "../../../functions/api/sites";
import { SITE_MANIFEST_NAME } from "../../../functions/siteManifest";
import {
  InMemoryBucket,
  basicAuthHeader,
  makeContext,
} from "../testInMemoryBucket";

const AUTH = basicAuthHeader("user", "pass");

function makeEnv(bucket: InMemoryBucket, extra: Record<string, unknown> = {}) {
  return {
    BUCKET: bucket.asBucket(),
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
    SITES_HOST: "sites.example.com",
    ...extra,
  };
}

function post(body: unknown): Request {
  return new Request("http://drive.example.com/api/sites", {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sites API bookshelf publish", () => {
  test("copies pdf/epub, optional cover from thumbnail, skips others", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      {
        key: "lib/guide.pdf",
        body: "%PDF-1.4",
        contentType: "application/pdf",
        customMetadata: { thumbnail: "aabbccddeeff0011" },
      },
      { key: "lib/novel.epub", body: "PKZIP", contentType: "application/epub+zip" },
      { key: "lib/notes.txt", body: "hi", contentType: "text/plain" },
      {
        key: "_$flaredrive$/thumbnails/aabbccddeeff0011.png",
        body: "PNGDATA",
        contentType: "image/png",
      },
    ]);

    const response = await onRequestPost(
      makeContext(
        post({
          slug: "my-lib",
          bookshelf: {
            lang: "zh",
            title: "我的资料",
            files: ["lib/guide.pdf", "lib/novel.epub", "lib/notes.txt"],
          },
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      slug: string;
      kind: string;
      copied: number;
      sitesHost: string | null;
    };
    expect(body.slug).toBe("my-lib");
    expect(body.kind).toBe("bookshelf");
    expect(body.copied).toBe(2);
    expect(body.sitesHost).toBe("sites.example.com");

    const index = await bucket.asBucket().get("sites/my-lib/index.html");
    expect(index).not.toBeNull();
    const html = await index!.text();
    expect(html).toContain("guide.pdf");
    expect(html).toContain("novel.epub");
    expect(html).toContain("covers/guide.png");
    expect(html).toContain("打开");
    expect(html).not.toContain("notes.txt");

    const pdf = await bucket.asBucket().head("sites/my-lib/guide.pdf");
    expect(pdf?.httpMetadata?.contentType).toBe("application/pdf");
    const cover = await bucket.asBucket().get("sites/my-lib/covers/guide.png");
    expect(cover).not.toBeNull();
    expect(await cover!.text()).toBe("PNGDATA");

    const manifest = await bucket.asBucket().get(`sites/my-lib/${SITE_MANIFEST_NAME}`);
    expect(manifest).not.toBeNull();
    const parsed = JSON.parse(await manifest!.text()) as { kind: string; files: string[] };
    expect(parsed.kind).toBe("bookshelf");
    expect(parsed.files).toContain("covers/guide.png");
  });

  test("rejects empty bookshelf", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "lib/a.txt", body: "x", contentType: "text/plain" }]);
    const response = await onRequestPost(
      makeContext(
        post({ slug: "empty", bookshelf: { files: ["lib/a.txt"] } }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/no bookshelf assets/);
  });
});
