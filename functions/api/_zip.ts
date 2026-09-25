import { Zip, ZipPassThrough } from "fflate";
import { decodeRawPath } from "./_apikey";

// 把选中键（文件或目录）打包为 zip 流。目录递归收齐后代，空目录写占位条目。
// archive（会话 Basic + API Key）与 share（目录分享）共用；MCP zip 经 archive 同样走这里。

/** PKZIP APPNOTE 4.4.2.2：made-by 主机 3 = Unix。 */
export const ZIP_OS_UNIX = 3;
/** 外部属性高 16 位是 Unix mode：普通文件 0644；目录 0755 且带 MS-DOS 目录位 0x10。 */
export const ZIP_FILE_ATTRS = ((0o100644 << 16) >>> 0);
export const ZIP_DIR_ATTRS = (((0o040755 << 16) | 0x10) >>> 0);

/** Info-ZIP extended timestamp extra field（APPNOTE 4.6 / Info-ZIP extrafld.txt）："UT"。 */
export const ZIP_EXTRA_EXT_TIMESTAMP = 0x5455;

/**
 * 0x5455 数据体：flags(1B, bit0 = 含 mtime) + mtime(4B LE, Unix UTC 秒)。
 * 只写 mtime 时本地头与中央目录两种变体字节完全相同（中央目录规定只能带 flags + mtime），
 * 因此可直接交给 fflate（它把同一份 extra 写进两处）。
 */
export function extendedTimestampExtra(mtime: Date): Uint8Array {
  const data = new Uint8Array(5);
  data[0] = 0x01;
  new DataView(data.buffer).setUint32(1, Math.floor(mtime.getTime() / 1000) >>> 0, true);
  return data;
}

/** DOS 时间只能表示 1980–2107（fflate 限 2099）；无效/越界时间回退为当前时间，避免 fflate 抛错。 */
function entryTime(value: Date | string | number | undefined | null): Date {
  const date = value == null ? new Date() : new Date(value);
  const year = date.getUTCFullYear();
  if (Number.isNaN(date.getTime()) || year < 1981 || year > 2098) return new Date();
  return date;
}

/**
 * 统一创建 zip 条目：
 * - #119：fflate 默认 made-by = 0（MS-DOS），Info-ZIP `unzip` 遇到 DOS 来源会忽略 UTF-8 标志（bit 11）
 *   按 CP437 解码，中文名乱码。标记为 Unix 并给出 Unix 权限（否则 mode 为 0，解压出的文件无任何权限）。
 *   非 ASCII 文件名时 fflate 自动置 bit 11。
 * - #121：条目时间用对象上传时间。DOS 时间字段无时区，Workers 运行在 UTC，故 DOS 时间即 UTC
 *   （不支持扩展字段的工具的兜底）；同时写 0x5455 扩展时间戳（UTC 秒），unzip / zipinfo / 7-Zip /
 *   macOS 等据此按本地时区正确显示。
 */
export function createZipEntry(name: string, mtime?: Date | string | number | null): ZipPassThrough {
  const entry = new ZipPassThrough(name);
  const time = entryTime(mtime);
  entry.os = ZIP_OS_UNIX;
  entry.attrs = name.endsWith("/") ? ZIP_DIR_ATTRS : ZIP_FILE_ATTRS;
  entry.mtime = time;
  entry.extra = { [ZIP_EXTRA_EXT_TIMESTAMP]: extendedTimestampExtra(time) };
  return entry;
}

export async function listAllObjects(
  bucket: R2Bucket,
  prefix: string
): Promise<R2Object[]> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({
      prefix,
      cursor,
      include: ["httpMetadata"],
    });
    objects.push(...listing.objects);
    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (true);
  return objects;
}

export async function buildZipStream(
  bucket: R2Bucket,
  selectedKeys: string[],
  options: { stripPrefix?: string } = {}
): Promise<ReadableStream<Uint8Array>> {
  const stripPrefix = options.stripPrefix?.replace(/\/$/, "") ?? null;
  const rel = (key: string) =>
    stripPrefix && key.startsWith(`${stripPrefix}/`)
      ? key.slice(stripPrefix.length + 1)
      : key;

  const fileKeys = new Set<string>();
  const objectSet = new Map<string, R2Object>();
  // 空目录条目名 → 目录标记的上传时间（没有标记对象时为 undefined，回退为当前时间）
  const emptyDirNames = new Map<string, Date | undefined>();

  for (const rawKey of selectedKeys) {
    // 使用与 API 鉴权层一致的 decodeRawPath（内部已 try/catch），
    // 避免对真实文件名里的字面量 `%`（如 100%.txt）二次 decode 时抛 URIError。
    const key = decodeRawPath(rawKey).replace(/\/$/, "");
    if (!key) continue;

    const head = await bucket.head(key);
    const isExplicitDir =
      head?.httpMetadata?.contentType === "application/x-directory";

    const descendants = await listAllObjects(bucket, `${key}/`);
    if (descendants.length === 0) {
      if (isExplicitDir) {
        emptyDirNames.set(`${rel(key)}/`, head?.uploaded);
      } else if (head !== null) {
        fileKeys.add(key);
      }
      continue;
    }

    for (const object of descendants) {
      if (object.key.startsWith("_$flaredrive$/")) continue;
      objectSet.set(object.key, object);
    }
  }

  // 区分文件与目录占位：有子对象的是目录。同时覆盖未写
  // application/x-directory content-type 的工具建出的目录。
  for (const [key, object] of objectSet) {
    const hasChildren = [...objectSet.keys()].some((candidate) =>
      candidate.startsWith(`${key}/`)
    );
    if (hasChildren) continue;
    if (object.httpMetadata?.contentType === "application/x-directory") {
      emptyDirNames.set(`${rel(key)}/`, object.uploaded);
    } else {
      fileKeys.add(key);
    }
  }

  return new ReadableStream({
    start(controller) {
      const zip = new Zip((error, data, final) => {
        if (error) {
          controller.error(error);
          return;
        }
        if (data) controller.enqueue(data);
        if (final) controller.close();
      });

      (async () => {
        try {
          for (const [name, uploaded] of emptyDirNames) {
            const entry = createZipEntry(name, uploaded);
            zip.add(entry);
            entry.push(new Uint8Array(0), true);
          }

          for (const key of fileKeys) {
            const object = await bucket.get(key);
            if (!object || !("body" in object)) continue;
            const entry = createZipEntry(rel(key), object.uploaded);
            zip.add(entry);
            const reader = object.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              entry.push(value, false);
            }
            entry.push(new Uint8Array(0), true);
          }
          zip.end();
        } catch (error) {
          controller.error(error);
        }
      })();
    },
  });
}
