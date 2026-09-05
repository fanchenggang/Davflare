/**
 * functions/api/upload.ts 分支级直测：单发上传（raw body 路径）、重名/覆盖、
 * 413/400/401 分支、目录 marker 自动补建、三段式分块上传
 * （create → part → complete，乱序/缺块/etag 校验、abort 清理）。
 *
 * 说明：multipart/form-data 分支（request.formData()）在 whatwg-fetch 测试
 * 环境无法解析 multipart 请求体，属于环境限制，由 e2e 覆盖。
 */
import {
  onRequestDelete,
  onRequestPost,
  onRequestPut,
} from "../../../functions/api/upload";
import { InMemoryBucket, makeContext } from "../testInMemoryBucket";

const HOST = "http://drive.example.com";
const API_KEY = "fd_test_key_1234567890";
const KEYS_PREFIX = "_$flaredrive$/apikeys/";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function makeEnv(bucket: InMemoryBucket) {
  return { BUCKET: bucket.asBucket() };
}

function authed(
  path: string,
  method: string,
  body?: unknown,
  extra: Record<string, string> = {}
) {
  const isRaw =
    typeof body === "string" ||
    body === undefined ||
    body instanceof Uint8Array ||
    body instanceof Blob;
  return new Request(`${HOST}${path}`, {
    method,
    headers: { "X-Api-Key": API_KEY, ...extra },
    body: isRaw ? (body as BodyInit | undefined) : JSON.stringify(body),
  });
}

function withRawBody(request: Request, bytes: Uint8Array): Request {
  // whatwg-fetch 的 Request 没有 body getter；分块 PUT 依赖 request.body 存在
  Object.defineProperty(request, "body", { value: bytes });
  return request;
}

async function seedApiKey(bucket: InMemoryBucket, expiresAt: string | null = null) {
  bucket.seed([
    {
      key: `${KEYS_PREFIX}testrecord.json`,
      body: JSON.stringify({
        id: "testrecord",
        name: "test",
        prefix: "fd_",
        keyHash: await sha256Hex(API_KEY),
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt,
      }),
      contentType: "application/json",
    },
  ]);
}

function newBucket(): InMemoryBucket {
  return new InMemoryBucket();
}

describe("upload auth", () => {
  test("missing / invalid / disabled API key is 401", async () => {
    const anonymous = new Request(`${HOST}/api/upload`, { method: "POST" });
    const anonymousResponse = await onRequestPost(
      makeContext(anonymous, makeEnv(newBucket()))
    );
    expect(anonymousResponse.status).toBe(401);
    expect(await anonymousResponse.text()).toBe("缺少 API 密钥");

    const invalid = await onRequestPost(
      makeContext(
        new Request(`${HOST}/api/upload`, {
          method: "POST",
          headers: { "X-Api-Key": "fd_wrong" },
        }),
        makeEnv(newBucket())
      )
    );
    expect(invalid.status).toBe(401);
    expect(await invalid.text()).toBe("无效的 API 密钥");

    const bucket = newBucket();
    await seedApiKey(bucket);
    bucket.seed([
      {
        key: "_$flaredrive$/config.json",
        body: JSON.stringify({ apiKey: false }),
        contentType: "application/json",
      },
    ]);
    const disabled = await onRequestPost(
      makeContext(authed("/api/upload", "POST"), makeEnv(bucket))
    );
    expect(disabled.status).toBe(401);
    expect(await disabled.text()).toBe("API 密钥已关闭");
  });

  test("expired API key is 401", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket, "2020-01-01T00:00:00.000Z");
    const response = await onRequestPost(
      makeContext(authed("/api/upload", "POST"), makeEnv(bucket))
    );
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("API 密钥已过期");
  });
});

