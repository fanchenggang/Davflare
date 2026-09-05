/**
 * functions/api/trash.ts 分支级直测：软删 marker 生成、列表、还原（含父目录
 * marker 重建 / 虚拟目录补 marker）、清空、过期惰性清理、鉴权、内部前缀保护。
 */
import {
  onRequestDelete,
  onRequestGet,
  onRequestPost,
  softDeleteKeys,
} from "../../../functions/api/trash";
import {
  InMemoryBucket,
  basicAuthHeader,
  makeContext,
} from "../testInMemoryBucket";

const AUTH = basicAuthHeader("user", "pass");
const TRASH_PREFIX = "_$flaredrive$/trash/";

function makeEnv(bucket: InMemoryBucket, extra: Record<string, unknown> = {}) {
  return {
    BUCKET: bucket.asBucket(),
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
    ...extra,
  };
}

function get(path = "/api/trash"): Request {
  return new Request(`http://drive.example.com${path}`, {
    method: "GET",
    headers: { Authorization: AUTH },
  });
}

function post(path: string, body?: unknown): Request {
  return new Request(`http://drive.example.com${path}`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function del(path: string, body?: unknown): Request {
  return new Request(`http://drive.example.com${path}`, {
    method: "DELETE",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function noAuth(path: string, method: string, body?: unknown): Request {
  return new Request(`http://drive.example.com${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function softDeleteViaApi(
  bucket: InMemoryBucket,
  keys: string[]
): Promise<Array<{ key: string; id: string }>> {
  const response = await onRequestPost(
    makeContext(post("/api/trash", { keys }), makeEnv(bucket))
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { results: Array<{ key: string; id: string }> };
  return body.results;
}

describe("trash auth", () => {
  test("GET/POST/DELETE without credentials are 401", async () => {
    const bucket = new InMemoryBucket();
    for (const [request, handler] of [
      [noAuth("/api/trash", "GET"), onRequestGet],
      [noAuth("/api/trash", "POST", { keys: ["a.txt"] }), onRequestPost],
      [noAuth("/api/trash", "DELETE", { trashKeys: ["x"] }), onRequestDelete],
    ] as const) {
      const response = await handler(makeContext(request, makeEnv(bucket)));
      expect(response.status).toBe(401);
    }
  });

  test("empty configured credentials fail closed (401)", async () => {
    const bucket = new InMemoryBucket();
    const response = await onRequestGet(
      makeContext(get("/api/trash"), makeEnv(bucket, { WEBDAV_USERNAME: "", WEBDAV_PASSWORD: "" }))
    );
    expect(response.status).toBe(401);
  });

  test("wrong password is 401", async () => {
    const bucket = new InMemoryBucket();
    const request = new Request("http://drive.example.com/api/trash", {
      headers: { Authorization: basicAuthHeader("user", "wrong") },
    });
    const response = await onRequestGet(makeContext(request, makeEnv(bucket)));
    expect(response.status).toBe(401);
  });
});

describe("trash soft delete", () => {
  test("file: creates trash metadata + moves content, original removed", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "report.txt", body: "REPORT", contentType: "text/plain" }]);
    const results = await softDeleteViaApi(bucket, ["report.txt"]);
    expect(results).toEqual([
      { key: "report.txt", id: results[0].id },
    ]);
    expect(bucket.has("report.txt")).toBe(false);

    const metaKey = `${TRASH_PREFIX}${results[0].id}.json`;
    const meta = bucket.rawJson<{
      originalKey: string;
      name: string;
      deletedAt: string;
      size: number;
      virtualDir: boolean;
      items: Array<{ source: string; target: string }>;
    }>(metaKey);
    expect(meta?.originalKey).toBe("report.txt");
    expect(meta?.name).toBe("report.txt");
    expect(meta?.virtualDir).toBe(false);
    expect(Number.isFinite(Date.parse(meta?.deletedAt ?? ""))).toBe(true);
    expect(meta?.size).toBe(6);
    expect(meta?.items).toHaveLength(1);
    expect(meta?.items[0].source).toBe("report.txt");
    expect(meta?.items[0].target).toBe(`${TRASH_PREFIX}${results[0].id}/report.txt`);
    expect(bucket.rawText(meta!.items[0].target)).toBe("REPORT");
  });

  test("directory with marker: marker + descendants are moved", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/a.txt", body: "A" }, { key: "docs/sub/b.txt", body: "B" }]);
    const results = await softDeleteViaApi(bucket, ["docs/"]);
    expect(results).toHaveLength(1);
    const id = results[0].id;
    expect(bucket.has("docs")).toBe(false);
    expect(bucket.has("docs/a.txt")).toBe(false);
    expect(bucket.rawText(`${TRASH_PREFIX}${id}/a.txt`)).toBe("A");
    expect(bucket.rawText(`${TRASH_PREFIX}${id}/sub/b.txt`)).toBe("B");
    const marker = await bucket.asBucket().head(`${TRASH_PREFIX}${id}/docs`);
    expect(marker?.httpMetadata?.contentType).toBe("application/x-directory");
  });

  test("virtual directory (no marker) is detected and flagged", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "vdir/inner.txt", body: "I" }]);
    const results = await softDeleteViaApi(bucket, ["vdir"]);
    expect(results).toHaveLength(1);
    const meta = bucket.rawJson<{ virtualDir: boolean; items: unknown[] }>(
      `${TRASH_PREFIX}${results[0].id}.json`
    );
    expect(meta?.virtualDir).toBe(true);
    // 虚拟目录没有 marker 对象，items 只包含后代
    expect(meta?.items).toHaveLength(1);
  });

  test("skips nonexistent keys and internal prefixes", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "_$flaredrive$/apikeys/k.json", body: "{}" }]);
    bucket.seed([{ key: "wrap/_$flaredrive$/nested", body: "N" }]);
    const results = await softDeleteViaApi(bucket, [
      "ghost.txt",
      "_$flaredrive$/apikeys/k.json",
      "wrap/_$flaredrive$/nested",
    ]);
    expect(results).toEqual([]);
    expect(bucket.has("_$flaredrive$/apikeys/k.json")).toBe(true);
    expect(bucket.rawText("wrap/_$flaredrive$/nested")).toBe("N");
  });

  test("invalid JSON body is 400; empty keys is 400", async () => {
    const bucket = new InMemoryBucket();
    const badJson = new Request("http://drive.example.com/api/trash", {
      method: "POST",
      headers: { Authorization: AUTH },
      body: "{nope",
    });
    expect((await onRequestPost(makeContext(badJson, makeEnv(bucket)))).status).toBe(400);
    expect(
      (await onRequestPost(makeContext(post("/api/trash", { keys: [] }), makeEnv(bucket)))).status
    ).toBe(400);
  });

  test("softDeleteKeys (exported) works without HTTP context", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "solo.txt", body: "S" }]);
    const results = await softDeleteKeys(bucket.asBucket(), ["solo.txt"]);
    expect(results).toHaveLength(1);
    expect(bucket.has("solo.txt")).toBe(false);
  });
});

describe("trash list (GET)", () => {
  test("lists items with metadata from trash markers", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "AAA" }]);
    const [{ id }] = await softDeleteViaApi(bucket, ["a.txt"]);
    const response = await onRequestGet(makeContext(get(), makeEnv(bucket)));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const items = (await response.json()) as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      trashKey: id,
      originalKey: "a.txt",
      name: "a.txt",
      size: 3,
    });
    expect(items[0].trashKey).toBe(id);
    expect(typeof items[0].deletedAt).toBe("string");
  });

  test("corrupt or incomplete trash metadata entries are skipped, not 500", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: `${TRASH_PREFIX}broken.json`, body: "{not json" },
      { key: `${TRASH_PREFIX}incomplete.json`, body: JSON.stringify({ name: "x" }) },
      { key: `${TRASH_PREFIX}nested/deep.json`, body: JSON.stringify({ originalKey: "y" }) },
    ]);
    const response = await onRequestGet(makeContext(get(), makeEnv(bucket)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});

describe("trash restore", () => {
  test("restores file content and metadata, removes trash state", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "AAA", customMetadata: { thumbnail: "t" } }]);
    const [{ id }] = await softDeleteViaApi(bucket, ["a.txt"]);
    const response = await onRequestPost(
      makeContext(post("/api/trash?action=restore", { trashKeys: [id] }), makeEnv(bucket))
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ trashKey: id, status: "restored" }]);
    expect(bucket.rawText("a.txt")).toBe("AAA");
    const head = await bucket.asBucket().head("a.txt");
    expect(head?.customMetadata?.thumbnail).toBe("t");
    expect(bucket.has(`${TRASH_PREFIX}${id}.json`)).toBe(false);
    expect(bucket.has(`${TRASH_PREFIX}${id}/a.txt`)).toBe(false);
  });

  test("restore rebuilds missing parent folder markers", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    bucket.seedDir("docs/sub");
    bucket.seed([{ key: "docs/sub/inner.txt", body: "I" }]);
    const [{ id }] = await softDeleteViaApi(bucket, ["docs/sub"]);
    expect(bucket.has("docs/sub")).toBe(false);
    // 还原前父级 marker 消失（例如父目录随后被单独删除）
    bucket.asBucket().delete("docs");
    const response = await onRequestPost(
      makeContext(post("/api/trash?action=restore", { trashKeys: [id] }), makeEnv(bucket))
    );
    const body = (await response.json()) as Array<{ status: string }>;
    expect(body[0].status).toBe("restored");
    const docs = await bucket.asBucket().head("docs");
    expect(docs?.httpMetadata?.contentType).toBe("application/x-directory");
    expect(bucket.rawText("docs/sub/inner.txt")).toBe("I");
    const sub = await bucket.asBucket().head("docs/sub");
    expect(sub?.httpMetadata?.contentType).toBe("application/x-directory");
  });

  test("restore of virtual directory recreates the collection marker", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "vdir/inner.txt", body: "I" }]);
    const [{ id }] = await softDeleteViaApi(bucket, ["vdir"]);
    const response = await onRequestPost(
      makeContext(post("/api/trash?action=restore", { trashKeys: [id] }), makeEnv(bucket))
    );
    expect(((await response.json()) as Array<{ status: string }>)[0].status).toBe("restored");
    const marker = await bucket.asBucket().head("vdir");
    expect(marker?.httpMetadata?.contentType).toBe("application/x-directory");
    expect(bucket.rawText("vdir/inner.txt")).toBe("I");
  });

  test("restore conflict when original key exists again", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "OLD" }]);
    const [{ id }] = await softDeleteViaApi(bucket, ["a.txt"]);
    bucket.seed([{ key: "a.txt", body: "NEW" }]);
    const response = await onRequestPost(
      makeContext(post("/api/trash?action=restore", { trashKeys: [id] }), makeEnv(bucket))
    );
    const body = (await response.json()) as Array<{ status: string; message?: string }>;
    expect(body[0].status).toBe("conflict");
    expect(body[0].message).toContain("a.txt");
    expect(bucket.rawText("a.txt")).toBe("NEW");
    // 冲突不消费回收站条目
    expect(bucket.has(`${TRASH_PREFIX}${id}.json`)).toBe(true);
  });

  test("restore of unknown / corrupt trash keys reports error", async () => {
    const bucket = new InMemoryBucket();
    const response = await onRequestPost(
      makeContext(post("/api/trash?action=restore", { trashKeys: ["ghost"] }), makeEnv(bucket))
    );
    expect(await response.json()).toEqual([
      { trashKey: "ghost", status: "error", message: "回收站项目不存在" },
    ]);

    bucket.seed([{ key: `${TRASH_PREFIX}corrupt.json`, body: "{oops" }]);
    const corruptResponse = await onRequestPost(
      makeContext(post("/api/trash?action=restore", { trashKeys: ["corrupt"] }), makeEnv(bucket))
    );
    const corruptBody = (await corruptResponse.json()) as Array<{ status: string }>;
    expect(corruptBody[0].status).toBe("error");
  });

  test("restore with invalid JSON body is 400", async () => {
    const bucket = new InMemoryBucket();
    const request = new Request("http://drive.example.com/api/trash?action=restore", {
      method: "POST",
      headers: { Authorization: AUTH },
      body: "{nope",
    });
    expect((await onRequestPost(makeContext(request, makeEnv(bucket)))).status).toBe(400);
  });
});

describe("trash delete endpoints", () => {
  test("DELETE specific trashKeys removes descendants + metadata", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "AAA" }, { key: "docs/b.txt", body: "B" }]);
    const [first, second] = await softDeleteViaApi(bucket, ["a.txt", "docs/b.txt"]);
    const response = await onRequestDelete(
      makeContext(del("/api/trash", { trashKeys: [first.id] }), makeEnv(bucket))
    );
    expect(response.status).toBe(204);
    expect(bucket.has(`${TRASH_PREFIX}${first.id}.json`)).toBe(false);
    expect(bucket.has(`${TRASH_PREFIX}${first.id}/a.txt`)).toBe(false);
    // 未选中的保留
    expect(bucket.has(`${TRASH_PREFIX}${second.id}.json`)).toBe(true);
  });

  test("DELETE all empties the whole trash prefix", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }, { key: "b.txt", body: "B" }]);
    await softDeleteViaApi(bucket, ["a.txt", "b.txt"]);
    const response = await onRequestDelete(
      makeContext(del("/api/trash", { all: true }), makeEnv(bucket))
    );
    expect(response.status).toBe(204);
    const listing = await bucket.asBucket().list({ prefix: TRASH_PREFIX });
    expect(listing.objects).toHaveLength(0);
  });

  test("DELETE with invalid JSON is 400", async () => {
    const bucket = new InMemoryBucket();
    const request = new Request("http://drive.example.com/api/trash", {
      method: "DELETE",
      headers: { Authorization: AUTH },
      body: "{nope",
    });
    expect((await onRequestDelete(makeContext(request, makeEnv(bucket)))).status).toBe(400);
  });
});

describe("trash lazy expiry purge", () => {
  function seedTrashItem(
    bucket: InMemoryBucket,
    trashId: string,
    deletedAtIso: string,
    content = "old"
  ) {
    bucket.seed([
      {
        key: `${TRASH_PREFIX}${trashId}.json`,
        body: JSON.stringify({ originalKey: `${trashId}.txt`, deletedAt: deletedAtIso }),
        contentType: "application/json",
      },
      { key: `${TRASH_PREFIX}${trashId}/${trashId}.txt`, body: content },
    ]);
  }

  test("expired items (retention 0) are purged with descendants on GET", async () => {
    const bucket = new InMemoryBucket();
    seedTrashItem(bucket, "old-one", "2020-01-01T00:00:00.000Z");
    seedTrashItem(bucket, "still-fresh", "9999-01-01T00:00:00.000Z");
    const env = makeEnv(bucket, { TRASH_RETENTION_DAYS: "0" });
    const response = await onRequestGet(makeContext(get(), env));
    expect(response.status).toBe(200);
    const items = (await response.json()) as Array<{ trashKey: string }>;
    expect(items.map((item) => item.trashKey)).toEqual(["still-fresh"]);
    expect(bucket.has(`${TRASH_PREFIX}old-one.json`)).toBe(false);
    expect(bucket.has(`${TRASH_PREFIX}old-one/old-one.txt`)).toBe(false);
  });

  test("negative retention disables purging", async () => {
    const bucket = new InMemoryBucket();
    seedTrashItem(bucket, "ancient", "2020-01-01T00:00:00.000Z");
    const env = makeEnv(bucket, { TRASH_RETENTION_DAYS: "-1" });
    const response = await onRequestGet(makeContext(get(), env));
    expect(response.status).toBe(200);
    expect(bucket.has(`${TRASH_PREFIX}ancient.json`)).toBe(true);
  });

  test("invalid retention value falls back to default 30 days", async () => {
    const bucket = new InMemoryBucket();
    seedTrashItem(bucket, "recent", new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString());
    const env = makeEnv(bucket, { TRASH_RETENTION_DAYS: "not-a-number" });
    const response = await onRequestGet(makeContext(get(), env));
    expect(response.status).toBe(200);
    expect(bucket.has(`${TRASH_PREFIX}recent.json`)).toBe(true);
  });

  test("corrupt trash json is left alone by the purge pass", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: `${TRASH_PREFIX}corrupt.json`, body: "{oops", contentType: "application/json" },
    ]);
    const env = makeEnv(bucket, { TRASH_RETENTION_DAYS: "0" });
    const response = await onRequestGet(makeContext(get(), env));
    expect(response.status).toBe(200);
    expect(bucket.has(`${TRASH_PREFIX}corrupt.json`)).toBe(true);
  });

  test("nested keys under the trash prefix are not treated as expiry markers", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      {
        key: `${TRASH_PREFIX}folder/deep.json`,
        body: JSON.stringify({ originalKey: "x", deletedAt: "2020-01-01T00:00:00.000Z" }),
      },
    ]);
    const env = makeEnv(bucket, { TRASH_RETENTION_DAYS: "0" });
    const response = await onRequestGet(makeContext(get(), env));
    expect(response.status).toBe(200);
    expect(bucket.has(`${TRASH_PREFIX}folder/deep.json`)).toBe(true);
  });
});
