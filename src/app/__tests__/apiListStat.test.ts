/**
 * functions/api/list.ts + stat.ts 分支级直测：目录折叠（marker + 分隔前缀）、
 * 排序、内部前缀过滤、path 是文件/不存在分支、limit+cursor 单页透传、
 * limit 校验、stat 的 file/directory(marker|prefix)/404/400 分支。
 */
import {
  onRequestGet as listOnGet,
} from "../../../functions/api/list";
import {
  onRequestGet as statOnGet,
} from "../../../functions/api/stat";
import {
  InMemoryBucket,
  basicAuthHeader,
  makeContext,
} from "../testInMemoryBucket";

const HOST = "http://drive.example.com";
const API_KEY = "fd_test_key_1234567890";
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

function makeEnv(bucket: InMemoryBucket, extra: Record<string, unknown> = {}) {
  return { BUCKET: bucket.asBucket(), ...extra };
}

function authed(path: string): Request {
  return new Request(`${HOST}${path}`, {
    headers: { "X-Api-Key": API_KEY },
  });
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

async function listJson(bucket: InMemoryBucket, path: string) {
  const response = await listOnGet(
    makeContext(authed(path), makeEnv(bucket))
  );
  return response;
}

interface ApiItem {
  key: string;
  name: string;
  size: number;
  isDir: boolean;
  uploaded: string | null;
  updated: string | null;
  etag: string | null;
}

describe("list auth/参数校验", () => {
  test("缺少/无效 API key 是 401", async () => {
    const anonymous = await listOnGet(
      makeContext(
        new Request(`${HOST}/api/list`),
        makeEnv(new InMemoryBucket())
      )
    );
    expect(anonymous.status).toBe(401);

    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    const invalid = await listOnGet(
      makeContext(
        new Request(`${HOST}/api/list`, {
          headers: { "X-Api-Key": "fd_wrong" },
        }),
        makeEnv(bucket)
      )
    );
    expect(invalid.status).toBe(401);
  });

  test("path 含 .. 是 400；内部目录是 400", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    const dotDot = await listJson(bucket, "/api/list?path=docs/../etc");
    expect(dotDot.status).toBe(400);
    expect(await dotDot.text()).toBe("路径不合法");

    const internal = await listJson(bucket, "/api/list?path=_$flaredrive$");
    expect(internal.status).toBe(400);
    expect(await internal.text()).toBe("禁止访问内部目录");
  });

  test("limit 非法值是 400（0/非整数/超上限）", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    for (const limit of ["0", "abc", "2.5", "1001", "-3"]) {
      const response = await listJson(bucket, `/api/list?limit=${limit}`);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("limit");
    }
    const ok = await listJson(bucket, "/api/list?limit=1000");
    expect(ok.status).toBe(200);
  });
});

describe("list 目录折叠与排序", () => {
  test("根目录：文件条目字段完整，内部前缀被过滤", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([
      { key: "b.txt", body: "BBBB", contentType: "text/plain" },
      { key: "a.txt", body: "A", contentType: "text/plain" },
      { key: `${KEYS_PREFIX}hidden.json`, body: "{}", contentType: "application/json" },
    ]);
    const response = await listJson(bucket, "/api/list");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: ApiItem[]; nextCursor?: string };
    expect(body.nextCursor).toBeUndefined();
    expect(body.items.map((item) => item.name)).toEqual(["a.txt", "b.txt"]);
    const first = body.items[0];
    expect(first.key).toBe("a.txt");
    expect(first.isDir).toBe(false);
    expect(first.size).toBe(1);
    expect(first.etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect(Number.isFinite(Date.parse(first.uploaded ?? ""))).toBe(true);
    expect(first.updated).toBe(first.uploaded);
  });

  test("子目录：marker 与分隔前缀折叠为单条，目录排前且 size=0", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/a.txt", body: "A" }, { key: "docs/sub/inner.txt", body: "I" }]);
    bucket.seed([{ key: "z.txt", body: "Z" }]);

    const response = await listJson(bucket, "/api/list?path=docs");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: ApiItem[] };
    // docs 直下：a.txt + sub（marker 对象与 sub/ 前缀折叠成同一条）；目录排在文件前
    expect(body.items.map((item) => item.name)).toEqual(["sub", "a.txt"]);
    const sub = body.items[0];
    expect(sub.isDir).toBe(true);
    expect(sub.size).toBe(0);
    expect(sub.key).toBe("docs/sub");
  });

  test("虚拟目录（只有前缀没有 marker）：isDir=true 且 uploaded=null", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "vdir/inner.txt", body: "I" }]);

    const response = await listJson(bucket, "/api/list?path=");
    const body = (await response.json()) as { items: ApiItem[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ key: "vdir", name: "vdir", isDir: true });
    expect(body.items[0].uploaded).toBeNull();
    expect(body.items[0].etag).toBeNull();
  });

  test("path 是文件是 400；不存在的目录是 404", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "plain.txt", body: "P" }]);

    const fileResponse = await listJson(bucket, "/api/list?path=plain.txt");
    expect(fileResponse.status).toBe(400);
    expect(await fileResponse.text()).toContain("/api/download");

    const missing = await listJson(bucket, "/api/list?path=ghost");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("目录不存在");
  });

  test("嵌套路径列目录：folder 前缀拼进 key", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/deep.txt", body: "D" }]);

    const response = await listJson(bucket, "/api/list?path=docs/");
    const body = (await response.json()) as { items: ApiItem[] };
    expect(body.items.map((item) => item.key)).toEqual(["docs/deep.txt"]);
    expect(body.items[0].name).toBe("deep.txt");
  });
});

