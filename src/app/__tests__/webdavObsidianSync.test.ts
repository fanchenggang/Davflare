/**
 * Obsidian Remotely Save（v0.5.x，webdav@5 客户端）兼容性回归。
 *
 * 按插件 fsWebdav.ts 实际发出的请求序列驱动 functions/webdav/protocol.ts：
 * - 初始化：PROPFIND Depth 0 判断库目录是否存在 → MKCOL 建库 → OPTIONS 读 DAV 头
 * - 「检查连接」：MKCOL 测试目录 → PUT 100B → PUT 200B 覆盖 → GET 比对 → DELETE 文件 → DELETE 目录
 * - 同步：逐层 PROPFIND Depth 1（默认 manual_1，BFS）列目录；上传 = PUT + PROPFIND Depth 0 stat；
 *   下载 = GET；删除 = DELETE；重命名 = 删除旧文件 + 上传新文件
 * 插件依赖 getlastmodified/getcontentlength/resourcetype 判断变更，所以文件 mtime 必须跨请求稳定。
 */
import { onRequest, type WebDavEnv } from "../../../functions/webdav/protocol";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const HOST = "https://drive.example.com";
const AUTH = basicAuthHeader("obsuser", "secret");
const VAULT = "我的 笔记库";
const enc = (path: string) => path.split("/").map(encodeURIComponent).join("/");

function env(bucket: InMemoryBucket): WebDavEnv {
  return { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "obsuser", WEBDAV_PASSWORD: "secret" };
}

// 与插件一致：每个请求都带 Cache-Control: no-cache
async function dav(
  bucket: InMemoryBucket,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: BodyInit
) {
  const request = new Request(`${HOST}/webdav/${enc(path)}`, {
    method,
    headers: { Authorization: AUTH, "Cache-Control": "no-cache", ...headers },
    body,
  });
  return onRequest(makeContext(request, env(bucket)));
}

type Entry = { href: string; name: string; lastmod: string; length: string; dir: boolean };

async function propfind(bucket: InMemoryBucket, path: string, depth: "0" | "1" | "infinity") {
  const response = await dav(bucket, "PROPFIND", path, { Depth: depth, "Content-Type": "application/xml" });
  const text = await response.text();
  // 服务端 DAV 元素带 d: 前缀；正则用可选前缀匹配，新旧输出都兼容。
  const entries: Entry[] = [...text.matchAll(/<(?:[\w-]+:)?response>([\s\S]*?)<\/(?:[\w-]+:)?response>/g)].map(([, block]) => {
    const href = block.match(/<(?:[\w-]+:)?href>([^<]*)<\/(?:[\w-]+:)?href>/)![1];
    const xmlDecoded = href.replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    return {
      href,
      name: decodeURIComponent(xmlDecoded),
      lastmod: block.match(/<(?:[\w-]+:)?getlastmodified>([^<]*)</)?.[1] ?? "",
      length: block.match(/<(?:[\w-]+:)?getcontentlength>([^<]*)</)?.[1] ?? "",
      dir: /<(?:[\w-]+:)?collection\s*\/>/.test(block),
    };
  });
  return { status: response.status, entries };
}

