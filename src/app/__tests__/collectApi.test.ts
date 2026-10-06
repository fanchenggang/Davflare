/**
 * 文件收集链接（functions/_collect*.ts、functions/collect/[[token]].ts、functions/api/collects.ts）直测：
 * 令牌隔离、过期、停用、限额（create 与 complete 两处）、同名不覆盖、路径穿越、
 * 他人 uploadId、超大分块、CAS 冲突、内容类型降级、页面安全头。
 */
import { onRequest as collectRoute } from "../../../functions/collect/[[token]]";
import { onRequestGet as shareGet } from "../../../functions/share/[[token]]";
import {
  onRequestDelete as collectsDelete,
  onRequestGet as collectsList,
  onRequestPatch as collectsPatch,
  onRequestPost as collectsCreate,
  sanitizeCollectNote,
} from "../../../functions/api/collects";
import {
  COLLECTS_PREFIX,
  COLLECT_MAX_FILE_BYTES,
  COLLECT_MAX_PENDING,
  COLLECT_MAX_TOTAL_BYTES,
  COLLECT_PART_SIZE,
  COLLECT_STAGING_PREFIX,
  COLLECT_FOLDER_MAX_BYTES,
  COLLECT_NAME_MAX_BYTES,
  collectNameBudget,
  collectNameCandidates,
  collectRecordKey,
  collectStatus,
  expectedPartLength,
  isForbiddenCollectFolder,
  parseCollectRecord,
  safeCollectContentType,
  sanitizeCollectName,
} from "../../../functions/_collect";
import { placeCollectedObject } from "../../../functions/_collectUpload";
import { formatCollectSize, safeJsonForScript } from "../../../functions/_collectPage";
import { normalizeDirKey } from "../../../functions/api/_apikey";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const AUTH = basicAuthHeader("user", "pass");
const HOST = "http://drive.example.com";

function ownerEnv(bucket: InMemoryBucket | { raw: R2Bucket }) {
  return {
    BUCKET: bucket instanceof InMemoryBucket ? bucket.asBucket() : bucket.raw,
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
  };
}

function bucketOf(bucket: InMemoryBucket | { raw: R2Bucket }): R2Bucket {
  return bucket instanceof InMemoryBucket ? bucket.asBucket() : bucket.raw;
}

