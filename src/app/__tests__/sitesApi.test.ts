/**
 * functions/api/sites.ts — publish (source) + SPA config branches.
 */
import { onRequestPost } from "../../../functions/api/sites";
import { CONFIG_KEY, DEFAULT_FEATURE_FLAGS } from "../../../functions/_flags";
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
