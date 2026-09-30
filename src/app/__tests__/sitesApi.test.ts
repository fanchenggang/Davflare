/**
 * functions/api/sites.ts — publish (source) + SPA config branches.
 */
import { onRequestPost } from "../../../functions/api/sites";
import { CONFIG_KEY, DEFAULT_FEATURE_FLAGS } from "../../../functions/_flags";
import { ALBUM_MANIFEST_NAME, ALBUM_MAX_BYTES } from "../../../functions/sitePages";
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

describe("sites API publish", () => {
  test("copies folder files onto sites/{slug}/ and returns sitesHost", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("blog");
    bucket.seed([
      { key: "blog/index.html", body: "<h1>hi</h1>", contentType: "text/html" },
      { key: "blog/assets/a.css", body: "body{}", contentType: "text/css" },
    ]);

    const response = await onRequestPost(
      makeContext(post({ slug: "hello", source: "blog" }), makeEnv(bucket))
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      slug: string;
      source: string;
      copied: number;
      sitesHost: string | null;
    };
    expect(body).toEqual({
      slug: "hello",
      source: "blog",
      copied: 2,
      sitesHost: "sites.example.com",
    });
    expect(await bucket.asBucket().get("sites/hello/index.html")).not.toBeNull();
    expect(await bucket.asBucket().get("sites/hello/assets/a.css")).not.toBeNull();
  });

  test("rejects bad slug / missing source folder / self-target", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("blog");
    bucket.seed([{ key: "blog/index.html", body: "x" }]);

    expect(
      (await onRequestPost(makeContext(post({ slug: "has_underscore", source: "blog" }), makeEnv(bucket))))
        .status
    ).toBe(400);

    expect(
      (
        await onRequestPost(
          makeContext(post({ slug: "ok", source: "missing" }), makeEnv(bucket))
        )
      ).status
    ).toBe(404);

    bucket.seed([{ key: "sites/ok/index.html", body: "x" }]);
    expect(
      (
        await onRequestPost(
          makeContext(post({ slug: "ok", source: "sites/ok" }), makeEnv(bucket))
        )
      ).status
    ).toBe(400);
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
    bucket.seedDir("blog");
    bucket.seed([{ key: "blog/index.html", body: "x" }]);
    const response = await onRequestPost(
      makeContext(post({ slug: "hello", source: "blog" }), makeEnv(bucket))
    );
    expect(response.status).toBe(404);
  });

  test("SPA config path still works without source", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "sites/blog/index.html", body: "<h1/>" }]);
    const response = await onRequestPost(
      makeContext(post({ slug: "blog", spa: true }), makeEnv(bucket))
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      slug: "blog",
      spa: true,
      passwordProtected: false,
      hostname: null,
    });
  });

  test("set / clear access password stores hash only", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "sites/blog/index.html", body: "<h1/>" }]);

    const setResponse = await onRequestPost(
      makeContext(post({ slug: "blog", password: "s3cret" }), makeEnv(bucket))
    );
    expect(setResponse.status).toBe(200);
    expect(await setResponse.json()).toEqual({
      slug: "blog",
      spa: false,
      passwordProtected: true,
      hostname: null,
    });

    const stored = await bucket.asBucket().get("_$flaredrive$/sites/blog.json");
    expect(stored).not.toBeNull();
    const config = (await stored!.json()) as { passwordHash?: string; password?: string };
    expect(config.password).toBeUndefined();
    expect(config.passwordHash).toMatch(/^[a-f0-9]{64}$/);
    expect(config.passwordHash).not.toContain("s3cret");

    // SPA toggle must not clear the password hash
    const spaResponse = await onRequestPost(
      makeContext(post({ slug: "blog", spa: true }), makeEnv(bucket))
    );
    expect(await spaResponse.json()).toEqual({
      slug: "blog",
      spa: true,
      passwordProtected: true,
      hostname: null,
    });
    const afterSpa = (await (
      await bucket.asBucket().get("_$flaredrive$/sites/blog.json")
    )!.json()) as { passwordHash?: string; spa?: boolean };
    expect(afterSpa.spa).toBe(true);
    expect(afterSpa.passwordHash).toBe(config.passwordHash);

    const clearResponse = await onRequestPost(
      makeContext(post({ slug: "blog", password: null }), makeEnv(bucket))
    );
    expect(await clearResponse.json()).toEqual({
      slug: "blog",
      spa: true,
      passwordProtected: false,
      hostname: null,
    });
    const cleared = (await (
      await bucket.asBucket().get("_$flaredrive$/sites/blog.json")
    )!.json()) as { passwordHash?: string };
    expect(cleared.passwordHash).toBeUndefined();
  });

  test("rejects oversized password", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "sites/blog/index.html", body: "x" }]);
    const response = await onRequestPost(
      makeContext(post({ slug: "blog", password: "x".repeat(129) }), makeEnv(bucket))
    );
    expect(response.status).toBe(400);
  });

  test("set / clear custom hostname with uniqueness", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/blog/index.html", body: "<h1/>" },
      { key: "sites/other/index.html", body: "<h1/>" },
    ]);

    const setResponse = await onRequestPost(
      makeContext(post({ slug: "blog", hostname: "Blog.Example.com" }), makeEnv(bucket))
    );
    expect(setResponse.status).toBe(200);
    expect(await setResponse.json()).toEqual({
      slug: "blog",
      spa: false,
      passwordProtected: false,
      hostname: "blog.example.com",
    });
    const index = await bucket.asBucket().get("_$flaredrive$/site-hostnames/blog.example.com");
    expect(await index!.text()).toBe("blog");
    const config = (await (
      await bucket.asBucket().get("_$flaredrive$/sites/blog.json")
    )!.json()) as { hostname?: string };
    expect(config.hostname).toBe("blog.example.com");

    const conflict = await onRequestPost(
      makeContext(post({ slug: "other", hostname: "blog.example.com" }), makeEnv(bucket))
    );
    expect(conflict.status).toBe(409);

    const equalsSitesHost = await onRequestPost(
      makeContext(post({ slug: "blog", hostname: "sites.example.com" }), makeEnv(bucket))
    );
    expect(equalsSitesHost.status).toBe(400);

    const bad = await onRequestPost(
      makeContext(post({ slug: "blog", hostname: "localhost" }), makeEnv(bucket))
    );
    expect(bad.status).toBe(400);

    // SPA toggle must not clear hostname
    const spaResponse = await onRequestPost(
      makeContext(post({ slug: "blog", spa: true }), makeEnv(bucket))
    );
    expect(await spaResponse.json()).toEqual({
      slug: "blog",
      spa: true,
      passwordProtected: false,
      hostname: "blog.example.com",
    });

    const clearResponse = await onRequestPost(
      makeContext(post({ slug: "blog", hostname: null }), makeEnv(bucket))
    );
    expect(await clearResponse.json()).toEqual({
      slug: "blog",
      spa: true,
      passwordProtected: false,
      hostname: null,
    });
    expect(await bucket.asBucket().get("_$flaredrive$/site-hostnames/blog.example.com")).toBeNull();
  });
});