describe("single-shot upload (POST /api/upload)", () => {
  test("raw body upload stores the object and touches lastUsed", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const response = await onRequestPost(
      makeContext(
        authed("/api/upload?path=docs", "POST", "file-content", {
          "X-File-Name": "notes.txt",
          "Content-Type": "text/plain",
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      key: "docs/notes.txt",
      name: "notes.txt",
      size: 12,
      path: "docs/",
      overwritten: false,
    });
    expect(bucket.rawText("docs/notes.txt")).toBe("file-content");
    const stored = await bucket.asBucket().head("docs/notes.txt");
    expect(stored?.httpMetadata?.contentType).toBe("text/plain");
    // 上传过程自动补齐目录 marker
    const marker = await bucket.asBucket().head("docs");
    expect(marker?.httpMetadata?.contentType).toBe("application/x-directory");
    // lastUsed 写回 API key 记录
    const record = bucket.rawJson<{ lastUsedAt?: string }>(`${KEYS_PREFIX}testrecord.json`);
    expect(typeof record?.lastUsedAt).toBe("string");
  });

  test("duplicate names are de-duplicated as 'name (2).ext'", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "a.txt", body: "1" }, { key: "a (2).txt", body: "2" }]);
    const response = await onRequestPost(
      makeContext(
        authed("/api/upload", "POST", "3", { "X-File-Name": "a.txt" }),
        makeEnv(bucket)
      )
    );
    const body = (await response.json()) as { name: string; key: string };
    expect(body.name).toBe("a (3).txt");
    expect(bucket.rawText("a (3).txt")).toBe("3");
    expect(bucket.rawText("a.txt")).toBe("1");
  });

  test("overwrite=1 replaces an existing file and reports overwritten", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "docs/a.txt", body: "old" }]);
    const response = await onRequestPost(
      makeContext(
        authed("/api/upload?path=docs&overwrite=1", "POST", "new", { "X-File-Name": "a.txt" }),
        makeEnv(bucket)
      )
    );
    const body = (await response.json()) as { overwritten: boolean };
    expect(body.overwritten).toBe(true);
    expect(bucket.rawText("docs/a.txt")).toBe("new");
  });

  test("overwrite=1 against a directory marker is 409", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    bucket.seedDir("docs/folder");
    const response = await onRequestPost(
      makeContext(
        authed("/api/upload?path=docs&overwrite=1", "POST", "x", { "X-File-Name": "folder" }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("目标已存在且为目录，无法覆盖");
  });

  test("overwrite=1 against a virtual directory (children only) is 409", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "docs/vdir/inner.txt", body: "I" }]);
    const response = await onRequestPost(
      makeContext(
        authed("/api/upload?path=docs&overwrite=1", "POST", "x", { "X-File-Name": "vdir" }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(409);
    expect(bucket.rawText("docs/vdir/inner.txt")).toBe("I");
  });

  test("Content-Length over the 100MB cap is 413", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const response = await onRequestPost(
      makeContext(
        authed("/api/upload", "POST", "x", {
          "X-File-Name": "big.bin",
          "Content-Length": String(100 * 1024 * 1024),
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(413);
  });

  test("empty body, missing X-File-Name are 400", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const empty = await onRequestPost(
      makeContext(
        authed("/api/upload", "POST", "", { "X-File-Name": "a.txt" }),
        makeEnv(bucket)
      )
    );
    expect(empty.status).toBe(400);
    expect(await empty.text()).toBe("文件内容为空");
    const noName = await onRequestPost(
      makeContext(authed("/api/upload", "POST", "x"), makeEnv(bucket))
    );
    expect(noName.status).toBe(400);
    expect(await noName.text()).toBe("原始请求体上传需要提供 X-File-Name 头");
  });

  test("path traversal and internal prefix paths are rejected", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const traversal = await onRequestPost(
      makeContext(
        authed("/api/upload?path=..%2Fescape", "POST", "x", { "X-File-Name": "a.txt" }),
        makeEnv(bucket)
      )
    );
    expect(traversal.status).toBe(400);
    expect(await traversal.text()).toBe("路径不合法");
    const internal = await onRequestPost(
      makeContext(
        authed("/api/upload?path=_$flaredrive$/trash", "POST", "x", { "X-File-Name": "a.txt" }),
        makeEnv(bucket)
      )
    );
    expect(internal.status).toBe(400);
    expect(await internal.text()).toBe("禁止写入内部目录");
    expect(bucket.rawBytes("escape/a.txt")).toBeUndefined();
  });

  test("file name is sanitized (backslash basename, control chars stripped)", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const response = await onRequestPost(
      makeContext(
        authed("/api/upload", "POST", "x", {
          "X-File-Name": "dir\\na\tme .txt",
        }),
        makeEnv(bucket)
      )
    );
    const body = (await response.json()) as { name: string };
    expect(body.name).toBe("name .txt");
  });
});

