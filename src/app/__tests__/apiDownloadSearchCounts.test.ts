/**
 * functions/api/download + search + counts 分支级直测：
 * 下载（Content-* 头、Range/断点续传 206、非法 Range 回退、目录/缺参分支、
 * 中文文件名 filename*）、搜索（大小写、内部前缀过滤、limit 截断翻页）、
 * 批量子项计数（对象 + 分隔前缀、内部键排除、paths 截断）。
 */
import { onRequestGet as downloadOnGet } from "../../../functions/api/download";
import { onRequestGet as searchOnGet } from "../../../functions/api/search";
import { onRequestPost as countsOnPost } from "../../../functions/api/counts";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const HOST = "http://drive.example.com";
const API_KEY = "fd_test_key_1234567890";
const KEYS_PREFIX = "_$flaredrive$/apikeys/";
const AUTH = basicAuthHeader("user", "pass");

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

async function download(bucket: InMemoryBucket, path: string, headers: Record<string, string> = {}) {
  const request = new Request(`${HOST}${path}`, {
    headers: { "X-Api-Key": API_KEY, ...headers },
  });
  return downloadOnGet(makeContext(request, makeEnv(bucket)));
}

async function search(bucket: InMemoryBucket, query: string) {
  const request = new Request(`${HOST}${query}`, {
    headers: { Authorization: AUTH },
  });
  return searchOnGet(makeContext(request, makeEnv(bucket)));
}

describe("download", () => {
  test("完整下载：Content-* 头齐全", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "a.txt", body: "ABCDEF", contentType: "text/plain" }]);

    const response = await download(bucket, "/api/download?path=a.txt");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="a.txt"; filename*=UTF-8\'\'a.txt'
    );
    expect(response.headers.get("Content-Length")).toBe("6");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("ETag")).toMatch(/^"[0-9a-f]{32}"$/);
    expect(response.headers.get("Last-Modified")).toBeTruthy();
    expect(await response.text()).toBe("ABCDEF");
  });

  test("中文文件名走 filename*=UTF-8'' 百分号编码", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "docs/日记.txt", body: "X" }]);
    const response = await download(bucket, "/api/download?path=docs%2F%E6%97%A5%E8%AE%B0.txt");
    const disposition = response.headers.get("Content-Disposition") || "";
    // basename 只取最后一段；filename= 走 Latin-1 兜底（CJK 替换 "_"），原始名在 filename*
    expect(disposition).toBe(
      'attachment; filename="__.txt"; filename*=UTF-8\'\'%E6%97%A5%E8%AE%B0.txt'
    );
  });

  test("Range 请求返回 206 + Content-Range（offset/suffix）", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "a.txt", body: "ABCDEF" }]);

    const mid = await download(bucket, "/api/download?path=a.txt", { Range: "bytes=1-3" });
    expect(mid.status).toBe(206);
    expect(mid.headers.get("Content-Range")).toBe("bytes 1-3/6");
    expect(mid.headers.get("Content-Length")).toBe("3");
    expect(await mid.text()).toBe("BCD");

    const suffix = await download(bucket, "/api/download?path=a.txt", { Range: "bytes=-2" });
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get("Content-Range")).toBe("bytes 4-5/6");
    expect(await suffix.text()).toBe("EF");

    const openEnd = await download(bucket, "/api/download?path=a.txt", { Range: "bytes=2-" });
    expect(openEnd.status).toBe(206);
    expect(openEnd.headers.get("Content-Range")).toBe("bytes 2-5/6");
    expect(await openEnd.text()).toBe("CDEF");
  });

  test("非法/越界 Range 回退为全量 200", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "a.txt", body: "ABCDEF" }]);

    for (const range of ["bytes=zz", "bytes=100-", "bytes=5-2", "bytes=0-0,2-3"]) {
      const response = await download(bucket, "/api/download?path=a.txt", { Range: range });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ABCDEF");
    }
  });

  test("目录拒绝：显式结尾斜杠 / collection marker / 前缀目录", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/a.txt", body: "A" }]);
    bucket.seed([{ key: "vdir/inner.txt", body: "I" }]);

    const trailing = await download(bucket, "/api/download?path=docs%2F");
    expect(trailing.status).toBe(400);
    expect(await trailing.text()).toBe("不能下载目录，请逐个文件下载");

    const marker = await download(bucket, "/api/download?path=docs");
    expect(marker.status).toBe(400);

    const prefixOnly = await download(bucket, "/api/download?path=vdir");
    expect(prefixOnly.status).toBe(400);
    expect(await prefixOnly.text()).toBe("不能下载目录，请逐个文件下载");
  });

  test("参数校验：缺 path / 结尾斜杠 / 内部前缀；不存在是 404", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);

    const noPath = await download(bucket, "/api/download");
    expect(noPath.status).toBe(400);
    expect(await noPath.text()).toBe("缺少 path 参数");

    const slashOnly = await download(bucket, "/api/download?path=%2F");
    expect(slashOnly.status).toBe(400);

    const internal = await download(bucket, "/api/download?path=_$flaredrive$%2Fapikeys");
    expect(internal.status).toBe(400);

    const missing = await download(bucket, "/api/download?path=ghost.txt");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("文件不存在");
  });

  test("成功下载后 API key 的 lastUsedAt 被记录", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "a.txt", body: "A" }]);
    await download(bucket, "/api/download?path=a.txt");
    const record = bucket.rawJson<{ lastUsedAt: string | null }>(
      `${KEYS_PREFIX}testrecord.json`
    );
    expect(record?.lastUsedAt).toBeTruthy();
  });
});

