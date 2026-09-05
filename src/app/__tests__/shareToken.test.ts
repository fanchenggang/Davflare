/**
 * functions/share/[[token]].ts + functions/api/shares.ts 分支级直测：
 * 创建/列表/撤销、落地页与 HTML 转义、?download=1 / ?raw=1、安全响应头、
 * 提取码（?code=、表单 POST、cookie）、410 过期、404 撤销、目录分享 zip。
 */
import { ReadableStream } from "stream/web";
// buildZipStream 用到 ReadableStream，jsdom 测试环境没有该全局，补上
(globalThis as any).ReadableStream = (globalThis as any).ReadableStream ?? ReadableStream;

import {
  onRequestGet as shareGet,
  onRequestHead as shareHead,
  onRequestPost as sharePost,
} from "../../../functions/share/[[token]]";
import {
  onRequestDelete as sharesDelete,
  onRequestGet as sharesList,
  onRequestPost as sharesCreate,
} from "../../../functions/api/shares";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const AUTH = basicAuthHeader("user", "pass");
const SHARES_PREFIX = "_$flaredrive$/shares/";
const HOST = "http://drive.example.com";

function makeEnv(bucket: InMemoryBucket, extra: Record<string, unknown> = {}) {
  return { BUCKET: bucket.asBucket(), ...extra };
}