describe("multipart upload (uploads / part / complete / abort)", () => {
  test("POST ?uploads creates the upload and folder markers", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const response = await onRequestPost(
      makeContext(
        authed("/api/upload?uploads&path=docs%2Fbig.bin", "POST"),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { key: string; uploadId: string };
    expect(body.key).toBe("docs/big.bin");
    expect(typeof body.uploadId).toBe("string");
    const marker = await bucket.asBucket().head("docs");
    expect(marker?.httpMetadata?.contentType).toBe("application/x-directory");
  });

  test("POST ?uploads validates path (traversal / internal / empty)", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const traversal = await onRequestPost(
      makeContext(
        authed("/api/upload?uploads&path=..%2Fbig.bin", "POST"),
        makeEnv(bucket)
      )
    );
    expect(traversal.status).toBe(400);
    const internal = await onRequestPost(
      makeContext(
        authed("/api/upload?uploads&path=_$flaredrive$/evil.bin", "POST"),
        makeEnv(bucket)
      )
    );
    expect(internal.status).toBe(400);
    expect(await internal.text()).toBe("禁止写入内部目录");
    const missing = await onRequestPost(
      makeContext(authed("/api/upload?uploads", "POST"), makeEnv(bucket))
    );
    expect(missing.status).toBe(400);
  });

  async function startUpload(bucket: InMemoryBucket, path = "big.bin"): Promise<string> {
    const response = await onRequestPost(
      makeContext(
        authed(`/api/upload?uploads&path=${encodeURIComponent(path)}`, "POST"),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(201);
    return ((await response.json()) as { uploadId: string }).uploadId;
  }

  async function uploadPart(
    bucket: InMemoryBucket,
    uploadId: string,
    partNumber: number,
    content: string
  ) {
    return onRequestPut(
      makeContext(
        withRawBody(
          authed(
            `/api/upload?path=${encodeURIComponent("big.bin")}&uploadId=${uploadId}&partNumber=${partNumber}`,
            "PUT"
          ),
          new TextEncoder().encode(content)
        ),
        makeEnv(bucket)
      )
    );
  }

  test("full three-step flow assembles the object in order", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const uploadId = await startUpload(bucket);

    const part1 = await uploadPart(bucket, uploadId, 1, "hello-");
    expect(part1.status).toBe(200);
    const part1Body = (await part1.json()) as { partNumber: number; etag: string };
    expect(part1Body.partNumber).toBe(1);

    const part2 = await uploadPart(bucket, uploadId, 2, "world");
    const part2Body = (await part2.json()) as { etag: string };

    const complete = await onRequestPost(
      makeContext(
        authed(`/api/upload?path=${encodeURIComponent("big.bin")}&uploadId=${uploadId}`, "POST", {
          parts: [
            { partNumber: 1, etag: part1Body.etag },
            { partNumber: 2, etag: part2Body.etag },
          ],
        }),
        makeEnv(bucket)
      )
    );
    expect(complete.status).toBe(200);
    const doneBody = (await complete.json()) as { key: string; size: number; etag: string };
    expect(doneBody.key).toBe("big.bin");
    expect(doneBody.size).toBe(11);
    expect(doneBody.etag).toMatch(/^"/);
    expect(bucket.rawText("big.bin")).toBe("hello-world");
  });

  test("out-of-order partNumbers in complete are rejected with 400", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const uploadId = await startUpload(bucket);
    await uploadPart(bucket, uploadId, 1, "a");
    await uploadPart(bucket, uploadId, 2, "b");
    const response = await onRequestPost(
      makeContext(
        authed(`/api/upload?path=big.bin&uploadId=${uploadId}`, "POST", {
          parts: [
            { partNumber: 2, etag: "e2" },
            { partNumber: 1, etag: "e1" },
          ],
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("parts 参数不合法");
  });

  test("missing part in complete fails with the R2 error message", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const uploadId = await startUpload(bucket);
    const part1 = (await (await uploadPart(bucket, uploadId, 1, "a")).json()) as { etag: string };
    const response = await onRequestPost(
      makeContext(
        authed(`/api/upload?path=big.bin&uploadId=${uploadId}`, "POST", {
          parts: [
            { partNumber: 1, etag: part1.etag },
            { partNumber: 2, etag: "never-uploaded" },
          ],
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("part 2");
    expect(bucket.has("big.bin")).toBe(false);
  });

  test("complete validates parts: empty / duplicate / out-of-range / missing etag / bad json", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const uploadId = await startUpload(bucket);
    const cases: unknown[] = [
      { parts: [] },
      { parts: [{ partNumber: 1, etag: "e" }, { partNumber: 1, etag: "e" }] },
      { parts: [{ partNumber: 0, etag: "e" }] },
      { parts: [{ partNumber: 10001, etag: "e" }] },
      { parts: [{ partNumber: 1.5, etag: "e" }] },
      { parts: [{ partNumber: 1, etag: "" }] },
      { noParts: true },
    ];
    for (const payload of cases) {
      const response = await onRequestPost(
        makeContext(
          authed(`/api/upload?path=big.bin&uploadId=${uploadId}`, "POST", payload),
          makeEnv(bucket)
        )
      );
      expect(response.status).toBe(400);
    }
    const badJson = new Request(`${HOST}/api/upload?path=big.bin&uploadId=${uploadId}`, {
      method: "POST",
      headers: { "X-Api-Key": API_KEY },
      body: "{nope",
    });
    expect((await onRequestPost(makeContext(badJson, makeEnv(bucket)))).status).toBe(400);
  });

  test("PUT part validates uploadId / partNumber / body", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const noUploadId = await onRequestPut(
      makeContext(
        withRawBody(authed("/api/upload?path=big.bin&partNumber=1", "PUT"), new TextEncoder().encode("x")),
        makeEnv(bucket)
      )
    );
    expect(noUploadId.status).toBe(400);
    expect(await noUploadId.text()).toBe("缺少 uploadId");
    const badPart = await onRequestPut(
      makeContext(
        withRawBody(authed("/api/upload?path=big.bin&uploadId=u&partNumber=0", "PUT"), new TextEncoder().encode("x")),
        makeEnv(bucket)
      )
    );
    expect(badPart.status).toBe(400);
    const bigPart = await onRequestPut(
      makeContext(
        withRawBody(authed("/api/upload?path=big.bin&uploadId=u&partNumber=10001", "PUT"), new TextEncoder().encode("x")),
        makeEnv(bucket)
      )
    );
    expect(bigPart.status).toBe(400);
    const noBody = await onRequestPut(
      makeContext(
        authed("/api/upload?path=big.bin&uploadId=u&partNumber=1", "PUT"),
        makeEnv(bucket)
      )
    );
    expect(noBody.status).toBe(400);
    expect(await noBody.text()).toBe("缺少分块内容");
    const unknownId = await uploadPart(bucket, "unknown-upload", 1, "x");
    expect(unknownId.status).toBe(400);
  });

  test("abort discards the upload; unknown uploadId abort is idempotent", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const uploadId = await startUpload(bucket);
    await uploadPart(bucket, uploadId, 1, "chunk");
    const aborted = await onRequestDelete(
      makeContext(
        authed(`/api/upload?path=${encodeURIComponent("big.bin")}&uploadId=${uploadId}`, "DELETE"),
        makeEnv(bucket)
      )
    );
    expect(aborted.status).toBe(204);
    // abort 后分块上传不可再用
    const afterAbort = await uploadPart(bucket, uploadId, 2, "more");
    expect(afterAbort.status).toBe(400);
    expect(bucket.has("big.bin")).toBe(false);
    // 未知 uploadId 幂等 204
    const unknown = await onRequestDelete(
      makeContext(
        authed("/api/upload?path=big.bin&uploadId=never-existed", "DELETE"),
        makeEnv(bucket)
      )
    );
    expect(unknown.status).toBe(204);
  });

  test("missing uploadId on DELETE is 400", async () => {
    const bucket = newBucket();
    await seedApiKey(bucket);
    const response = await onRequestDelete(
      makeContext(authed("/api/upload?path=big.bin", "DELETE"), makeEnv(bucket))
    );
    expect(response.status).toBe(400);
  });
});
