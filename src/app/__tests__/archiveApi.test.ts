/**
 * functions/api/archive.ts：会话 Basic + API Key 鉴权、GET ?path= 目录 zip、
 * POST multi-select、内部前缀拒绝、404。
 */
import { ReadableStream } from "stream/web";
(globalThis as any).ReadableStream =
  (globalThis as any).ReadableStream ?? ReadableStream;

import {
  onRequestGet,
  onRequestPost,
} from "../../../functions/api/archive";
import {
  InMemoryBucket,
  basicAuthHeader,
  makeContext,
} from "../testInMemoryBucket";

const HOST = "http://drive.example.com";
const AUTH = basicAuthHeader("user", "pass");
const API_KEY = "fd_archive_test_key";
const KEYS_PREFIX = "_$flaredrive$/apikeys/";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function makeEnv(bucket: InMemoryBucket) {
  return {
    BUCKET: bucket.asBucket(),
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
  };
}

async function seedApiKey(bucket: InMemoryBucket) {
  bucket.seed([
    {
      key: `${KEYS_PREFIX}archive.json`,
      body: JSON.stringify({
        id: "archive",
        name: "archive",
        prefix: "fd_",
        keyHash: await sha256Hex(API_KEY),
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: null,
      }),
      contentType: "application/json",
    },
  ]);
}

function seedFolder(bucket: InMemoryBucket) {
  bucket.seed([
    {
      key: "docs",
      body: "",
      contentType: "application/x-directory",
    },
    { key: "docs/a.txt", body: "AAA", contentType: "text/plain" },
    { key: "docs/sub/b.txt", body: "BBB", contentType: "text/plain" },
  ]);
}

describe("archive auth", () => {
  test("anonymous GET/POST are 401", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket);
    const get = await onRequestGet(
      makeContext(
        new Request(`${HOST}/api/archive?path=docs`),
        makeEnv(bucket)
      )
    );
    expect(get.status).toBe(401);

    const post = await onRequestPost(
      makeContext(
        new Request(`${HOST}/api/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: ["docs"] }),
        }),
        makeEnv(bucket)
      )
    );
    expect(post.status).toBe(401);
  });

  test("Basic session POST still works (web UI)", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket);
    const response = await onRequestPost(
      makeContext(
        new Request(`${HOST}/api/archive`, {
          method: "POST",
          headers: {
            Authorization: AUTH,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ keys: ["docs"] }),
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  test("API key GET ?path= streams zip", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket);
    await seedApiKey(bucket);
    const response = await onRequestGet(
      makeContext(
        new Request(`${HOST}/api/archive?path=docs`, {
          headers: { "X-Api-Key": API_KEY },
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toContain("docs.zip");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);
    // ZIP local file header magic
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  test("Bearer API key POST multi-select works", async () => {
    const bucket = new InMemoryBucket();
    seedFolder(bucket);
    await seedApiKey(bucket);
    const response = await onRequestPost(
      makeContext(
        new Request(`${HOST}/api/archive`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ keys: ["docs/a.txt", "docs/sub/"] }),
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
  });
});

describe("archive validation", () => {
  test("rejects internal _$flaredrive$/ keys", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    const get = await onRequestGet(
      makeContext(
        new Request(`${HOST}/api/archive?path=_$flaredrive$/shares/x`, {
          headers: { "X-Api-Key": API_KEY },
        }),
        makeEnv(bucket)
      )
    );
    expect(get.status).toBe(400);
    expect(await get.text()).toContain("内部");

    const post = await onRequestPost(
      makeContext(
        new Request(`${HOST}/api/archive`, {
          method: "POST",
          headers: {
            "X-Api-Key": API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ keys: ["_$flaredrive$/trash/x"] }),
        }),
        makeEnv(bucket)
      )
    );
    expect(post.status).toBe(400);
  });

  test("missing path / empty keys / unknown path", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);

    const missingPath = await onRequestGet(
      makeContext(
        new Request(`${HOST}/api/archive`, {
          headers: { "X-Api-Key": API_KEY },
        }),
        makeEnv(bucket)
      )
    );
    expect(missingPath.status).toBe(400);

    const emptyKeys = await onRequestPost(
      makeContext(
        new Request(`${HOST}/api/archive`, {
          method: "POST",
          headers: {
            "X-Api-Key": API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ keys: [] }),
        }),
        makeEnv(bucket)
      )
    );
    expect(emptyKeys.status).toBe(400);

    const missing = await onRequestGet(
      makeContext(
        new Request(`${HOST}/api/archive?path=no-such-folder`, {
          headers: { "X-Api-Key": API_KEY },
        }),
        makeEnv(bucket)
      )
    );
    expect(missing.status).toBe(404);
  });

  test("single file path zips as application/zip", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "solo.txt", body: "solo", contentType: "text/plain" }]);
    await seedApiKey(bucket);
    const response = await onRequestGet(
      makeContext(
        new Request(`${HOST}/api/archive?path=solo.txt`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toContain("solo.txt.zip");
  });
});