describe("search", () => {
  test("无凭据是 401", async () => {
    const request = new Request(`${HOST}/api/search?q=x`);
    const response = await searchOnGet(makeContext(request, makeEnv(new InMemoryBucket())));
    expect(response.status).toBe(401);
  });

  test("空 q 返回空集", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await search(bucket, "/api/search?q=");
    expect(await response.json()).toEqual({ items: [], hasMore: false, nextCursor: undefined });
  });

  test("大小写不敏感匹配并带元数据；内部前缀排除", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "photos/Cat.txt", body: "C", contentType: "text/plain", customMetadata: { thumbnail: "t1" } },
      { key: "photos/dog.txt", body: "D" },
      { key: "_$flaredrive$/trash/cat.json", body: "{}" },
    ]);
    const response = await search(bucket, "/api/search?q=cat");
    const body = (await response.json()) as {
      items: Array<Record<string, unknown>>;
      hasMore: boolean;
    };
    expect(body.hasMore).toBe(false);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      key: "photos/Cat.txt",
      size: 1,
      contentType: "text/plain",
      thumbnail: "t1",
    });
    expect(Number.isFinite(Date.parse(body.items[0].uploaded as string))).toBe(true);
  });

  test("limit 语义：凑满后扫完当前页（同页命中可略多于 limit）；非法值回退 100", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "m1.txt", body: "1" },
      { key: "m2.txt", body: "2" },
      { key: "m3.txt", body: "3" },
      { key: "other.bin", body: "x" },
    ]);
    // 同一 R2 页内的 3 条命中全部返回（limit=2 只影响跨页停止）
    const limited = await search(bucket, "/api/search?q=m&limit=2");
    const limitedBody = (await limited.json()) as { items: unknown[]; hasMore: boolean };
    expect(limitedBody.items).toHaveLength(3);
    expect(limitedBody.hasMore).toBe(false);

    // limit 非数字 → 回退默认 100，同页 3 条命中全部返回
    const nan = await search(bucket, "/api/search?q=m&limit=abc");
    expect(((await nan.json()) as { items: unknown[] }).items).toHaveLength(3);
  });

  test("R2 分页触底时 hasMore=true 并给 cursor，跟随 cursor 扫完剩余", async () => {
    const bucket = new InMemoryBucket();
    // 105 个对象 > SCAN_PAGE(100)，命中的 1 条在前 100 内；
    // limit=0 验证下限钳制为 1
    const entries = Array.from({ length: 104 }, (_, i) => ({
      key: `pad-${String(i).padStart(3, "0")}.bin`,
      body: "x",
    }));
    entries.push({ key: "needle.txt", body: "N" });
    bucket.seed(entries);

    const first = await search(bucket, "/api/search?q=needle&limit=0");
    const firstBody = (await first.json()) as {
      items: Array<{ key: string }>;
      hasMore: boolean;
      nextCursor?: string;
    };
    expect(firstBody.items.map((item) => item.key)).toEqual(["needle.txt"]);
    expect(firstBody.hasMore).toBe(true);
    expect(typeof firstBody.nextCursor).toBe("string");

    const second = await search(
      bucket,
      `/api/search?q=needle&limit=1&cursor=${encodeURIComponent(firstBody.nextCursor!)}`
    );
    const secondBody = (await second.json()) as { items: unknown[]; hasMore: boolean };
    expect(secondBody.items).toEqual([]);
    expect(secondBody.hasMore).toBe(false);
  });

  test("无命中返回空集", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await search(bucket, "/api/search?q=zzz");
    expect(await response.json()).toEqual({ items: [], hasMore: false, nextCursor: undefined });
  });
});

describe("counts", () => {
  async function postCounts(bucket: InMemoryBucket, body: unknown) {
    const request = new Request(`${HOST}/api/counts`, {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return countsOnPost(makeContext(request, makeEnv(bucket)));
  }

  test("无凭据是 401；坏 JSON 是 400", async () => {
    const bucket = new InMemoryBucket();
    const noAuth = await countsOnPost(
      makeContext(new Request(`${HOST}/api/counts`, { method: "POST" }), makeEnv(bucket))
    );
    expect(noAuth.status).toBe(401);

    const bad = new Request(`${HOST}/api/counts`, {
      method: "POST",
      headers: { Authorization: AUTH },
      body: "{nope",
    });
    expect((await countsOnPost(makeContext(bad, makeEnv(bucket)))).status).toBe(400);
  });

  test("统计直接子项：对象（含目录标记）+ 分隔前缀，内部键排除", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    bucket.seed([
      { key: "docs/a.txt", body: "A" },
      { key: "docs/b.txt", body: "B" },
      { key: "docs/sub/inner.txt", body: "I" },
      { key: "docs/_$flaredrive$/hidden", body: "H" },
    ]);
    const response = await postCounts(bucket, { paths: ["docs", "ghost"] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { counts: Record<string, number> };
    // a.txt + b.txt + docs/sub/ 分隔前缀（sub 无 marker，虚拟目录）= 3；
    // 内部前缀对象与前缀都排除；ghost 目录不存在计 0
    expect(body.counts).toEqual({ docs: 3, ghost: 0 });
  });

  test("非数组 paths 返回空 counts；非法路径跳过；上限 100 条", async () => {
    const bucket = new InMemoryBucket();
    const notArray = await postCounts(bucket, { paths: "docs" });
    expect(await notArray.json()).toEqual({ counts: {} });

    const withInvalid = await postCounts(bucket, { paths: ["a/../b", ""] });
    expect(await withInvalid.json()).toEqual({ counts: {} });

    const many = Array.from({ length: 150 }, (_, i) => `d${i}`);
    const truncated = await postCounts(bucket, { paths: many });
    const body = (await truncated.json()) as { counts: Record<string, number> };
    expect(Object.keys(body.counts)).toHaveLength(100);
  });
});
