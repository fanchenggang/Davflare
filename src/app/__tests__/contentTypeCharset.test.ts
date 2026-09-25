/**
 * 文本响应 charset 修复回归：存储的 Content-Type 缺 charset 时，
 * 分享 GET/HEAD、api/download、WebDAV GET 都必须补 "; charset=utf-8"，
 * 否则浏览器（分享预览 iframe / 直链）按 Windows-1252 解码 UTF-8 中文乱码。
 */
import { describe, expect, test } from "vitest";

import { withUtf8Charset } from "../../../functions/_contentType";
import { onRequestGet as shareOnGet, onRequestHead as shareOnHead } from "../../../functions/share/[[token]]";
import { onRequestGet as downloadOnGet } from "../../../functions/api/download";
import { onRequest as webdavOnRequest } from "../../../functions/webdav/protocol";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const HOST = "http://drive.example.com";
const API_KEY = "fd_test_key_1234567890";
const KEYS_PREFIX = "_$flaredrive$/apikeys/";
const SHARES_PREFIX = "_$flaredrive$/shares/";
const FILE_KEY = "docs/中文说明.txt";
const CJK_BODY = "Hello from QA round 2 — 测试内容 123";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function makeEnv(bucket: InMemoryBucket, extra: Record<string, unknown> = {}) {
  return {
    BUCKET: bucket.asBucket(),
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
    ...extra,
  };
}

async function seedApiKey(bucket: InMemoryBucket) {
  bucket.seed([
    {
      key: `${KEYS_PREFIX}testrecord.json`,
      body: JSON.stringify({
        id: "testrecord",
        name: "test",
        prefix: "fd_",
        keyHash: await sha256Hex(API_KEY),
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: null,
      }),
      contentType: "application/json",
    },
  ]);
}

/** 端到端种子：文本对象（无 charset）+ 对应分享元数据。 */
async function seedSharedTextFile(bucket: InMemoryBucket, token: string) {
  bucket.seed([
    {
      key: FILE_KEY,
      body: CJK_BODY,
      contentType: "text/plain",
    },
    {
      key: `${SHARES_PREFIX}${token}.json`,
      body: JSON.stringify({
        token,
        key: FILE_KEY,
        name: "中文说明.txt",
        createdAt: "2026-09-25T00:00:00.000Z",
        expiresAt: null,
        extractCode: null,
      }),
      contentType: "application/json",
    },
  ]);
}

describe("withUtf8Charset", () => {
  test("text/* 缺 charset 补 utf-8", () => {
    expect(withUtf8Charset("text/plain")).toBe("text/plain; charset=utf-8");
    expect(withUtf8Charset("text/markdown")).toBe("text/markdown; charset=utf-8");
  });

  test("已声明 charset / 非 text / 空值 原样返回", () => {
    expect(withUtf8Charset("text/html; charset=gbk")).toBe("text/html; charset=gbk");
    expect(withUtf8Charset("Text/Plain; CharSet=utf-8")).toBe("Text/Plain; CharSet=utf-8");
    expect(withUtf8Charset("image/png")).toBe("image/png");
    expect(withUtf8Charset("application/json")).toBe("application/json");
    expect(withUtf8Charset("")).toBe("");
  });
});

describe("share GET/HEAD 文本响应补 charset", () => {
  test("GET ?raw=1 内联预览带 charset", async () => {
    const token = "tokraw1";
    const bucket = new InMemoryBucket();
    await seedSharedTextFile(bucket, token);
    const request = new Request(`${HOST}/share/${token}?raw=1`);
    const response = await shareOnGet(makeContext(request, { BUCKET: bucket.asBucket() }, { token }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
  });

  test("GET ?download=1 附件直链带 charset", async () => {
    const token = "tokdl1";
    const bucket = new InMemoryBucket();
    await seedSharedTextFile(bucket, token);
    const request = new Request(`${HOST}/share/${token}?download=1`);
    const response = await shareOnGet(makeContext(request, { BUCKET: bucket.asBucket() }, { token }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
  });

  test("HEAD 文件元数据带 charset", async () => {
    const token = "tokhd1";
    const bucket = new InMemoryBucket();
    await seedSharedTextFile(bucket, token);
    const request = new Request(`${HOST}/share/${token}?download=1`, { method: "HEAD" });
    const response = await shareOnHead(makeContext(request, { BUCKET: bucket.asBucket() }, { token }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
  });

  test("非文本类型不受影响", async () => {
    const token = "tokpng";
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "pic.png", body: "png", contentType: "image/png" },
      {
        key: `${SHARES_PREFIX}${token}.json`,
        body: JSON.stringify({ token, key: "pic.png", name: "pic.png", createdAt: "2026-09-25T00:00:00.000Z" }),
        contentType: "application/json",
      },
    ]);
    const request = new Request(`${HOST}/share/${token}?raw=1`);
    const response = await shareOnGet(makeContext(request, { BUCKET: bucket.asBucket() }, { token }));
    expect(response.headers.get("Content-Type")).toBe("image/png");
  });
});

describe("api/download 文本响应补 charset", () => {
  test("中文文本文件下载 Content-Type 带 charset", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    await seedSharedTextFile(bucket, "unused");
    const request = new Request(`${HOST}/api/download?path=${encodeURIComponent(FILE_KEY)}`, {
      headers: { "X-Api-Key": API_KEY },
    });
    const response = await downloadOnGet(
      makeContext(request, makeEnv(bucket))
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
  });
});

describe("WebDAV GET 文本响应补 charset", () => {
  test("直链文本 Content-Type 带 charset", async () => {
    const bucket = new InMemoryBucket();
    await seedSharedTextFile(bucket, "unused");
    const request = new Request(`${HOST}/webdav/${FILE_KEY}`, {
      method: "GET",
      headers: { Authorization: basicAuthHeader("user", "pass") },
    });
    const response = await webdavOnRequest({
      request,
      env: makeEnv(bucket),
      params: { path: FILE_KEY },
      data: {},
      next: async () => new Response("Not Found", { status: 404 }),
      waitUntil: () => {},
      passThroughOnException: () => {},
    } as unknown as Parameters<typeof webdavOnRequest>[0]);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    await expect(response.text()).resolves.toBe(CJK_BODY);
  });
});