async function ownerCreate(
  bucket: InMemoryBucket | { raw: R2Bucket },
  body: Record<string, unknown>,
  auth = AUTH
): Promise<Response> {
  const request = new Request(`${HOST}/api/collects`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return collectsCreate(makeContext(request, ownerEnv(bucket)));
}

async function newCollect(
  bucket: InMemoryBucket,
  body: Record<string, unknown> = { folder: "inbox" }
): Promise<string> {
  const response = await ownerCreate(bucket, body);
  expect(response.status).toBe(201);
  return ((await response.json()) as { token: string }).token;
}

async function anon(
  bucket: InMemoryBucket | { raw: R2Bucket },
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const segments = path.split("?")[0].split("/").filter(Boolean);
  const request = new Request(`${HOST}/collect/${path}`, init);
  return collectRoute(makeContext(request, { BUCKET: bucketOf(bucket) }, { token: segments }));
}

function postJson(bucket: InMemoryBucket | { raw: R2Bucket }, path: string, body: unknown) {
  return anon(bucket, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function putPart(
  bucket: InMemoryBucket | { raw: R2Bucket },
  token: string,
  uploadId: string,
  partNumber: number,
  bytes: Uint8Array,
  headers: Record<string, string> = { "Content-Length": String(bytes.byteLength) }
) {
  return anon(
    bucket,
    `${token}/part?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
    { method: "PUT", headers, body: bytes }
  );
}

async function createUpload(
  bucket: InMemoryBucket | { raw: R2Bucket },
  token: string,
  name: string,
  size: number,
  type = "text/plain"
) {
  const response = await postJson(bucket, `${token}/create`, { name, size, type });
  return { response, body: (await response.clone().json()) as Record<string, any> };
}

async function uploadFile(
  bucket: InMemoryBucket | { raw: R2Bucket },
  token: string,
  name: string,
  content: Uint8Array | string,
  type = "text/plain"
): Promise<Response> {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const { response, body } = await createUpload(bucket, token, name, bytes.byteLength, type);
  if (!response.ok) return response;
  const parts: Array<{ partNumber: number; etag: string }> = [];
  for (let i = 0; i < body.partCount; i++) {
    const chunk = bytes.subarray(i * COLLECT_PART_SIZE, (i + 1) * COLLECT_PART_SIZE);
    const res = await putPart(bucket, token, body.uploadId, i + 1, chunk);
    if (!res.ok) return res;
    parts.push((await res.json()) as { partNumber: number; etag: string });
  }
  return postJson(bucket, `${token}/complete`, { uploadId: body.uploadId, parts });
}

function record(bucket: InMemoryBucket, token: string): Record<string, any> {
  return bucket.rawJson(collectRecordKey(token))!;
}

function patchRecord(bucket: InMemoryBucket, token: string, patch: (r: Record<string, any>) => void) {
  const current = record(bucket, token);
  patch(current);
  bucket.seed([
    { key: collectRecordKey(token), body: JSON.stringify(current), contentType: "application/json" },
  ]);
}

async function allKeys(bucket: InMemoryBucket): Promise<string[]> {
  const listing = await bucket.asBucket().list({ prefix: "" });
  return listing.objects.map((object) => object.key).sort();
}

function freshBucket(): InMemoryBucket {
  const bucket = new InMemoryBucket();
  bucket.seedDir("inbox");
  bucket.seed([{ key: "inbox/existing.txt", body: "owner secret", contentType: "text/plain" }]);
  return bucket;
}

describe("owner API /api/collects", () => {
  test("every method requires auth", async () => {
    const bucket = freshBucket();
    const bad = basicAuthHeader("user", "wrong");
    expect((await ownerCreate(bucket, { folder: "inbox" }, bad)).status).toBe(401);
    const env = ownerEnv(bucket);
    const get = new Request(`${HOST}/api/collects`, { headers: { Authorization: bad } });
    expect((await collectsList(makeContext(get, env))).status).toBe(401);
    const patch = new Request(`${HOST}/api/collects?token=${"a".repeat(32)}`, {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
    });
    expect((await collectsPatch(makeContext(patch, env))).status).toBe(401);
    const del = new Request(`${HOST}/api/collects?token=${"a".repeat(32)}`, { method: "DELETE" });
    expect((await collectsDelete(makeContext(del, env))).status).toBe(401);
  });

  test("creates a write-only record with 7-day default expiry", async () => {
    const bucket = freshBucket();
    const before = Date.now();
    const response = await ownerCreate(bucket, { folder: "/inbox/", note: " hi\u202e there " });
    expect(response.status).toBe(201);
    const view = (await response.json()) as Record<string, any>;
    expect(view.token).toMatch(/^[a-f0-9]{32}$/);
    expect(view.url).toBe(`${HOST}/collect/${view.token}`);
    expect(view.folder).toBe("inbox");
    expect(view.status).toBe("active");
    expect(view.note).toBe("hi there");
    const stored = record(bucket, view.token);
    expect(stored.kind).toBe("collect");
    expect(stored.key).toBeUndefined();
    expect(stored.limits).toEqual({
      maxFileBytes: 100 * 1024 * 1024,
      maxFiles: 200,
      maxTotalBytes: 2 * 1024 * 1024 * 1024,
    });
    const expires = Date.parse(stored.expiresAt);
    expect(expires - before).toBeGreaterThanOrEqual(7 * 24 * 3600 * 1000 - 1000);
    expect(expires - before).toBeLessThanOrEqual(7 * 24 * 3600 * 1000 + 5000);
  });

  test("owner may pick a shorter expiry but never longer than 7 days", async () => {
    const bucket = freshBucket();
    const ok = await ownerCreate(bucket, { folder: "inbox", expiresInHours: 24 });
    const view = (await ok.json()) as Record<string, any>;
    expect(Date.parse(view.expiresAt) - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000);
    for (const expiresInHours of [169, 0, -1, "abc"]) {
      expect((await ownerCreate(bucket, { folder: "inbox", expiresInHours })).status).toBe(400);
    }
  });

  test("rejects bad targets: internal, sites, traversal, missing, file", async () => {
    const bucket = freshBucket();
    bucket.seedDir("sites");
    bucket.seedDir("sites/blog");
    expect((await ownerCreate(bucket, { folder: "_$flaredrive$/shares" })).status).toBe(400);
    expect((await ownerCreate(bucket, { folder: "sites" })).status).toBe(400);
    expect((await ownerCreate(bucket, { folder: "sites/blog" })).status).toBe(400);
    expect((await ownerCreate(bucket, { folder: "inbox/../_$flaredrive$" })).status).toBe(400);
    expect((await ownerCreate(bucket, { folder: "" })).status).toBe(400);
    expect((await ownerCreate(bucket, { folder: "nope" })).status).toBe(404);
    expect((await ownerCreate(bucket, { folder: "inbox/existing.txt" })).status).toBe(404);
    const badJson = new Request(`${HOST}/api/collects`, {
      method: "POST",
      headers: { Authorization: AUTH },
      body: "{",
    });
    expect((await collectsCreate(makeContext(badJson, ownerEnv(bucket)))).status).toBe(400);
  });

  test("prefix-only folders are valid targets", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "loose/a.txt", body: "x" }]);
    expect((await ownerCreate(bucket, { folder: "loose" })).status).toBe(201);
  });

  test("lists links newest first and skips junk records", async () => {
    const bucket = freshBucket();
    const first = await newCollect(bucket);
    patchRecord(bucket, first, (r) => {
      r.createdAt = "2026-01-01T00:00:00.000Z";
    });
    const second = await newCollect(bucket);
    bucket.seed([
      { key: `${COLLECTS_PREFIX}junk.json`, body: "{}" },
      { key: `${COLLECTS_PREFIX}${"b".repeat(32)}.json`, body: "not json" },
      { key: `${COLLECTS_PREFIX}${"c".repeat(32)}.json`, body: JSON.stringify({ kind: "share" }) },
    ]);
    const request = new Request(`${HOST}/api/collects`, { headers: { Authorization: AUTH } });
    const list = (await (await collectsList(makeContext(request, ownerEnv(bucket)))).json()) as any[];
    expect(list.map((item) => item.token)).toEqual([second, first]);
    expect(list[0]).toMatchObject({ status: "active", pendingCount: 0, usage: { files: 0, bytes: 0 } });
  });

  test("sanitizeCollectNote strips control/bidi chars and truncates", () => {
    expect(sanitizeCollectNote(42)).toBe("");
    expect(sanitizeCollectNote("a\u0000b\nc")).toBe("ab\nc");
    expect(sanitizeCollectNote("x".repeat(500))).toHaveLength(200);
  });
});

describe("anonymous upload page", () => {
  test("renders upload page with strict CSP and without leaking the folder", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("private-tax-2026");
    const token = await newCollect(bucket, {
      folder: "private-tax-2026",
      note: "<script>alert(1)</script> 请上传",
    });
    const response = await anon(bucket, token, { headers: { "Accept-Language": "zh-CN" } });
    expect(response.status).toBe(200);
    const csp = response.headers.get("Content-Security-Policy")!;
    expect(csp).toMatch(/default-src 'none'/);
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const html = await response.text();
    expect(html).not.toContain("private-tax-2026");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; 请上传");
    expect(html).toContain("上传文件");
    const nonce = csp.match(/'nonce-([^']+)'/)![1];
    expect(html).toContain(`<script nonce="${nonce}">`);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const data = JSON.parse(doc.getElementById("collect-data")!.textContent!);
    expect(data).toMatchObject({ base: `/collect/${token}`, partSize: COLLECT_PART_SIZE, remainingFiles: 200 });
    expect(JSON.stringify(data)).not.toContain("private-tax-2026");

    const en = await (await anon(bucket, token, { headers: { "Accept-Language": "en-US" } })).text();
    expect(en).toContain("Upload files");
    const head = await anon(bucket, token, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await anon(bucket, token, { method: "POST" })).status).toBe(405);
  });

  test("404 for unknown / malformed tokens and share tokens; 410 expired/disabled; full", async () => {
    const bucket = freshBucket();
    bucket.seed([
      {
        key: `_$flaredrive$/shares/${"d".repeat(32)}.json`,
        body: JSON.stringify({ key: "inbox/existing.txt", name: "existing.txt" }),
      },
    ]);
    expect((await anon(bucket, "d".repeat(32))).status).toBe(404);
    expect((await anon(bucket, "e".repeat(32))).status).toBe(404);
    expect((await anon(bucket, "..%2Fshares%2Fx")).status).toBe(404);
    expect((await anon(bucket, "")).status).toBe(404);

    const expired = await newCollect(bucket);
    patchRecord(bucket, expired, (r) => {
      r.expiresAt = new Date(Date.now() - 1000).toISOString();
    });
    const expiredRes = await anon(bucket, expired);
    expect(expiredRes.status).toBe(410);
    expect(await expiredRes.text()).toContain("Link expired");

    const disabled = await newCollect(bucket);
    patchRecord(bucket, disabled, (r) => {
      r.disabledAt = new Date().toISOString();
    });
    expect((await anon(bucket, disabled)).status).toBe(410);

    const full = await newCollect(bucket);
    patchRecord(bucket, full, (r) => {
      r.usage.files = 200;
    });
    const fullRes = await anon(bucket, full);
    expect(fullRes.status).toBe(200);
    expect(await fullRes.text()).toContain("This link is full");
  });
});

describe("token isolation", () => {
  test("a collect token can never read through /share", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const res = await shareGet(
      makeContext(new Request(`${HOST}/share/${token}`), { BUCKET: bucket.asBucket() }, { token })
    );
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).not.toContain("owner secret");
  });

  test("a share token can never write through /collect", async () => {
    const bucket = freshBucket();
    const shareToken = "d".repeat(32);
    bucket.seed([
      {
        key: `_$flaredrive$/shares/${shareToken}.json`,
        body: JSON.stringify({ key: "inbox", name: "inbox", isDir: true }),
      },
    ]);
    const res = await createUpload(bucket, shareToken, "a.txt", 3);
    expect(res.response.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  test("uploadIds are bound to the token that created them", async () => {
    const bucket = freshBucket();
    bucket.seedDir("other");
    const a = await newCollect(bucket);
    const b = await newCollect(bucket, { folder: "other" });
    const { body } = await createUpload(bucket, a, "a.txt", 3);
    const bytes = new TextEncoder().encode("abc");
    const foreignPart = await putPart(bucket, b, body.uploadId, 1, bytes);
    expect(foreignPart.status).toBe(404);
    expect(await foreignPart.json()).toEqual({ error: "unknown_upload" });
    const ownPart = await putPart(bucket, a, body.uploadId, 1, bytes);
    const part = await ownPart.json();
    expect(
      (await postJson(bucket, `${b}/complete`, { uploadId: body.uploadId, parts: [part] })).status
    ).toBe(404);
    expect((await postJson(bucket, `${b}/abort`, { uploadId: body.uploadId })).status).toBe(404);
    // A 的上传不受影响
    const done = await postJson(bucket, `${a}/complete`, { uploadId: body.uploadId, parts: [part] });
    expect(done.status).toBe(200);
    expect(bucket.rawText("inbox/a.txt")).toBe("abc");
    expect(bucket.has("other/a.txt")).toBe(false);
  });

  test("uploadIds not created via the link (e.g. owner multipart) are rejected", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const ownerUpload = await bucket.asBucket().createMultipartUpload("inbox/existing.txt");
    const bytes = new TextEncoder().encode("pwned");
    expect((await putPart(bucket, token, ownerUpload.uploadId, 1, bytes)).status).toBe(404);
    for (const id of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect((await putPart(bucket, token, id, 1, bytes)).status).toBe(404);
      expect(
        (await postJson(bucket, `${token}/complete`, { uploadId: id, parts: [{ partNumber: 1, etag: "x" }] })).status
      ).toBe(404);
      expect((await postJson(bucket, `${token}/abort`, { uploadId: id })).status).toBe(404);
    }
    expect(bucket.rawText("inbox/existing.txt")).toBe("owner secret");
  });
});

describe("anonymous upload flow", () => {
  test("uploads land directly in the folder; response reveals no name or folder", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const res = await uploadFile(bucket, token, "report.pdf", "%PDF-hello", "application/pdf");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: true, size: 10, remainingFiles: 199, remainingBytes: COLLECT_MAX_TOTAL_BYTES - 10 });
    expect(bucket.rawText("inbox/report.pdf")).toBe("%PDF-hello");
    const stored = record(bucket, token);
    expect(stored.usage).toEqual({ files: 1, bytes: 10 });
    expect(stored.pending).toEqual({});
    const keys = await allKeys(bucket);
    expect(keys.filter((key) => key.startsWith(COLLECT_STAGING_PREFIX))).toEqual([]);
  });

  test("multi-part upload with exact 10 MiB parts", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const size = COLLECT_PART_SIZE * 2 + 123;
    const bytes = new Uint8Array(size);
    bytes[0] = 1;
    bytes[size - 1] = 2;
    const res = await uploadFile(bucket, token, "big.bin", bytes, "application/octet-stream");
    expect(res.status).toBe(200);
    const stored = bucket.rawBytes("inbox/big.bin")!;
    expect(stored.byteLength).toBe(size);
    expect(stored[size - 1]).toBe(2);
    expect(expectedPartLength(size, 1)).toBe(COLLECT_PART_SIZE);
    expect(expectedPartLength(size, 3)).toBe(123);
  });

  test("same-name uploads never overwrite: -2, -3 suffixes", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    expect((await uploadFile(bucket, token, "existing.txt", "one")).status).toBe(200);
    expect((await uploadFile(bucket, token, "existing.txt", "two")).status).toBe(200);
    expect(bucket.rawText("inbox/existing.txt")).toBe("owner secret");
    expect(bucket.rawText("inbox/existing-2.txt")).toBe("one");
    expect(bucket.rawText("inbox/existing-3.txt")).toBe("two");
  });

  test("path traversal and hostile names stay inside the target folder", async () => {
    const bucket = freshBucket();
    bucket.seed([{ key: "outside.txt", body: "keep" }]);
    const token = await newCollect(bucket);
    const names = [
      "../../outside.txt",
      "..\\..\\win.txt",
      "_$flaredrive$/shares/evil.json",
      "..",
      "a\u0000b\u202ec.txt",
      "/abs/path/x.txt",
      "_$flaredrive$",
    ];
    for (const name of names) {
      expect((await uploadFile(bucket, token, name, "x")).status).toBe(200);
    }
    expect(bucket.rawText("outside.txt")).toBe("keep");
    const keys = await allKeys(bucket);
    const added = keys.filter((key) => key.startsWith("inbox/") && key !== "inbox/existing.txt");
    expect(added.sort()).toEqual(
      [
        "inbox/outside.txt",
        "inbox/win.txt",
        "inbox/evil.json",
        "inbox/file",
        "inbox/abc.txt",
        "inbox/x.txt",
        "inbox/__$flaredrive$",
      ].sort()
    );
    expect(keys.some((key) => key.startsWith("_$flaredrive$/shares/"))).toBe(false);
  });

  test("received keys survive the /api/* path round-trip unchanged (no %XX confused deputy)", async () => {
    const bucket = freshBucket();
    bucket.seedDir("inbox/Projects");
    bucket.seed([{ key: "inbox/Projects/keep.txt", body: "precious" }]);
    const token = await newCollect(bucket);
    for (const name of ["%2e", "%2e%2e", "Projects%2Fkeep.txt", "a%5cb.txt", "x+y%20z.txt"]) {
      expect((await uploadFile(bucket, token, name, "x")).status).toBe(200);
    }
    const added = (await allKeys(bucket)).filter(
      (key) =>
        key.startsWith("inbox/") &&
        !["inbox/existing.txt", "inbox/Projects", "inbox/Projects/keep.txt"].includes(key)
    );
    expect(added).toHaveLength(5);
    for (const key of added) {
      // 客户端按规范编码 path 参数；服务端只由 URLSearchParams 解一次
      const viaApi = normalizeDirKey(new URLSearchParams(`path=${encodeURIComponent(key)}`).get("path"));
      expect(viaApi).toBe(key);
    }
  });

  test("owner cannot target a folder whose key leaves no room for file names", async () => {
    const bucket = freshBucket();
    const deep = "深".repeat(Math.floor(COLLECT_FOLDER_MAX_BYTES / 3) + 1);
    bucket.seedDir(deep);
    expect((await ownerCreate(bucket, { folder: deep })).status).toBe(400);
    const ok = "深".repeat(Math.floor(COLLECT_FOLDER_MAX_BYTES / 3));
    bucket.seedDir(ok);
    const response = await ownerCreate(bucket, { folder: ok });
    expect(response.status).toBe(201);
    const token = ((await response.json()) as { token: string }).token;
    // 最长的文件名 + 同名后缀仍在 1024 字节以内
    for (let i = 0; i < 3; i++) {
      expect((await uploadFile(bucket, token, `${"名".repeat(300)}.txt`, "x")).status).toBe(200);
    }
    const keys = (await allKeys(bucket)).filter((key) => key.startsWith(`${ok}/`));
    expect(keys).toHaveLength(3);
    for (const key of keys) expect(new TextEncoder().encode(key).length).toBeLessThanOrEqual(1024);
  });

  test("active content types are stored as octet-stream", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    await uploadFile(bucket, token, "page.html", "<script>1</script>", "text/html");
    await uploadFile(bucket, token, "pic.svg", "<svg/>", "image/svg+xml");
    await uploadFile(bucket, token, "pic.png", "png", "image/png");
    const meta = async (key: string) => (await bucket.asBucket().head(key))!.httpMetadata!.contentType;
    expect(await meta("inbox/page.html")).toBe("application/octet-stream");
    expect(await meta("inbox/pic.svg")).toBe("application/octet-stream");
    expect(await meta("inbox/pic.png")).toBe("image/png");
  });

  test("abort removes the pending upload; second abort is 404", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const { body } = await createUpload(bucket, token, "a.txt", 3);
    expect(Object.keys(record(bucket, token).pending)).toEqual([body.uploadId]);
    const res = await postJson(bucket, `${token}/abort`, { uploadId: body.uploadId });
    expect(res.status).toBe(204);
    expect(record(bucket, token).pending).toEqual({});
    expect((await postJson(bucket, `${token}/abort`, { uploadId: body.uploadId })).status).toBe(404);
    const late = await putPart(bucket, token, body.uploadId, 1, new TextEncoder().encode("abc"));
    expect(late.status).toBe(404);
  });

  test("bad requests: empty file, bad JSON, unknown action, wrong method", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    expect((await createUpload(bucket, token, "a", 0)).body).toEqual({ error: "empty_file" });
    expect((await createUpload(bucket, token, "a", 1.5)).response.status).toBe(400);
    expect((await anon(bucket, `${token}/create`, { method: "POST", body: "{" })).status).toBe(400);
    expect((await anon(bucket, `${token}/create`, { method: "POST", body: "[]" })).status).toBe(400);
    expect((await anon(bucket, `${token}/list`, { method: "POST" })).status).toBe(404);
    expect((await anon(bucket, `${token}/create/x`, { method: "POST" })).status).toBe(404);
    expect((await anon(bucket, `${token}/create`, { method: "GET" })).status).toBe(405);
    expect((await anon(bucket, `${"z".repeat(32)}/create`, { method: "POST" })).status).toBe(404);
    expect((await anon(bucket, `${token}/complete`, { method: "POST", body: JSON.stringify({}) })).status).toBe(400);
    expect((await anon(bucket, `${token}/abort`, { method: "POST", body: JSON.stringify({}) })).status).toBe(400);
    const huge = await anon(bucket, `${token}/create`, {
      method: "POST",
      body: JSON.stringify({ name: "x".repeat(20000), size: 1 }),
    });
    expect(huge.status).toBe(400);
  });

  test("folder deleted after link creation → 410 folder_gone", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("gone");
    const token = await newCollect(bucket, { folder: "gone" });
    await bucket.asBucket().delete("gone");
    const { response, body } = await createUpload(bucket, token, "a.txt", 3);
    expect(response.status).toBe(410);
    expect(body).toEqual({ error: "folder_gone" });
  });
});

describe("expiry and disable", () => {
  test("expired link rejects create, part and complete", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const { body } = await createUpload(bucket, token, "a.txt", 3);
    patchRecord(bucket, token, (r) => {
      r.expiresAt = new Date(Date.now() - 1).toISOString();
    });
    expect((await createUpload(bucket, token, "b.txt", 3)).body).toEqual({ error: "expired" });
    const part = await putPart(bucket, token, body.uploadId, 1, new TextEncoder().encode("abc"));
    expect(part.status).toBe(410);
    const done = await postJson(bucket, `${token}/complete`, {
      uploadId: body.uploadId,
      parts: [{ partNumber: 1, etag: "x" }],
    });
    expect(done.status).toBe(410);
    // abort 仍然允许（清理）
    expect((await postJson(bucket, `${token}/abort`, { uploadId: body.uploadId })).status).toBe(204);
  });

  test("PATCH disables the link and aborts in-flight uploads", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const { body } = await createUpload(bucket, token, "a.txt", 3);
    const bytes = new TextEncoder().encode("abc");
    const part = await (await putPart(bucket, token, body.uploadId, 1, bytes)).json();
    const request = new Request(`${HOST}/api/collects?token=${token}`, {
      method: "PATCH",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: true }),
    });
    const res = await collectsPatch(makeContext(request, ownerEnv(bucket)));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).status).toBe("disabled");
    expect(record(bucket, token).pending).toEqual({});
    expect((await anon(bucket, token)).status).toBe(410);
    expect((await createUpload(bucket, token, "b.txt", 3)).body).toEqual({ error: "disabled" });
    const staging = Object.values(record(bucket, token).pending);
    expect(staging).toEqual([]);
    // 多段上传已被中止：即使绕过端点直接 complete 也失败
    const pendingKey = (await allKeys(bucket)).find((key) => key.startsWith(COLLECT_STAGING_PREFIX));
    expect(pendingKey).toBeUndefined();
    await expect(
      bucket.asBucket().resumeMultipartUpload("x", body.uploadId).complete([part as R2UploadedPart])
    ).rejects.toThrow();

    const bad = new Request(`${HOST}/api/collects?token=${token}`, {
      method: "PATCH",
      headers: { Authorization: AUTH },
      body: JSON.stringify({ disabled: false }),
    });
    expect((await collectsPatch(makeContext(bad, ownerEnv(bucket)))).status).toBe(400);
    const missing = new Request(`${HOST}/api/collects?token=${"f".repeat(32)}`, {
      method: "PATCH",
      headers: { Authorization: AUTH },
      body: JSON.stringify({ disabled: true }),
    });
    expect((await collectsPatch(makeContext(missing, ownerEnv(bucket)))).status).toBe(404);
    const noToken = new Request(`${HOST}/api/collects?token=../x`, {
      method: "PATCH",
      headers: { Authorization: AUTH },
      body: JSON.stringify({ disabled: true }),
    });
    expect((await collectsPatch(makeContext(noToken, ownerEnv(bucket)))).status).toBe(400);
  });

  test("DELETE removes the record and staging, keeps received files", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    await uploadFile(bucket, token, "kept.txt", "kept");
    await createUpload(bucket, token, "pending.txt", 3);
    bucket.seed([{ key: `${COLLECT_STAGING_PREFIX}${token}/leftover`, body: "x" }]);
    const request = new Request(`${HOST}/api/collects?token=${token}`, {
      method: "DELETE",
      headers: { Authorization: AUTH },
    });
    expect((await collectsDelete(makeContext(request, ownerEnv(bucket)))).status).toBe(204);
    expect(bucket.has(collectRecordKey(token))).toBe(false);
    expect(bucket.rawText("inbox/kept.txt")).toBe("kept");
    expect((await allKeys(bucket)).some((key) => key.startsWith(COLLECT_STAGING_PREFIX))).toBe(false);
    expect((await anon(bucket, token)).status).toBe(404);
    const bad = new Request(`${HOST}/api/collects`, { method: "DELETE", headers: { Authorization: AUTH } });
    expect((await collectsDelete(makeContext(bad, ownerEnv(bucket)))).status).toBe(400);
  });
});

describe("limits", () => {
  test("per-file limit is checked at create with the declared size", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const { response, body } = await createUpload(bucket, token, "huge.iso", COLLECT_MAX_FILE_BYTES + 1);
    expect(response.status).toBe(413);
    expect(body).toEqual({ error: "file_too_large" });
    expect((await createUpload(bucket, token, "max.iso", COLLECT_MAX_FILE_BYTES)).response.status).toBe(200);
  });

  test("file count and total size include in-flight uploads", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    patchRecord(bucket, token, (r) => {
      r.usage.files = 199;
    });
    expect((await createUpload(bucket, token, "a", 1)).response.status).toBe(200);
    expect((await createUpload(bucket, token, "b", 1)).body).toEqual({ error: "too_many_files" });

    const t2 = await newCollect(bucket);
    patchRecord(bucket, t2, (r) => {
      r.usage.bytes = COLLECT_MAX_TOTAL_BYTES - 10;
    });
    expect((await createUpload(bucket, t2, "a", 6)).response.status).toBe(200);
    expect((await createUpload(bucket, t2, "b", 5)).body).toEqual({ error: "quota_exceeded" });
  });

  test("200 files per link end to end", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    patchRecord(bucket, token, (r) => {
      r.usage.files = 197;
    });
    for (let i = 0; i < 3; i++) {
      expect((await uploadFile(bucket, token, `f${i}.txt`, "x")).status).toBe(200);
    }
    const res = await uploadFile(bucket, token, "f4.txt", "x");
    expect(res.status).toBe(413);
    expect(record(bucket, token).usage.files).toBe(200);
  });

  test("stale (>24h) pending uploads are aborted in R2 when pruned", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const old = await createUpload(bucket, token, "old.bin", 3);
    patchRecord(bucket, token, (r) => {
      r.pending[old.body.uploadId].at = "2020-01-01T00:00:00.000Z";
    });
    const target = bucket.asBucket();
    const aborted: string[] = [];
    const raw = new Proxy(target, {
      get(obj, prop, receiver) {
        if (prop === "resumeMultipartUpload") {
          return (key: string, uploadId: string) => {
            const handle = target.resumeMultipartUpload(key, uploadId);
            return {
              ...handle,
              uploadPart: handle.uploadPart.bind(handle),
              complete: handle.complete.bind(handle),
              abort: async () => {
                aborted.push(uploadId);
                return handle.abort();
              },
            };
          };
        }
        const value = Reflect.get(obj, prop, receiver);
        return typeof value === "function" ? value.bind(obj) : value;
      },
    }) as R2Bucket;
    const fresh = await createUpload({ raw }, token, "new.bin", 3);
    expect(fresh.response.status).toBe(200);
    expect(aborted).toEqual([old.body.uploadId]);
    expect(Object.keys(record(bucket, token).pending)).toEqual([fresh.body.uploadId]);
  });

  test("too many concurrent uploads → 429", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    for (let i = 0; i < COLLECT_MAX_PENDING; i++) {
      expect((await createUpload(bucket, token, `p${i}`, 1)).response.status).toBe(200);
    }
    const { response, body } = await createUpload(bucket, token, "one-more", 1);
    expect(response.status).toBe(429);
    expect(body).toEqual({ error: "too_many_pending" });
    // 过期（>24h）的 pending 不再占额度
    patchRecord(bucket, token, (r) => {
      for (const entry of Object.values(r.pending) as any[]) entry.at = "2020-01-01T00:00:00.000Z";
    });
    expect((await createUpload(bucket, token, "now-ok", 1)).response.status).toBe(200);
    expect(Object.keys(record(bucket, token).pending)).toHaveLength(1);
  });

  test("limits re-checked at complete with the actual size", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const { body } = await createUpload(bucket, token, "a.txt", 3);
    const part = await (
      await putPart(bucket, token, body.uploadId, 1, new TextEncoder().encode("abc"))
    ).json();
    // 其他上传者在此期间把总量用满
    patchRecord(bucket, token, (r) => {
      r.usage.bytes = COLLECT_MAX_TOTAL_BYTES - 2;
    });
    const res = await postJson(bucket, `${token}/complete`, { uploadId: body.uploadId, parts: [part] });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "quota_exceeded" });
    expect(bucket.has("inbox/a.txt")).toBe(false);
    expect(record(bucket, token).pending).toEqual({});
    expect((await allKeys(bucket)).some((key) => key.startsWith(COLLECT_STAGING_PREFIX))).toBe(false);

    const t2 = await newCollect(bucket);
    const second = await createUpload(bucket, t2, "b.txt", 3);
    const part2 = await (
      await putPart(bucket, t2, second.body.uploadId, 1, new TextEncoder().encode("abc"))
    ).json();
    patchRecord(bucket, t2, (r) => {
      r.usage.files = 200;
    });
    const res2 = await postJson(bucket, `${t2}/complete`, { uploadId: second.body.uploadId, parts: [part2] });
    expect(await res2.json()).toEqual({ error: "too_many_files" });
  });

  test("actual size differing from the declared size is rejected at complete", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const { body } = await createUpload(bucket, token, "a.txt", 3);
    const staging = record(bucket, token).pending[body.uploadId].staging;
    // 绕过分块端点直接写入更大的块（模拟分块校验被绕过）
    const part = await bucket
      .asBucket()
      .resumeMultipartUpload(staging, body.uploadId)
      .uploadPart(1, new TextEncoder().encode("abcdef"));
    const res = await postJson(bucket, `${token}/complete`, { uploadId: body.uploadId, parts: [part] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "size_mismatch" });
    expect(bucket.has("inbox/a.txt")).toBe(false);
    expect(bucket.has(staging)).toBe(false);
    expect(record(bucket, token).usage).toEqual({ files: 0, bytes: 0 });
  });

  test("part size enforcement: oversized 413, missing length 411, wrong length 400", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const size = COLLECT_PART_SIZE + 5;
    const { body } = await createUpload(bucket, token, "a.bin", size);
    expect(body.partCount).toBe(2);
    const oversized = new Uint8Array(COLLECT_PART_SIZE + 1);
    const res = await putPart(bucket, token, body.uploadId, 1, oversized);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "part_too_large" });
    const noLength = await putPart(bucket, token, body.uploadId, 1, new Uint8Array(4), {});
    expect([400, 411]).toContain(noLength.status);
    const shortFirst = await putPart(bucket, token, body.uploadId, 1, new Uint8Array(5));
    expect(await shortFirst.json()).toEqual({ error: "bad_part" });
    const beyond = await putPart(bucket, token, body.uploadId, 3, new Uint8Array(5));
    expect(beyond.status).toBe(400);
    const zero = await putPart(bucket, token, body.uploadId, 1, new Uint8Array(0));
    expect(zero.status).toBe(400);
    const badQuery = await anon(bucket, `${token}/part?partNumber=1`, {
      method: "PUT",
      headers: { "Content-Length": "1" },
      body: new Uint8Array(1),
    });
    expect(badQuery.status).toBe(400);
  });

  test("complete validates parts and reports missing parts", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const { body } = await createUpload(bucket, token, "a.txt", 3);
    const bad = [
      [],
      [{ partNumber: 2, etag: "x" }],
      [{ partNumber: 1, etag: "" }],
      "nope",
      [null],
    ];
    for (const parts of bad) {
      const res = await postJson(bucket, `${token}/complete`, { uploadId: body.uploadId, parts });
      expect(res.status).toBe(400);
    }
    const missing = await postJson(bucket, `${token}/complete`, {
      uploadId: body.uploadId,
      parts: [{ partNumber: 1, etag: "never-uploaded" }],
    });
    expect(await missing.json()).toEqual({ error: "incomplete_upload" });
    expect(Object.keys(record(bucket, token).pending)).toEqual([body.uploadId]);
  });
});

describe("CAS and races", () => {
  /** 记录的条件写永远失败（模拟持续并发写入） */
  function contendedBucket(bucket: InMemoryBucket): { raw: R2Bucket; aborted: string[] } {
    const aborted: string[] = [];
    const target = bucket.asBucket();
    const raw = new Proxy(target, {
      get(obj, prop, receiver) {
        if (prop === "put") {
          return async (key: string, value: unknown, options?: R2PutOptions) => {
            if (key.startsWith(COLLECTS_PREFIX) && options?.onlyIf) return null;
            return target.put(key, value as string, options);
          };
        }
        if (prop === "resumeMultipartUpload") {
          return (key: string, uploadId: string) => {
            const handle = target.resumeMultipartUpload(key, uploadId);
            return {
              ...handle,
              uploadPart: handle.uploadPart.bind(handle),
              complete: handle.complete.bind(handle),
              abort: async () => {
                aborted.push(uploadId);
                return handle.abort();
              },
            };
          };
        }
        const value = Reflect.get(obj, prop, receiver);
        return typeof value === "function" ? value.bind(obj) : value;
      },
    }) as R2Bucket;
    return { raw, aborted };
  }

  test("create under persistent contention returns busy and aborts the multipart", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const contended = contendedBucket(bucket);
    const { response, body } = await createUpload(contended, token, "a.txt", 3);
    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "busy" });
    expect(contended.aborted).toHaveLength(1);
    expect(record(bucket, token).pending).toEqual({});
  });

  test("complete under contention returns busy without placing the file", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const { body } = await createUpload(bucket, token, "a.txt", 3);
    const part = await (
      await putPart(bucket, token, body.uploadId, 1, new TextEncoder().encode("abc"))
    ).json();
    const contended = contendedBucket(bucket);
    const res = await postJson(contended, `${token}/complete`, { uploadId: body.uploadId, parts: [part] });
    expect(res.status).toBe(503);
    expect(bucket.has("inbox/a.txt")).toBe(false);
    expect(record(bucket, token).usage).toEqual({ files: 0, bytes: 0 });
  });

  test("placement loses a create-only race and moves to the next name", async () => {
    const bucket = freshBucket();
    bucket.seed([{ key: "stage", body: "mine", contentType: "text/plain" }]);
    const target = bucket.asBucket();
    let raced = false;
    const raw = new Proxy(target, {
      get(obj, prop, receiver) {
        if (prop === "put") {
          return async (key: string, value: any, options?: R2PutOptions) => {
            if (!raced && key === "inbox/n.txt") {
              raced = true;
              // 并发写者抢先写入同名文件
              await target.put(key, "theirs");
              return target.put(key, value, options);
            }
            return target.put(key, value, options);
          };
        }
        const value = Reflect.get(obj, prop, receiver);
        return typeof value === "function" ? value.bind(obj) : value;
      },
    }) as R2Bucket;
    const key = await placeCollectedObject(raw, "inbox", "n.txt", "stage");
    expect(key).toBe("inbox/n-2.txt");
    expect(bucket.rawText("inbox/n.txt")).toBe("theirs");
    expect(bucket.rawText("inbox/n-2.txt")).toBe("mine");
    expect(await placeCollectedObject(target, "inbox", "z.txt", "missing-stage")).toBeNull();
  });

  test("placement errors (e.g. invalid key) roll back the reserved quota instead of a 500", async () => {
    const bucket = freshBucket();
    const token = await newCollect(bucket);
    const target = bucket.asBucket();
    const raw = new Proxy(target, {
      get(obj, prop, receiver) {
        if (prop === "head" || prop === "put") {
          return async (key: string, ...rest: any[]) => {
            if (key.startsWith("inbox/boom")) {
              throw new Error("head: The specified object name is not valid. (10020)");
            }
            return (target as any)[prop](key, ...rest);
          };
        }
        const value = Reflect.get(obj, prop, receiver);
        return typeof value === "function" ? value.bind(obj) : value;
      },
    }) as R2Bucket;
    const res = await uploadFile({ raw }, token, "boom.txt", "abc");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "store_failed" });
    expect(record(bucket, token).usage).toEqual({ files: 0, bytes: 0 });
    expect(record(bucket, token).pending).toEqual({});
    expect((await allKeys(bucket)).some((key) => key.startsWith(COLLECT_STAGING_PREFIX))).toBe(false);
    expect((await uploadFile(bucket, token, "fine.txt", "abc")).status).toBe(200);
  });
});

describe("pure helpers", () => {
  test("sanitizeCollectName", () => {
    expect(sanitizeCollectName("a/b/c.txt")).toBe("c.txt");
    expect(sanitizeCollectName("a\\b\\c.txt")).toBe("c.txt");
    expect(sanitizeCollectName("../..")).toBe("file");
    expect(sanitizeCollectName("...hidden")).toBe("hidden");
    expect(sanitizeCollectName("trail. . ")).toBe("trail");
    expect(sanitizeCollectName('a<b>:"|?*.txt')).toBe("a_b______.txt");
    expect(sanitizeCollectName("x\u202egpj.exe")).toBe("xgpj.exe");
    expect(sanitizeCollectName(undefined)).toBe("file");
    expect(sanitizeCollectName("_$flaredrive$")).toBe("__$flaredrive$");
    const long = sanitizeCollectName(`${"名".repeat(300)}.docx`);
    expect(new TextEncoder().encode(long).length).toBeLessThanOrEqual(COLLECT_NAME_MAX_BYTES);
    expect(long).toBe(`${"名".repeat(78)}.docx`);
    expect(Array.from(sanitizeCollectName("x".repeat(300)))).toHaveLength(180);
  });

  test("sanitizeCollectName: no %XX survives (defense in depth against clients that decode twice)", () => {
    expect(sanitizeCollectName("%2e")).toBe("_2e");
    expect(sanitizeCollectName("%2E%2e")).toBe("_2E_2e");
    expect(sanitizeCollectName("Projects%2Fkeep.txt")).toBe("Projects_2Fkeep.txt");
    expect(sanitizeCollectName("a%5cb%00c")).toBe("a_5cb_00c");
    // 去掉零宽字符后才拼出来的 %XX 也要处理
    expect(sanitizeCollectName("%\u200b2e.txt")).toBe("_2e.txt");
    // 不是转义序列的 % 保留
    expect(sanitizeCollectName("50%折扣.pdf")).toBe("50%折扣.pdf");
    expect(sanitizeCollectName("100%.txt")).toBe("100%.txt");
  });

  test("sanitizeCollectName: surrogates, invisible fillers, Windows device names", () => {
    expect(sanitizeCollectName("a\ud800b.txt")).toBe("ab.txt");
    expect(sanitizeCollectName("a\udc00b.txt")).toBe("ab.txt");
    expect(sanitizeCollectName("😀.txt")).toBe("😀.txt");
    expect(sanitizeCollectName("soft\u00adhy\u061cphen\u3164.txt")).toBe("softhyphen.txt");
    expect(sanitizeCollectName("CON")).toBe("_CON");
    expect(sanitizeCollectName("nul.txt")).toBe("_nul.txt");
    expect(sanitizeCollectName("com1.tar.gz")).toBe("_com1.tar.gz");
    expect(sanitizeCollectName("console.txt")).toBe("console.txt");
  });

  test("sanitizeCollectName: UTF-8 byte budget (emoji, folder key budget)", () => {
    const emoji = sanitizeCollectName(`${"😀".repeat(300)}.txt`);
    expect(new TextEncoder().encode(emoji).length).toBeLessThanOrEqual(COLLECT_NAME_MAX_BYTES);
    expect(emoji.endsWith(".txt")).toBe(true);
    // 不会切开代理对：UTF-8 往返后不变
    expect(new TextDecoder().decode(new TextEncoder().encode(emoji))).toBe(emoji);
    const tight = sanitizeCollectName(`${"名".repeat(50)}.pdf`, 20);
    expect(tight).toBe(`${"名".repeat(5)}.pdf`);
    expect(collectNameBudget("x".repeat(10))).toBe(COLLECT_NAME_MAX_BYTES);
    expect(collectNameBudget("x".repeat(1000))).toBe(14);
    expect(collectNameBudget("x".repeat(2000))).toBe(1);
  });

  test("collectNameCandidates", () => {
    const iter = collectNameCandidates("a.tar.gz");
    expect(iter.next().value).toBe("a.tar.gz");
    expect(iter.next().value).toBe("a.tar-2.gz");
    const all = Array.from(collectNameCandidates("noext"));
    expect(all).toHaveLength(101);
    expect(all[98]).toBe("noext-99");
    expect(all[100]).toMatch(/^noext-[a-f0-9]{8}$/);
  });

  test("safeCollectContentType", () => {
    expect(safeCollectContentType("image/PNG")).toBe("image/png");
    expect(safeCollectContentType("text/plain; charset=utf-8")).toBe("text/plain");
    expect(safeCollectContentType("text/html")).toBe("application/octet-stream");
    expect(safeCollectContentType("application/xhtml+xml")).toBe("application/octet-stream");
    expect(safeCollectContentType(undefined)).toBe("application/octet-stream");
  });

  test("parseCollectRecord rejects foreign shapes and clamps limits", () => {
    expect(parseCollectRecord(null)).toBeNull();
    expect(parseCollectRecord({ key: "inbox", name: "x" })).toBeNull();
    const base = { kind: "collect", folder: "inbox", expiresAt: "2030-01-01T00:00:00Z" };
    expect(parseCollectRecord({ ...base, folder: "_$flaredrive$/x" })).toBeNull();
    expect(parseCollectRecord({ ...base, folder: "a/" })).toBeNull();
    expect(parseCollectRecord({ ...base, expiresAt: "never" })).toBeNull();
    const parsed = parseCollectRecord({
      ...base,
      limits: { maxFileBytes: 1e15, maxFiles: 5, maxTotalBytes: -1 },
      usage: { files: "x", bytes: 3 },
      pending: { a: { staging: "inbox/escape" }, b: { staging: `${COLLECT_STAGING_PREFIX}t/s`, size: 4 }, c: null },
    })!;
    expect(parsed.limits).toEqual({ maxFileBytes: COLLECT_MAX_FILE_BYTES, maxFiles: 5, maxTotalBytes: COLLECT_MAX_TOTAL_BYTES });
    expect(parsed.usage).toEqual({ files: 0, bytes: 3 });
    expect(Object.keys(parsed.pending)).toEqual(["b"]);
    expect(collectStatus(parsed, Date.parse("2029-01-01"))).toBe("active");
    expect(collectStatus(parsed, Date.parse("2031-01-01"))).toBe("expired");
  });

  test("isForbiddenCollectFolder, page helpers", () => {
    expect(isForbiddenCollectFolder("sites")).toBe(true);
    expect(isForbiddenCollectFolder("sites/x")).toBe(true);
    expect(isForbiddenCollectFolder("sitesx")).toBe(false);
    expect(isForbiddenCollectFolder("a/_$flaredrive$/b")).toBe(true);
    expect(formatCollectSize(0)).toBe("0 B");
    expect(formatCollectSize(1536)).toBe("1.5 KB");
    expect(formatCollectSize(100 * 1024 * 1024)).toBe("100 MB");
    expect(safeJsonForScript({ a: "</script><b>&\u2028" })).not.toMatch(/[<>&\u2028]/);
  });
});
