/**
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
}
interface LocalEntry {
  name: string;
  flags: number;
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
    central.push({ name, madeByHost, flags, unixMode: external >>> 16 });

    expect(u32(bytes, localOffset)).toBe(0x04034b50);
    const lNameLen = u16(bytes, localOffset + 26);
    local.push({
      name: decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + lNameLen)),
      flags: u16(bytes, localOffset + 6),
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

function seedChinese(bucket: InMemoryBucket) {
  bucket.seed([
    { key: "资料", body: "", contentType: "application/x-directory" },
    { key: "资料/测试文件.txt", body: "你好", contentType: "text/plain" },
    { key: "资料/子目录", body: "", contentType: "application/x-directory" },
    { key: "资料/子目录/说明.md", body: "# 说明", contentType: "text/markdown" },
    { key: "资料/空目录", body: "", contentType: "application/x-directory" },
    { key: "资料/readme.txt", body: "ascii", contentType: "text/plain" },
  ]);
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