/** 插件默认 depth=manual_1：从库根开始逐层 Depth 1 BFS。 */
async function walk(bucket: InMemoryBucket) {
  const out: Entry[] = [];
  let queue = [VAULT];
  while (queue.length > 0) {
    const next: string[] = [];
    for (const folder of queue) {
      const { status, entries } = await propfind(bucket, folder, "1");
      expect(status).toBe(207);
      for (const entry of entries) {
        const rel = entry.name.replace(/^\/webdav\//, "").replace(/\/$/, "");
        if (rel === folder) continue;
        out.push(entry);
        if (entry.dir) next.push(rel);
      }
    }
    queue = next;
  }
  return out.map((e) => ({ ...e, key: e.name.replace(`/webdav/${VAULT}/`, "").replace(/\/$/, "") }));
}

describe("Obsidian Remotely Save compatibility", () => {
  test("init + 检查连接 sequence succeeds", async () => {
    const bucket = new InMemoryBucket();
    expect((await propfind(bucket, `${VAULT}/`, "0")).status).toBe(404);
    expect((await dav(bucket, "MKCOL", `${VAULT}/`)).status).toBe(201);
    expect((await propfind(bucket, `${VAULT}/`, "0")).status).toBe(207);
    const options = await dav(bucket, "OPTIONS", `${VAULT}/`);
    expect(options.headers.get("DAV")).toContain("1");

    const folder = `${VAULT}/rs-test-folder-abc/`;
    const file = `${VAULT}/rs-test-folder-abc/rs-test-file-abc`;
    expect((await dav(bucket, "MKCOL", folder)).status).toBe(201);
    expect((await dav(bucket, "PUT", file, { "Content-Type": "application/octet-stream" }, new Uint8Array(100).buffer)).status).toBe(201);
    expect((await dav(bucket, "PUT", file, { "Content-Type": "application/octet-stream" }, new Uint8Array(200).fill(7).buffer)).status).toBe(204);
    const stat = await propfind(bucket, file, "0");
    expect(stat.entries[0].length).toBe("200");
    const got = new Uint8Array(await (await dav(bucket, "GET", file)).arrayBuffer());
    expect(got.length).toBe(200);
    expect(got[199]).toBe(7);
    expect((await dav(bucket, "DELETE", file)).status).toBe(204);
    expect((await dav(bucket, "DELETE", folder)).status).toBe(204);
    expect((await propfind(bucket, folder, "0")).status).toBe(404);
  });

  test("vault with Chinese names, spaces, special chars, nested and empty folders round-trips via Depth 1 walk", async () => {
    const bucket = new InMemoryBucket();
    await dav(bucket, "MKCOL", `${VAULT}/`);
    for (const dir of ["日记", "日记/2026", "附件", "空目录", "special"]) {
      expect((await dav(bucket, "MKCOL", `${VAULT}/${dir}/`)).status).toBe(201);
    }
    const files: Record<string, string> = {
      "欢迎.md": "# 欢迎",
      "日记/2026/10月 第1周.md": "周一",
      "附件/截图 1.png": "png-bytes",
      "附件/论文 (final).pdf": "%PDF-1.4",
      "special/a+b & c's 100% #1.md": "special",
      "emoji 🎉 笔记.md": "emoji",
    };
    for (const [key, content] of Object.entries(files)) {
      const put = await dav(bucket, "PUT", `${VAULT}/${key}`, { "Content-Type": "application/octet-stream" }, new TextEncoder().encode(content).buffer);
      expect(put.status).toBe(201);
    }

    const listed = await walk(bucket);
    const keys = listed.map((e) => (e.dir ? `${e.key}/` : e.key)).sort();
    expect(keys).toEqual(
      ["欢迎.md", "日记/", "日记/2026/", "日记/2026/10月 第1周.md", "附件/", "附件/截图 1.png", "附件/论文 (final).pdf", "空目录/", "special/", "special/a+b & c's 100% #1.md", "emoji 🎉 笔记.md"].sort()
    );
    // href 必须 percent-encode（不能出现原始中文/空格/#/%），目录以 / 结尾
    for (const entry of listed) {
      expect(entry.href).not.toMatch(/[^\x21-\x7e]/);
      expect(entry.href).not.toMatch(/#|%(?![0-9A-F]{2})/);
      expect(entry.href.endsWith("/")).toBe(entry.dir);
    }
    // Depth infinity 与逐层 Depth 1 结果一致（插件 manual_infinity 模式）
    const infinity = await propfind(bucket, VAULT, "infinity");
    expect(infinity.entries.length - 1).toBe(listed.length);

    // 附件按扩展名补了类型，网页端可以预览
    expect((await bucket.asBucket().head("我的 笔记库/附件/截图 1.png"))?.httpMetadata?.contentType).toBe("image/png");
    expect((await bucket.asBucket().head("我的 笔记库/附件/论文 (final).pdf"))?.httpMetadata?.contentType).toBe("application/pdf");

    // 下载内容一致
    for (const [key, content] of Object.entries(files)) {
      expect(await (await dav(bucket, "GET", `${VAULT}/${key}`)).text()).toBe(content);
    }
  });

  test("file mtime/size are stable across listings so a second sync is a no-op", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-06T08:00:00Z"));
      const bucket = new InMemoryBucket();
      await dav(bucket, "MKCOL", `${VAULT}/`);
      await dav(bucket, "MKCOL", `${VAULT}/日记/`);
      await dav(bucket, "PUT", `${VAULT}/日记/a.md`, {}, "a");
      const first = await walk(bucket);
      vi.setSystemTime(new Date("2026-10-06T09:30:00Z"));
      const second = await walk(bucket);
      const files = (list: typeof first) => list.filter((e) => !e.dir).map((e) => [e.key, e.lastmod, e.length]);
      expect(files(second)).toEqual(files(first));
      expect(files(first)[0][1]).toBe("Tue, 06 Oct 2026 08:00:00 GMT");
    } finally {
      vi.useRealTimers();
    }
  });

  test("delete, rename-as-delete+upload, folder rename and MOVE with encoded Destination", async () => {
    const bucket = new InMemoryBucket();
    await dav(bucket, "MKCOL", `${VAULT}/`);
    await dav(bucket, "MKCOL", `${VAULT}/附件/`);
    await dav(bucket, "PUT", `${VAULT}/附件/截图 1.png`, {}, "png");
    await dav(bucket, "PUT", `${VAULT}/旧 名字.md`, {}, "body");

    // 插件的重命名：上传新路径 + 删除旧路径
    expect((await dav(bucket, "PUT", `${VAULT}/新 名字.md`, {}, "body")).status).toBe(201);
    expect((await dav(bucket, "DELETE", `${VAULT}/旧 名字.md`)).status).toBe(204);
    // 目录改名：新目录 MKCOL + 上传 + 删除旧文件 + 删除旧目录
    expect((await dav(bucket, "MKCOL", `${VAULT}/attachments 附件/`)).status).toBe(201);
    expect((await dav(bucket, "PUT", `${VAULT}/attachments 附件/截图 1.png`, {}, "png")).status).toBe(201);
    expect((await dav(bucket, "DELETE", `${VAULT}/附件/截图 1.png`)).status).toBe(204);
    expect((await dav(bucket, "DELETE", `${VAULT}/附件/`)).status).toBe(204);
    // 删除不存在的文件：404（插件吞掉错误继续）
    expect((await dav(bucket, "DELETE", `${VAULT}/不存在.md`)).status).toBe(404);

    const keys = (await walk(bucket)).map((e) => (e.dir ? `${e.key}/` : e.key)).sort();
    expect(keys).toEqual(["attachments 附件/", "attachments 附件/截图 1.png", "新 名字.md"].sort());

    // 插件 rename() 走 MOVE：Destination 是 percent-encoded 绝对 URL
    const move = await dav(bucket, "MOVE", `${VAULT}/新 名字.md`, {
      Destination: `${HOST}/webdav/${enc(`${VAULT}/attachments 附件/移动后 (1).md`)}`,
    });
    expect(move.status).toBe(201);
    expect(bucket.rawText("我的 笔记库/attachments 附件/移动后 (1).md")).toBe("body");
  });

  test("trailing-slash variants behave as the plugin expects", async () => {
    const bucket = new InMemoryBucket();
    await dav(bucket, "MKCOL", `${VAULT}/`);
    // 目录 PROPFIND 有无尾斜杠都可以
    expect((await propfind(bucket, VAULT, "1")).status).toBe(207);
    expect((await propfind(bucket, `${VAULT}/`, "1")).status).toBe(207);
    // MKCOL 无尾斜杠可建，重复建 405
    expect((await dav(bucket, "MKCOL", `${VAULT}/sub`)).status).toBe(201);
    expect((await dav(bucket, "MKCOL", `${VAULT}/sub/`)).status).toBe(405);
    // 父目录不存在时 PUT 409（插件会先逐级 MKCOL）
    expect((await dav(bucket, "PUT", `${VAULT}/missing/a.md`, {}, "x")).status).toBe(409);
    // 文件路径带尾斜杠的 PUT 405
    expect((await dav(bucket, "PUT", `${VAULT}/a.md/`, {}, "x")).status).toBe(405);
    // 不支持的 Depth 明确拒绝
    expect((await propfind(bucket, VAULT, "2" as "1")).status).toBe(400);
  });
});