describe("sites API nav publish", () => {
  test("writes escaped index.html and leaves unrelated files in the slug", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "sites/nav/keep.txt", body: "KEEP" },
      { key: "sites/nav/old-photo.jpg", body: "OLD" },
    ]);
    const response = await onRequestPost(
      makeContext(
        post({
          slug: "nav",
          nav: {
            lang: "zh",
            title: "<script>",
            groups: [
              {
                name: "<b>g</b>",
                links: [
                  { title: "<img>", href: "javascript:alert(1)" },
                  { title: "ok", href: "https://ex.test/a" },
                ],
              },
            ],
          },
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      slug: "nav",
      kind: "nav",
      copied: 1,
      count: 2,
      sitesHost: "sites.example.com",
    });
    const html = bucket.rawText("sites/nav/index.html") || "";
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;g&lt;/b&gt;");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('target="_blank"');
    expect(bucket.rawText("sites/nav/keep.txt")).toBe("KEEP");
    expect(bucket.rawText("sites/nav/old-photo.jpg")).toBe("OLD");
  });

  test("rejects more than 1000 bookmarks and writes nothing", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "sites/nav/keep.txt", body: "KEEP" }]);
    const links = Array.from({ length: 1001 }, (_, i) => ({
      title: "t",
      href: `https://ex.test/${i}`,
    }));
    const response = await onRequestPost(
      makeContext(
        post({ slug: "nav", nav: { groups: [{ name: "g", links }] } }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/bookmark limit exceeded: 1001 > 1000/);
    expect(bucket.has("sites/nav/index.html")).toBe(false);
    expect(bucket.rawText("sites/nav/keep.txt")).toBe("KEEP");
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
    const response = await onRequestPost(
      makeContext(
        post({
          slug: "nav",
          nav: { groups: [{ name: "g", links: [{ title: "a", href: "https://ex.test" }] }] },
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(404);
    expect(bucket.has("sites/nav/index.html")).toBe(false);
  });
});

describe("sites API album publish", () => {
  test("copies raster bytes, rewrites only the previous manifest, keeps user files", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "pics/new.jpg", body: "NEW", contentType: "image/jpeg" },
      { key: "pics/photo.jpg", body: "COPY", contentType: "image/jpeg" },
      { key: "pics/notes.txt", body: "NOPE" },
      { key: "sites/album/photo.jpg", body: "USER" },
      { key: "sites/album/keep.txt", body: "KEEP" },
      { key: "sites/album/old.jpg", body: "OLD" },
      { key: "sites/album/index.html", body: "OLDINDEX" },
      { key: "sites/other/secret.txt", body: "SECRET" },
      {
        key: `sites/album/${ALBUM_MANIFEST_NAME}`,
        body: JSON.stringify({
          version: 1,
          kind: "album",
          files: ["old.jpg", "index.html", ALBUM_MANIFEST_NAME, "../secret", "sites/other/secret.txt"],
        }),
        contentType: "application/json",
      },
    ]);

    const response = await onRequestPost(
      makeContext(
        post({
          slug: "album",
          album: {
            lang: "en",
            title: "<album>",
            files: ["pics/notes.txt", "pics/new.jpg", "pics/photo.jpg", "pics/new.jpg"],
          },
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { copied: number; kind: string; bytes: number };
    expect(body.kind).toBe("album");
    expect(body.copied).toBe(2);
    expect(body.bytes).toBe(3 + 4);

    expect(bucket.has("sites/album/old.jpg")).toBe(false);
    expect(bucket.rawText("sites/album/keep.txt")).toBe("KEEP");
    expect(bucket.rawText("sites/album/photo.jpg")).toBe("USER");
    expect(bucket.rawText("sites/album/photo-2.jpg")).toBe("COPY");
    expect(bucket.rawText("sites/album/new.jpg")).toBe("NEW");
    expect(bucket.rawText("sites/other/secret.txt")).toBe("SECRET");
    expect(bucket.rawText("pics/new.jpg")).toBe("NEW");

    const html = bucket.rawText("sites/album/index.html") || "";
    expect(html).not.toBe("OLDINDEX");
    expect(html).toContain("&lt;album&gt;");
    expect(html).toContain('src="new.jpg"');
    expect(html).toContain('src="photo-2.jpg"');
    expect(html).not.toContain(`src="${ALBUM_MANIFEST_NAME}"`);
    expect(html).not.toContain("old.jpg");

    const manifest = bucket.rawJson(`sites/album/${ALBUM_MANIFEST_NAME}`) as { files: string[] };
    expect(manifest.files).toEqual(["new.jpg", "photo-2.jpg", "index.html", ALBUM_MANIFEST_NAME]);

    const again = await onRequestPost(
      makeContext(
        post({
          slug: "album",
          album: { files: ["pics/only.png"] },
        }),
        makeEnv(bucket)
      )
    );
    expect(again.status).toBe(404);
    expect(await again.text()).toBe("album file not found");
    expect(bucket.rawText("sites/album/new.jpg")).toBe("NEW");
    expect(bucket.rawText("sites/album/keep.txt")).toBe("KEEP");
    expect(bucket.rawText("sites/album/photo.jpg")).toBe("USER");

    bucket.seed([{ key: "pics/only.png", body: "PNG", contentType: "image/png" }]);
    const second = await onRequestPost(
      makeContext(
        post({ slug: "album", album: { lang: "zh", files: ["pics/only.png"] } }),
        makeEnv(bucket)
      )
    );
    expect(second.status).toBe(200);
    expect(bucket.has("sites/album/new.jpg")).toBe(false);
    expect(bucket.has("sites/album/photo-2.jpg")).toBe(false);
    expect(bucket.rawText("sites/album/only.png")).toBe("PNG");
    expect(bucket.rawText("sites/album/photo.jpg")).toBe("USER");
    expect(bucket.rawText("sites/album/keep.txt")).toBe("KEEP");
    const html2 = bucket.rawText("sites/album/index.html") || "";
    expect(html2).toContain('src="only.png"');
    expect(html2).not.toContain("new.jpg");
    const manifest2 = bucket.rawJson(`sites/album/${ALBUM_MANIFEST_NAME}`) as { files: string[] };
    expect(manifest2.files).toEqual(["only.png", "index.html", ALBUM_MANIFEST_NAME]);
  });

  test("rejects too many images and an oversized total without writing", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "sites/too/keep.txt", body: "KEEP" }]);
    const many = Array.from({ length: 201 }, (_, i) => `missing/${i}.jpg`);
    const countResponse = await onRequestPost(
      makeContext(post({ slug: "too", album: { files: many } }), makeEnv(bucket))
    );
    expect(countResponse.status).toBe(400);
    expect(await countResponse.text()).toMatch(/album image limit exceeded: 201 > 200/);
    expect(bucket.has("sites/too/index.html")).toBe(false);
    expect(bucket.has(`sites/too/${ALBUM_MANIFEST_NAME}`)).toBe(false);
    expect(bucket.rawText("sites/too/keep.txt")).toBe("KEEP");

    bucket.seed([
      { key: "pics/small.jpg", body: "S", contentType: "image/jpeg" },
      {
        key: "pics/big.jpg",
        body: new Uint8Array(ALBUM_MAX_BYTES + 1),
        contentType: "image/jpeg",
      },
    ]);
    const sizeResponse = await onRequestPost(
      makeContext(
        post({ slug: "too", album: { files: ["pics/small.jpg", "pics/big.jpg"] } }),
        makeEnv(bucket)
      )
    );
    expect(sizeResponse.status).toBe(400);
    // small.jpg is 1 byte and is counted before the oversized object, so the
    // refusal names the real total — still nothing is written.
    expect(await sizeResponse.text()).toBe(
      `album size limit exceeded: ${ALBUM_MAX_BYTES + 2} > ${ALBUM_MAX_BYTES}`
    );
    expect(bucket.has("sites/too/index.html")).toBe(false);
    expect(bucket.has("sites/too/small.jpg")).toBe(false);
    expect(bucket.has("sites/too/big.jpg")).toBe(false);
    expect(bucket.has(`sites/too/${ALBUM_MANIFEST_NAME}`)).toBe(false);
    expect(bucket.rawText("sites/too/keep.txt")).toBe("KEEP");
    expect(bucket.rawText("pics/small.jpg")).toBe("S");
  });

  
  test("rejects bad album shapes and feature-off without writing", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "pics/a.jpg", body: "A", contentType: "image/jpeg" }]);
    const bad = await onRequestPost(
      makeContext(post({ slug: "album", album: "nope" }), makeEnv(bucket))
    );
    expect(bad.status).toBe(400);
    expect(await bad.text()).toBe("bad album");

    const badFiles = await onRequestPost(
      makeContext(post({ slug: "album", album: { files: [1, 2] } }), makeEnv(bucket))
    );
    expect(badFiles.status).toBe(400);
    expect(await badFiles.text()).toBe("bad album");

    bucket.seed([
      {
        key: CONFIG_KEY,
        body: JSON.stringify({ ...DEFAULT_FEATURE_FLAGS, sites: false }),
        contentType: "application/json",
      },
    ]);
    const off = await onRequestPost(
      makeContext(
        post({ slug: "album", album: { files: ["pics/a.jpg"] } }),
        makeEnv(bucket)
      )
    );
    expect(off.status).toBe(404);
    expect(bucket.has("sites/album/index.html")).toBe(false);
  });

  test("rejects a selection with no raster images and does not create the site", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "pics/notes.txt", body: "x" }]);
    const response = await onRequestPost(
      makeContext(post({ slug: "album", album: { files: ["pics/notes.txt"] } }), makeEnv(bucket))
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("no album images");
    expect(bucket.has("sites/album/index.html")).toBe(false);
  });
});
