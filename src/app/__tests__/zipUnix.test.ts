/**
 * #121：每个条目带 0x5455 扩展时间戳（UTC 秒 = 对象上传时间），本地头与中央目录都有。
 * #119：zip 条目 made-by 必须是 Unix（3），否则 Info-ZIP `unzip` 忽略 UTF-8 标志按 CP437 解码中文名。
 * 直接解析 functions/api/_zip.ts 产出的字节：中央目录 made-by 主机字节 = 3、通用标志 bit 11（UTF-8）、
 * 外部属性里的 Unix mode；并覆盖 GET/POST /api/archive 的 zip 名与条目相对路径。
 */
import { ReadableStream } from "stream/web";
(globalThis as any).ReadableStream =
  (globalThis as any).ReadableStream ?? ReadableStream;

import { unzipSync } from "fflate";
import {
  buildZipStream,
  createZipEntry,
  extendedTimestampExtra,
  ZIP_EXTRA_EXT_TIMESTAMP,
  ZIP_DIR_ATTRS,
  ZIP_FILE_ATTRS,
  ZIP_OS_UNIX,
} from "../../../functions/api/_zip";
import { onRequestGet, onRequestPost } from "../../../functions/api/archive";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const HOST = "http://drive.example.com";
const AUTH = basicAuthHeader("user", "pass");

interface CentralEntry {
  name: string;
  madeByHost: number;
  flags: number;
  unixMode: number;
  dosTime: number;
  dosDate: number;
  extra: Map<number, Uint8Array>;
}
interface LocalEntry {
  name: string;
  flags: number;
  extra: Map<number, Uint8Array>;
}

/** 解析 extra 区：[id u16][len u16][data]… */
function parseExtra(b: Uint8Array): Map<number, Uint8Array> {
  const fields = new Map<number, Uint8Array>();
  let p = 0;
  while (p + 4 <= b.length) {
    const id = b[p] | (b[p + 1] << 8);
    const len = b[p + 2] | (b[p + 3] << 8);
    fields.set(id, b.subarray(p + 4, p + 4 + len));
    p += 4 + len;
  }
  expect(p).toBe(b.length);
  return fields;
}

function u16(b: Uint8Array, o: number) {
  return b[o] | (b[o + 1] << 8);
}
function u32(b: Uint8Array, o: number) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