function sharesEnv(bucket: InMemoryBucket) {
  return {
    BUCKET: bucket.asBucket(),
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function seedShare(
  bucket: InMemoryBucket,
  token: string,
  meta: Record<string, unknown>
) {
  bucket.seed([
    {
      key: `${SHARES_PREFIX}${token}.json`,
      body: JSON.stringify(meta),
      contentType: "application/json",
    },
  ]);
}

function seedFileShare(bucket: InMemoryBucket, token = "tok1", key = "docs/report.txt") {
  bucket.seed([{ key, body: "Hello World", contentType: "text/plain" }]);
  seedShare(bucket, token, {
    key,
    name: key.split("/").pop(),
    isDir: false,
    expiresAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
}

function shareRequest(
  token: string | null,
  method = "GET",
  query = "",
  extra: Record<string, string> = {},
  body?: BodyInit
): Request {
  const path = token === null ? "/share/" : `/share/${token}`;
  return new Request(`${HOST}${path}${query}`, {
    method,
    headers: extra,
    body,
  });
}

async function callShareGet(
  bucket: InMemoryBucket,
  token: string | null,
  query = "",
  extra: Record<string, string> = {}
) {
  return shareGet(makeContext(shareRequest(token, "GET", query, extra), makeEnv(bucket), {
    token: token ?? "",
  }));
}

function jsonRequest(
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
  authorized = true
) {
  return new Request(`${HOST}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authorized ? { Authorization: AUTH } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("shares API (POST/GET/DELETE /api/shares)", () => {
  test("requires Basic or API key auth", async () => {
    const bucket = new InMemoryBucket();
    const anonymous = new Request(`${HOST}/api/shares`, { method: "GET" });
    expect((await sharesList(makeContext(anonymous, sharesEnv(bucket)))).status).toBe(401);
    const wrongBasic = new Request(`${HOST}/api/shares`, {
      headers: { Authorization: basicAuthHeader("user", "nope") },
    });
    expect((await sharesList(makeContext(wrongBasic, sharesEnv(bucket)))).status).toBe(401);
    const anonPost = jsonRequest("/api/shares", "POST", { key: "a.txt" }, {}, false);
    expect((await sharesCreate(makeContext(anonPost, sharesEnv(bucket)))).status).toBe(401);
  });

  test("API key (X-Api-Key) is accepted as an alternative to Basic", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    bucket.seed([
      {
        key: "_$flaredrive$/apikeys/record.json",
        body: JSON.stringify({
          id: "rec",
          name: "rec",
          prefix: "fd_",
          keyHash: await sha256Hex("fd_secret_key"),
          createdAt: "2026-01-01T00:00:00.000Z",
          expiresAt: null,
        }),
        contentType: "application/json",
      },
    ]);
    const created = await sharesCreate(
      makeContext(
        jsonRequest("/api/shares", "POST", { key: "a.txt" }, { "X-Api-Key": "fd_secret_key" }),
        sharesEnv(bucket)
      )
    );
    expect(created.status).toBe(200);
    const body = (await created.json()) as { token: string };
    expect(typeof body.token).toBe("string");

    const invalid = await sharesCreate(
      makeContext(
        jsonRequest("/api/shares", "POST", { key: "a.txt" }, { "X-Api-Key": "fd_wrong" }, false),
        sharesEnv(bucket)
      )
    );
    expect(invalid.status).toBe(401);
  });

  test("creates a share for a file without extract code", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "docs/report.txt", body: "R", contentType: "text/plain" }]);
    const response = await sharesCreate(
      makeContext(jsonRequest("/api/shares", "POST", { key: "docs/report.txt" }), sharesEnv(bucket))
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.key).toBe("docs/report.txt");
    expect(body.name).toBe("report.txt");
    expect(body.isDir).toBe(false);
    expect(body.expiresAt).toBeNull();
    expect(body.hasExtractCode).toBe(false);
    expect(body.extractCode).toBeNull();
    expect(typeof body.token).toBe("string");
    expect(body.url).toBe(`${HOST}/share/${body.token}`);
    // 元数据写入内部前缀
    const meta = bucket.rawJson(`${SHARES_PREFIX}${body.token}.json`);
    expect(meta).toMatchObject({ key: "docs/report.txt", isDir: false });
  });

  test("expiresInHours sets expiresAt; extract code echoed when >= 4 chars", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const before = Date.now();
    const response = await sharesCreate(
      makeContext(
        jsonRequest("/api/shares", "POST", {
          key: "a.txt",
          expiresInHours: 24,
          extractCode: "abcd",
        }),
        sharesEnv(bucket)
      )
    );
    const body = (await response.json()) as { expiresAt: string; hasExtractCode: boolean; extractCode: string };
    const ts = Date.parse(body.expiresAt);
    expect(ts).toBeGreaterThan(before + 23 * 60 * 60 * 1000);
    expect(body.hasExtractCode).toBe(true);
    expect(body.extractCode).toBe("abcd");
  });

  test("extract code shorter than 4 chars is rejected", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await sharesCreate(
      makeContext(
        jsonRequest("/api/shares", "POST", { key: "a.txt", extractCode: "abc" }),
        sharesEnv(bucket)
      )
    );
    expect(response.status).toBe(400);
  });

  test("missing key / internal key / invalid JSON are 400", async () => {
    const bucket = new InMemoryBucket();
    const noKey = await sharesCreate(
      makeContext(jsonRequest("/api/shares", "POST", {}), sharesEnv(bucket))
    );
    expect(noKey.status).toBe(400);
    const internal = await sharesCreate(
      makeContext(
        jsonRequest("/api/shares", "POST", { key: "_$flaredrive$/apikeys/x.json" }),
        sharesEnv(bucket)
      )
    );
    expect(internal.status).toBe(400);
    const badJson = new Request(`${HOST}/api/shares`, {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: "{nope",
    });
    expect((await sharesCreate(makeContext(badJson, sharesEnv(bucket)))).status).toBe(400);
  });

  test("unknown key without children is 404", async () => {
    const bucket = new InMemoryBucket();
    const response = await sharesCreate(
      makeContext(jsonRequest("/api/shares", "POST", { key: "ghost.txt" }), sharesEnv(bucket))
    );
    expect(response.status).toBe(404);
  });

  test("directory marker or children-only prefix yields isDir share", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    bucket.seed([{ key: "vdir/inner.txt", body: "I" }]);
    const marked = (await (
      await sharesCreate(
        makeContext(jsonRequest("/api/shares", "POST", { key: "docs" }), sharesEnv(bucket))
      )
    ).json()) as { isDir: boolean };
    expect(marked.isDir).toBe(true);
    const virtual = (await (
      await sharesCreate(
        makeContext(jsonRequest("/api/shares", "POST", { key: "vdir" }), sharesEnv(bucket))
      )
    ).json()) as { isDir: boolean };
    expect(virtual.isDir).toBe(true);
  });

  test("lists shares with url/extractCode/isDir; corrupt entries skipped", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    seedShare(bucket, "tok-a", {
      key: "a.txt",
      name: "a.txt",
      isDir: false,
      expiresAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      extractCode: "abcd",
    });
    bucket.seed([{ key: `${SHARES_PREFIX}broken.json`, body: "{oops" }]);
    const response = await sharesList(
      makeContext(new Request(`${HOST}/api/shares`, { headers: { Authorization: AUTH } }), sharesEnv(bucket))
    );
    expect(response.status).toBe(200);
    const items = (await response.json()) as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ token: "tok-a", key: "a.txt", hasExtractCode: true });
    expect(items[0].extractCode).toBe("abcd");
    expect(items[0].url).toBe(`${HOST}/share/tok-a`);
  });

  test("DELETE removes share metadata; missing token is 400", async () => {
    const bucket = new InMemoryBucket();
    seedShare(bucket, "tok-del", { key: "a.txt" });
    const ok = await sharesDelete(
      makeContext(
        new Request(`${HOST}/api/shares?token=tok-del`, { method: "DELETE", headers: { Authorization: AUTH } }),
        sharesEnv(bucket)
      )
    );
    expect(ok.status).toBe(204);
    expect(bucket.has(`${SHARES_PREFIX}tok-del.json`)).toBe(false);
    const noToken = await sharesDelete(
      makeContext(
        new Request(`${HOST}/api/shares`, { method: "DELETE", headers: { Authorization: AUTH } }),
        sharesEnv(bucket)
      )
    );
    expect(noToken.status).toBe(400);
  });
});

describe("share landing page (GET default)", () => {
  test("renders meta, preview link and download link", async () => {
    const bucket = new InMemoryBucket();
    seedFileShare(bucket);
    const response = await callShareGet(bucket, "tok1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain("<h1>report.txt</h1>");
    expect(html).toContain("11 B");
    expect(html).toContain("2026-01-01 00:00 UTC");
    expect(html).toContain(`href="/share/tok1?download=1"`);
    // text/plain 属于可预览类型：iframe 内嵌 raw 链接
    expect(html).toContain(`src="/share/tok1?raw=1"`);
    expect(html).toContain("<iframe");
  });

  test("escapes hostile filenames in the landing page", async () => {
    const bucket = new InMemoryBucket();
    const evilKey = 'evil/<img src=x onerror=alert(1)> & "quote".txt';
    bucket.seed([{ key: evilKey, body: "X" }]);
    seedShare(bucket, "evil", { key: evilKey, name: evilKey.split("/").pop(), isDir: false });
    const response = await callShareGet(bucket, "evil");
    const html = await response.text();
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;quote&quot;");
  });

  test("landing page localizes to zh with Accept-Language", async () => {
    const bucket = new InMemoryBucket();
    seedFileShare(bucket);
    const response = await callShareGet(bucket, "tok1", "", { "Accept-Language": "zh-CN,zh;q=0.9" });
    const html = await response.text();
    expect(html).toContain("下载");
    expect(html).toContain("文件分享");
  });
});

describe("share raw / download responses", () => {
  test("?download=1 is attachment with hardening headers", async () => {
    const bucket = new InMemoryBucket();
    seedFileShare(bucket);
    const response = await callShareGet(bucket, "tok1", "?download=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("Content-Disposition")).toContain("report.txt");
    expect(await response.text()).toBe("Hello World");
  });

  test("?raw=1 inline for preview-safe type, attachment fallback for binary", async () => {
    const bucket = new InMemoryBucket();
    seedFileShare(bucket, "tok1");
    const inline = await callShareGet(bucket, "tok1", "?raw=1");
    expect(inline.headers.get("Content-Disposition")).toContain("inline");
    expect(inline.headers.get("Content-Security-Policy")).toBe("sandbox");

    const bucket2 = new InMemoryBucket();
    bucket2.seed([{ key: "blob.bin", body: "\x00\x01", contentType: "application/octet-stream" }]);
    seedShare(bucket2, "tok2", {
      key: "blob.bin",
      name: "blob.bin",
      isDir: false,
      expiresAt: null,
      createdAt: null,
    });
    const binary = await callShareGet(bucket2, "tok2", "?raw=1");
    expect(binary.headers.get("Content-Disposition")).toContain("attachment");
  });

  test("?raw=1 supports Range with 206 + Content-Range", async () => {
    const bucket = new InMemoryBucket();
    seedFileShare(bucket);
    const response = await callShareGet(bucket, "tok1", "?raw=1", { Range: "bytes=0-4" });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-4/11");
    expect(response.headers.get("Content-Length")).toBe("5");
    expect(await response.text()).toBe("Hello");
  });

  test("missing backing object is 404 for landing and raw", async () => {
    const bucket = new InMemoryBucket();
    seedShare(bucket, "tok1", { key: "gone.txt", name: "gone.txt", isDir: false });
    const landing = await callShareGet(bucket, "tok1");
    expect(landing.status).toBe(404);
    const raw = await callShareGet(bucket, "tok1", "?raw=1");
    expect(raw.status).toBe(404);
  });
});

describe("share extract code gate", () => {
  function seedGatedShare(bucket: InMemoryBucket, token = "gate", code = "abcd") {
    bucket.seed([{ key: "secret.txt", body: "SECRET", contentType: "text/plain" }]);
    seedShare(bucket, token, {
      key: "secret.txt",
      name: "secret.txt",
      isDir: false,
      expiresAt: null,
      createdAt: null,
      extractCode: code,
    });
  }

  test("no code shows the extract form without an error message", async () => {
    const bucket = new InMemoryBucket();
    seedGatedShare(bucket);
    const response = await callShareGet(bucket, "gate");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Extract file");
    expect(html).toContain('name="code"');
    expect(html).not.toContain("Incorrect");
  });

  test("wrong ?code= is 403 with error; correct ?code= grants content", async () => {
    const bucket = new InMemoryBucket();
    seedGatedShare(bucket);
    const wrong = await callShareGet(bucket, "gate", "?code=zzzz");
    expect(wrong.status).toBe(403);
    expect(await wrong.text()).toContain("Incorrect extract code");
    const right = await callShareGet(bucket, "gate", "?code=abcd");
    expect(right.status).toBe(200);
    expect(await right.text()).toContain("secret.txt");
    const raw = await callShareGet(bucket, "gate", "?code=abcd&raw=1");
    expect(await raw.text()).toBe("SECRET");
  });

  test("cookie with the code hash grants access", async () => {
    const bucket = new InMemoryBucket();
    seedGatedShare(bucket);
    const cookie = `fd_share_code=${await sha256Hex("abcd")}`;
    const response = await callShareGet(bucket, "gate", "", { Cookie: cookie });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("secret.txt");
    const raw = await callShareGet(bucket, "gate", "?raw=1", { Cookie: cookie });
    expect(await raw.text()).toBe("SECRET");
  });

  test("POST correct code seeds cookie and 303s to clean URL", async () => {
    const bucket = new InMemoryBucket();
    seedGatedShare(bucket);
    const response = await sharePost(
      makeContext(
        shareRequest("gate", "POST", "", {
          "Content-Type": "application/x-www-form-urlencoded",
        }, "code=abcd"),
        makeEnv(bucket),
        { token: "gate" }
      )
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/share/gate");
    const setCookie = response.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain(`fd_share_code=${await sha256Hex("abcd")}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/share/gate");
  });

  test("POST without code shows form; wrong code is 403", async () => {
    const bucket = new InMemoryBucket();
    seedGatedShare(bucket);
    const empty = await sharePost(
      makeContext(
        shareRequest("gate", "POST", "", {
          "Content-Type": "application/x-www-form-urlencoded",
        }, "code="),
        makeEnv(bucket),
        { token: "gate" }
      )
    );
    expect(empty.status).toBe(200);
    const wrong = await sharePost(
      makeContext(
        shareRequest("gate", "POST", "", {
          "Content-Type": "application/x-www-form-urlencoded",
        }, "code=zzzz"),
        makeEnv(bucket),
        { token: "gate" }
      )
    );
    expect(wrong.status).toBe(403);
    expect(await wrong.text()).toContain("Incorrect extract code");
  });

  test("share without extract code POST just 303s to the landing page", async () => {
    const bucket = new InMemoryBucket();
    seedFileShare(bucket, "open");
    const response = await sharePost(
      makeContext(shareRequest("open", "POST"), makeEnv(bucket), { token: "open" })
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/share/open");
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  test("HEAD gated without code is 403; with code mirrors GET", async () => {
    const bucket = new InMemoryBucket();
    seedGatedShare(bucket);
    const gated = await shareHead(
      makeContext(shareRequest("gate", "HEAD"), makeEnv(bucket), { token: "gate" })
    );
    expect(gated.status).toBe(403);
    const granted = await shareHead(
      makeContext(
        shareRequest("gate", "HEAD", "?download=1", { Cookie: `fd_share_code=${await sha256Hex("abcd")}` }),
        makeEnv(bucket),
        { token: "gate" }
      )
    );
    expect(granted.status).toBe(200);
    expect(granted.headers.get("Content-Type")).toBe("text/plain");
    const landing = await shareHead(
      makeContext(
        shareRequest("gate", "HEAD", "", { Cookie: `fd_share_code=${await sha256Hex("abcd")}` }),
        makeEnv(bucket),
        { token: "gate" }
      )
    );
    expect(landing.status).toBe(200);
    expect(landing.headers.get("Content-Type")).toContain("text/html");
    expect(await landing.text()).toBe("");
  });
});

describe("share expiry / revocation / guards", () => {
  test("expired share is 410 on GET and HEAD", async () => {
    const bucket = new InMemoryBucket();
    seedFileShare(bucket, "expired");
    seedShare(bucket, "expired", {
      key: "docs/report.txt",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    const get = await callShareGet(bucket, "expired");
    expect(get.status).toBe(410);
    const head = await shareHead(
      makeContext(shareRequest("expired", "HEAD"), makeEnv(bucket), { token: "expired" })
    );
    expect(head.status).toBe(410);
  });

  test("revoked (missing) share is 404", async () => {
    const bucket = new InMemoryBucket();
    const response = await callShareGet(bucket, "ghost");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("不存在");
  });

  test("metadata pointing at internal keys is rejected defensively", async () => {
    const bucket = new InMemoryBucket();
    seedShare(bucket, "internal", { key: "_$flaredrive$/apikeys/x.json" });
    const response = await callShareGet(bucket, "internal");
    expect(response.status).toBe(404);
  });

  test("metadata without a key is 404; missing token param is 404", async () => {
    const bucket = new InMemoryBucket();
    seedShare(bucket, "nokey", { name: "x" });
    expect((await callShareGet(bucket, "nokey")).status).toBe(404);
    expect((await callShareGet(bucket, null)).status).toBe(404);
    expect(
      (
        await sharePost(makeContext(shareRequest(null, "POST"), makeEnv(bucket), { token: "" }))
      ).status
    ).toBe(404);
  });

  test("future expiry stays shareable", async () => {
    const bucket = new InMemoryBucket();
    seedFileShare(bucket, "future");
    seedShare(bucket, "future", {
      key: "docs/report.txt",
      expiresAt: "2099-01-01T00:00:00.000Z",
      createdAt: null,
    });
    expect((await callShareGet(bucket, "future")).status).toBe(200);
  });
});

describe("share directory (zip download)", () => {
  function seedDirShare(bucket: InMemoryBucket, token = "dir") {
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/a.txt", body: "A" }, { key: "docs/sub/b.txt", body: "B" }]);
    seedShare(bucket, token, {
      key: "docs",
      name: "docs",
      isDir: true,
      expiresAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  }

  test("default GET is the landing page with folder badge", async () => {
    const bucket = new InMemoryBucket();
    seedDirShare(bucket);
    const response = await callShareGet(bucket, "dir");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Folder (zip download)");
    expect(html).not.toContain("<iframe");
  });

  test("?download=1 streams a zip with attachment + hardening headers", async () => {
    const bucket = new InMemoryBucket();
    seedDirShare(bucket);
    const response = await callShareGet(bucket, "dir", "?download=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("Content-Disposition")).toContain(".zip");
  });

  test("?raw=1 on a directory also zips; HEAD reports zip type", async () => {
    const bucket = new InMemoryBucket();
    seedDirShare(bucket);
    const raw = await callShareGet(bucket, "dir", "?raw=1");
    expect(raw.headers.get("Content-Type")).toBe("application/zip");
    const head = await shareHead(
      makeContext(shareRequest("dir", "HEAD", "?download=1"), makeEnv(bucket), { token: "dir" })
    );
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Type")).toBe("application/zip");
  });
});
