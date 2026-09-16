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
    expect(await response.json()).toEqual({ slug: "blog", spa: true });
  });
});