/** 解析中央目录（从 EOCD 定位）与本地文件头。 */
function parseZip(bytes: Uint8Array): { central: CentralEntry[]; local: LocalEntry[] } {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("EOCD not found");
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const central: CentralEntry[] = [];
  const local: LocalEntry[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    expect(u32(bytes, p)).toBe(0x02014b50);
    const madeByHost = bytes[p + 5];
    const flags = u16(bytes, p + 8);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const external = u32(bytes, p + 38);
    const localOffset = u32(bytes, p + 42);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    central.push({
      name,
      madeByHost,
      flags,
      unixMode: external >>> 16,
      dosTime: u16(bytes, p + 12),
      dosDate: u16(bytes, p + 14),
      extra: parseExtra(bytes.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen)),
    });

    expect(u32(bytes, localOffset)).toBe(0x04034b50);
    const lNameLen = u16(bytes, localOffset + 26);
    const lExtraLen = u16(bytes, localOffset + 28);
    const lNameEnd = localOffset + 30 + lNameLen;
    local.push({
      name: decoder.decode(bytes.subarray(localOffset + 30, lNameEnd)),
      flags: u16(bytes, localOffset + 6),
      extra: parseExtra(bytes.subarray(lNameEnd, lNameEnd + lExtraLen)),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { central, local };
}

async function readAll(stream: globalThis.ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const UTF8_FLAG = 0x0800;

// 各对象上传时间不同，便于断言条目时间取自对象本身（而非打包时刻）
const UPLOADED: Record<string, Date> = {
  "测试文件.txt": new Date("2026-09-25T06:09:30.000Z"), // 北京时间 14:09:30
  "子目录/说明.md": new Date("2025-01-02T03:04:06.000Z"),
  "空目录/": new Date("2024-12-31T16:00:00.000Z"),
  "readme.txt": new Date("2026-03-01T00:00:00.000Z"),
};

function seedChinese(bucket: InMemoryBucket) {
  bucket.seed([
    { key: "资料", body: "", contentType: "application/x-directory" },
    { key: "资料/测试文件.txt", body: "你好", contentType: "text/plain", uploaded: UPLOADED["测试文件.txt"] },
    { key: "资料/子目录", body: "", contentType: "application/x-directory" },
    { key: "资料/子目录/说明.md", body: "# 说明", contentType: "text/markdown", uploaded: UPLOADED["子目录/说明.md"] },
    { key: "资料/空目录", body: "", contentType: "application/x-directory", uploaded: UPLOADED["空目录/"] },
    { key: "资料/readme.txt", body: "ascii", contentType: "text/plain", uploaded: UPLOADED["readme.txt"] },
  ]);
}

/** 0x5455 → mtime（Unix 秒）；断言只含 mtime（flags=1，共 5 字节）。 */
function utMtime(extra: Map<number, Uint8Array>): number {
  const ut = extra.get(0x5455);
  expect(ut).toBeDefined();
  expect(ut!.length).toBe(5);
  expect(ut![0]).toBe(0x01);
  return u32(ut!, 1);
}

describe("#119 zip entries are Unix-made with UTF-8 names", () => {
  test("createZipEntry sets os=3 and Unix modes", () => {
    const file = createZipEntry("测试文件.txt");
    const dir = createZipEntry("子目录/");
    expect(file.os).toBe(ZIP_OS_UNIX);
    expect(dir.os).toBe(ZIP_OS_UNIX);
    expect(file.attrs! >>> 16).toBe(0o100644);
    expect(dir.attrs! >>> 16).toBe(0o040755);
    expect(dir.attrs! & 0x10).toBe(0x10);
    expect(ZIP_FILE_ATTRS).toBeGreaterThan(0);
    expect(ZIP_DIR_ATTRS).toBeGreaterThan(0);
  });

  test("buildZipStream: made-by host 3, UTF-8 flag on non-ASCII names, Unix modes", async () => {
    const bucket = new InMemoryBucket();
    seedChinese(bucket);
    const bytes = await readAll(
      (await buildZipStream(bucket.asBucket(), ["资料"], { stripPrefix: "资料" })) as any
    );
    const { central, local } = parseZip(bytes);
    const names = central.map((e) => e.name).sort();
    expect(names).toEqual(["readme.txt", "子目录/说明.md", "测试文件.txt", "空目录/"].sort());

    for (const entry of central) {
      expect(entry.madeByHost).toBe(3);
      expect(entry.unixMode).toBe(entry.name.endsWith("/") ? 0o040755 : 0o100644);
      if (/[^\x00-\x7f]/.test(entry.name)) expect(entry.flags & UTF8_FLAG).toBe(UTF8_FLAG);
    }
    for (const entry of local) {
      if (/[^\x00-\x7f]/.test(entry.name)) expect(entry.flags & UTF8_FLAG).toBe(UTF8_FLAG);
    }

    // 内容完整可解
    const files = unzipSync(bytes);
    expect(new TextDecoder().decode(files["测试文件.txt"])).toBe("你好");
    expect(new TextDecoder().decode(files["子目录/说明.md"])).toBe("# 说明");
  });

  test("#121 每个条目都有 0x5455 扩展时间戳 = 对象上传时间（本地头 + 中央目录）", async () => {
    const bucket = new InMemoryBucket();
    seedChinese(bucket);
    const bytes = await readAll(
      (await buildZipStream(bucket.asBucket(), ["资料"], { stripPrefix: "资料" })) as any
    );
    const { central, local } = parseZip(bytes);
    expect(central).toHaveLength(4);
    for (const entry of central) {
      const expected = Math.floor(UPLOADED[entry.name].getTime() / 1000);
      expect(utMtime(entry.extra)).toBe(expected);
      const lh = local.find((l) => l.name === entry.name)!;
      expect(utMtime(lh.extra)).toBe(expected);
      // DOS 时间与 0x5455 同一时刻（按运行时本地时区编码；Workers 上即 UTC）
      const d = new Date(UPLOADED[entry.name]);
      expect(entry.dosDate).toBe(((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
      expect(entry.dosTime).toBe((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1));
    }
    // fflate 解包仍正常（extra 结构合法）
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual(Object.keys(UPLOADED).sort());
  });

  test("#121 extendedTimestampExtra 编码 / createZipEntry 越界时间回退为当前时间", () => {
    const at = new Date("2026-09-25T06:09:30.999Z");
    const data = extendedTimestampExtra(at);
    expect(Array.from(data.subarray(0, 1))).toEqual([1]);
    expect(u32(data, 1)).toBe(Math.floor(at.getTime() / 1000));
    expect(ZIP_EXTRA_EXT_TIMESTAMP).toBe(0x5455);

    const before = Math.floor(Date.now() / 1000);
    for (const bad of [new Date("1970-01-01T00:00:00Z"), "not-a-date", undefined]) {
      const entry = createZipEntry("x.txt", bad as any);
      const secs = u32(entry.extra![0x5455], 1);
      expect(secs).toBeGreaterThanOrEqual(before);
      expect(secs).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
    }
  });

  test("GET /api/archive?path=<中文目录>/ → <目录名>.zip，条目相对该目录，made-by Unix", async () => {
    const bucket = new InMemoryBucket();
    seedChinese(bucket);
    const response = await onRequestGet(
      makeContext(
        new Request(`${HOST}/api/archive?path=${encodeURIComponent("资料/")}`, {
          headers: { Authorization: AUTH },
        }),
        { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass" }
      )
    );
    expect(response.status).toBe(200);
    const disposition = response.headers.get("Content-Disposition")!;
    expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent("资料.zip")}`);
    expect(disposition).toContain('filename="__.zip"');
    const { central } = parseZip(new Uint8Array(await response.arrayBuffer()));
    expect(central.every((e) => e.madeByHost === 3)).toBe(true);
    expect(central.some((e) => e.name.startsWith("资料/"))).toBe(false);
    expect(central.map((e) => e.name)).toContain("子目录/说明.md");
  });

  test("POST /api/archive 带 base：条目相对 base，zip 名 <base 名>.zip", async () => {
    const bucket = new InMemoryBucket();
    seedChinese(bucket);
    const response = await onRequestPost(
      makeContext(
        new Request(`${HOST}/api/archive`, {
          method: "POST",
          headers: { Authorization: AUTH, "Content-Type": "application/json" },
          body: JSON.stringify({ keys: ["资料/测试文件.txt", "资料/子目录/"], base: "资料/" }),
        }),
        { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass" }
      )
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain(
      `filename*=UTF-8''${encodeURIComponent("资料.zip")}`
    );
    const { central } = parseZip(new Uint8Array(await response.arrayBuffer()));
    expect(central.map((e) => e.name).sort()).toEqual(["子目录/说明.md", "测试文件.txt"].sort());
    expect(central.every((e) => e.madeByHost === 3)).toBe(true);
  });

  test("POST /api/archive 不带 base：保持完整路径 + archive.zip（兼容旧客户端）", async () => {
    const bucket = new InMemoryBucket();
    seedChinese(bucket);
    const response = await onRequestPost(
      makeContext(
        new Request(`${HOST}/api/archive`, {
          method: "POST",
          headers: { Authorization: AUTH, "Content-Type": "application/json" },
          body: JSON.stringify({ keys: ["资料/测试文件.txt"] }),
        }),
        { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass" }
      )
    );
    expect(response.headers.get("Content-Disposition")).toContain('filename="archive.zip"');
    const { central } = parseZip(new Uint8Array(await response.arrayBuffer()));
    expect(central.map((e) => e.name)).toEqual(["资料/测试文件.txt"]);
  });

  test("POST /api/archive 拒绝非字符串或内部目录 base", async () => {
    const bucket = new InMemoryBucket();
    seedChinese(bucket);
    const env = { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass" };
    for (const base of [123, "_$flaredrive$/trash"]) {
      const response = await onRequestPost(
        makeContext(
          new Request(`${HOST}/api/archive`, {
            method: "POST",
            headers: { Authorization: AUTH, "Content-Type": "application/json" },
            body: JSON.stringify({ keys: ["资料/测试文件.txt"], base }),
          }),
          env
        )
      );
      expect(response.status).toBe(400);
    }
  });
});