describe("list 分页（limit + cursor 单页透传）", () => {
  test("limit 截断给 nextCursor，跟随 cursor 取完剩余", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    const names = ["f1", "f2", "f3", "f4", "f5"];
    bucket.seed(names.map((n) => ({ key: `bulk/${n}.txt`, body: n })));
    // 文件放在 bulk/ 子目录，避免根分页把 API key 记录的前缀计入配额
    const page1 = await listJson(bucket, "/api/list?path=bulk&limit=2");
    const body1 = (await page1.json()) as { items: ApiItem[]; nextCursor?: string };
    expect(body1.items.map((item) => item.name)).toEqual(["f1.txt", "f2.txt"]);
    expect(typeof body1.nextCursor).toBe("string");

    const page2 = await listJson(
      bucket,
      `/api/list?path=bulk&limit=2&cursor=${encodeURIComponent(body1.nextCursor!)}`
    );
    const body2 = (await page2.json()) as { items: ApiItem[]; nextCursor?: string };
    expect(body2.items.map((item) => item.name)).toEqual(["f3.txt", "f4.txt"]);
    expect(typeof body2.nextCursor).toBe("string");

    const page3 = await listJson(
      bucket,
      `/api/list?path=bulk&limit=2&cursor=${encodeURIComponent(body2.nextCursor!)}`
    );
    const body3 = (await page3.json()) as { items: ApiItem[]; nextCursor?: string };
    expect(body3.items.map((item) => item.name)).toEqual(["f5.txt"]);
    expect(body3.nextCursor).toBeUndefined();
  });

  test("无 limit 时内部翻页聚合全部（不透传 cursor）", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed(
      Array.from({ length: 7 }, (_, i) => ({ key: `f${i + 1}.txt`, body: "x" }))
    );
    const response = await listJson(bucket, "/api/list");
    const body = (await response.json()) as { items: ApiItem[]; nextCursor?: string };
    expect(body.items).toHaveLength(7);
    expect(body.nextCursor).toBeUndefined();
  });
});

describe("stat", () => {
  test("文件：kind/size/etag/uploaded/contentType", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "docs/a.txt", body: "AAA", contentType: "text/plain" }]);

    const response = await statOnGet(
      makeContext(authed("/api/stat?path=docs/a.txt"), makeEnv(bucket))
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      key: "docs/a.txt",
      kind: "file",
      size: 3,
      contentType: "text/plain",
    });
    expect(body.etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect(Number.isFinite(Date.parse(body.uploaded as string))).toBe(true);
  });

  test("目录 marker：kind=directory marker=true", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seedDir("docs");
    const response = await statOnGet(
      makeContext(authed("/api/stat?path=docs/"), makeEnv(bucket))
    );
    expect(await response.json()).toEqual({ key: "docs", kind: "directory", marker: true });
  });

  test("前缀虚拟目录：kind=directory marker=false", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "vdir/inner.txt", body: "I" }]);
    const response = await statOnGet(
      makeContext(authed("/api/stat?path=vdir"), makeEnv(bucket))
    );
    expect(await response.json()).toEqual({ key: "vdir", kind: "directory", marker: false });
  });

  test("不存在是 404；缺少 path 是 400；内部目录是 400", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);

    const missing = await statOnGet(
      makeContext(authed("/api/stat?path=ghost"), makeEnv(bucket))
    );
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("文件不存在");

    const noPath = await statOnGet(
      makeContext(authed("/api/stat"), makeEnv(bucket))
    );
    expect(noPath.status).toBe(400);

    const internal = await statOnGet(
      makeContext(authed("/api/stat?path=_$flaredrive$/apikeys"), makeEnv(bucket))
    );
    expect(internal.status).toBe(400);
    expect(await internal.text()).toBe("禁止访问内部目录");
  });

  test("stat 仅接受 API key：Basic 会话是 401", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await statOnGet(
      makeContext(
        new Request(`${HOST}/api/stat?path=a.txt`, {
          headers: { Authorization: basicAuthHeader("user", "pass") },
        }),
        makeEnv(bucket, { WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass" })
      )
    );
    expect(response.status).toBe(401);
  });
});
