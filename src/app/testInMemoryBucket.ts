/**
 * 测试用 R2Bucket 内存实现（R2 语义尽量忠实）。
 *
 * 仅模拟 functions/ 实际用到的 API 面：
 * - head/get/put/delete（含 onlyIf 条件、Range 切片、Headers 形式的 httpMetadata）
 * - list（prefix/cursor/limit/delimiter/include；键按 UTF-8 字典序；
 *   cursor 从上次截断处续传；delimiter 聚合 delimitedPrefixes）
 * - multipart：createMultipartUpload / resumeMultipartUpload / uploadPart /
 *   complete / abort（R2 语义：uploadPart 对顺序宽松、partNumber 1..10000、
 *   未知 uploadId 懒失败；complete 要求升序且分块已上传、etag 匹配）
 *
 * 简化点（有意为之，不影响被测逻辑）：
 * - 不做版本/checksums/md5 校验
 * - complete 不强制除末块外 ≥5MiB（测试分块都是小体积；真实 R2 对单块上传豁免）
 * - body 为 Uint8Array（whatwg-fetch 测试环境无法流转真实 ReadableStream，
 *   R2ObjectBody 的其他消费方式 getReader/asyncIterator 由 buffer 直读）
 *
 * 注意：本文件不放在 __tests__（CRA 会把 __tests__ 下所有文件当测试套件），
 * 并已在 package.json 的 jest.collectCoverageFrom 中排除。
 */
import { ReadableStream as NodeReadableStream } from "stream/web";

const R2_PART_MAX = 10000;

interface StoredObject {
  key: string;
  bytes: Uint8Array;
  uploaded: Date;
  etag: string;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
}

interface MultipartState {
  key: string;
  uploadId: string;
  parts: Map<number, { etag: string; bytes: Uint8Array }>;
  finalized: boolean;
  aborted: boolean;
}

export interface SeedEntry {
  key: string;
  body?: string | Uint8Array;
  contentType?: string;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  uploaded?: Date;
  size?: number;
  etag?: string;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** R2 键序 = UTF-8 字节字典序（JS 默认排序是 UTF-16 码元序，对 ASCII 一致，这里显式对齐）。 */
function compareKeys(a: string, b: string): number {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  const len = Math.min(ba.length, bb.length);
  for (let i = 0; i < len; i++) {
    if (ba[i] !== bb[i]) return ba[i] - bb[i];
  }
  return ba.length - bb.length;
}

function toBytes(value: unknown): Uint8Array | null {
  if (value === null || value === undefined) return new Uint8Array(0);
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return null; // Blob / ReadableStream 交给 streamToBytes 异步处理
}

async function streamToBytes(value: unknown): Promise<Uint8Array> {
  const sync = toBytes(value);
  if (sync !== null) return sync;
  if (typeof (value as ReadableStream).getReader === "function") {
    const reader = (value as ReadableStream).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      if (chunk) {
        chunks.push(chunk);
        total += chunk.byteLength;
      }
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer());
  }
  throw new Error(
    "testInMemoryBucket: unsupported put value (not bytes/string/blob/stream)"
  );
}

function httpMetadataFromHeaders(headers: Headers): R2HTTPMetadata {
  const metadata: R2HTTPMetadata = {};
  const map: Array<[string, keyof R2HTTPMetadata]> = [
    ["content-type", "contentType"],
    ["content-language", "contentLanguage"],
    ["content-disposition", "contentDisposition"],
    ["content-encoding", "contentEncoding"],
    ["cache-control", "cacheControl"],
  ];
  for (const [headerName, field] of map) {
    const value = headers.get(headerName);
    if (value !== null) {
      (metadata as Record<string, unknown>)[field] = value;
    }
  }
  return metadata;
}

function normalizeHttpMetadata(
  input: R2HTTPMetadata | Headers | undefined
): R2HTTPMetadata | undefined {
  if (!input) return undefined;
  if (typeof (input as Headers).get === "function") {
    return httpMetadataFromHeaders(input as Headers);
  }
  return { ...(input as R2HTTPMetadata) };
}

function normalizeEtag(value: string): string {
  return value.trim().replace(/^W\//, "").replace(/^"|"$/g, "");
}

/** R2 onlyIf 语义：Headers 形式解析 if-match/if-none-match/if-(un)modified-since。 */
function evaluateOnlyIf(
  onlyIf: R2Conditional | Headers | undefined,
  object: StoredObject | undefined
): boolean {
  if (onlyIf === undefined || onlyIf === null) return true;
  let etagMatches: string | undefined;
  let etagDoesNotMatch: string | undefined;
  let uploadedBefore: Date | undefined;
  let uploadedAfter: Date | undefined;

  if (typeof (onlyIf as Headers).get === "function") {
    const headers = onlyIf as Headers;
    const ifMatch = headers.get("if-match");
    const ifNoneMatch = headers.get("if-none-match");
    const ifModifiedSince = headers.get("if-modified-since");
    const ifUnmodifiedSince = headers.get("if-unmodified-since");
    if (ifMatch !== null) etagMatches = ifMatch;
    if (ifNoneMatch !== null) etagDoesNotMatch = ifNoneMatch;
    if (ifModifiedSince !== null) {
      const ts = Date.parse(ifModifiedSince);
      if (Number.isFinite(ts)) uploadedAfter = new Date(ts);
    }
    if (ifUnmodifiedSince !== null) {
      const ts = Date.parse(ifUnmodifiedSince);
      if (Number.isFinite(ts)) uploadedBefore = new Date(ts);
    }
  } else {
    const condition = onlyIf as R2Conditional;
    etagMatches = condition.etagMatches;
    etagDoesNotMatch = condition.etagDoesNotMatch;
    uploadedBefore = condition.uploadedBefore;
    uploadedAfter = condition.uploadedAfter;
  }

  if (etagMatches !== undefined) {
    if (object === undefined) return false;
    if (etagMatches.trim() === "*") return true;
    const etag = normalizeEtag(etagMatches);
    if (etag !== object.etag && etag !== normalizeEtag(`"${object.etag}"`)) {
      return false;
    }
  }
  if (etagDoesNotMatch !== undefined) {
    if (etagDoesNotMatch.trim() === "*") {
      if (object !== undefined) return false;
    } else if (object !== undefined) {
      const etag = normalizeEtag(etagDoesNotMatch);
      if (etag === object.etag || etag === normalizeEtag(`"${object.etag}"`)) {
        return false;
      }
    }
  }
  if (uploadedBefore !== undefined && object !== undefined) {
    if (object.uploaded.getTime() >= uploadedBefore.getTime()) return false;
  }
  if (uploadedAfter !== undefined && object !== undefined) {
    if (object.uploaded.getTime() <= uploadedAfter.getTime()) return false;
  }
  return true;
}

/** 解析 Range 头为 R2Range；非法/多段范围抛错（R2 InvalidRange，HTTP 416 同类）。 */
function rangeFromHeaders(headers: Headers, size: number): R2Range | undefined {
  const raw = headers.get("range");
  if (raw === null) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(raw.trim());
  if (!match || (match[1] === "" && match[2] === "")) {
    throw new Error(`R2 InvalidRange: ${raw}`);
  }
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0) throw new Error("R2 InvalidRange: unsatisfiable suffix");
    return { suffix };
  }
  const offset = Number(match[1]);
  if (offset >= size) {
    throw new Error(`R2 InvalidRange: start ${offset} >= size ${size}`);
  }
  if (match[2] === "") return { offset };
  const end = Number(match[2]);
  if (end < offset) throw new Error(`R2 InvalidRange: ${raw}`);
  return { offset, length: end - offset + 1 };
}

function decodeCursor(cursor: string): string {
  try {
    return Buffer.from(cursor, "base64").toString("utf8");
  } catch {
    return "";
  }
}

export class InMemoryBucket {
  private objects = new Map<string, StoredObject>();
  private multiparts = new Map<string, MultipartState>();

  /** 用作 PagesFunction env.BUCKET 时的显式收口。 */
  asBucket(): R2Bucket {
    return this as unknown as R2Bucket;
  }

  /** 测试造数据：直接写入对象（目录标记用 seedDir / 给 contentType）。 */
  seed(entries: SeedEntry[]): void {
    for (const entry of entries) {
      const bytes =
        typeof entry.body === "string"
          ? new TextEncoder().encode(entry.body)
          : entry.body ?? new Uint8Array(0);
      const httpMetadata = normalizeHttpMetadata(
        entry.httpMetadata ??
          (entry.contentType ? { contentType: entry.contentType } : undefined)
      );
      this.objects.set(entry.key, {
        key: entry.key,
        bytes,
        uploaded: entry.uploaded ?? new Date("2026-01-01T00:00:00.000Z"),
        etag: entry.etag ?? randomHex(16),
        httpMetadata,
        customMetadata: entry.customMetadata
          ? { ...entry.customMetadata }
          : undefined,
      });
    }
  }

  /** 目录标记对象（0 字节 + x-directory），与 MKCOL/ensureFolders 写法一致。 */
  seedDir(key: string, uploaded?: Date): void {
    this.seed([
      {
        key,
        body: new Uint8Array(0),
        contentType: "application/x-directory",
        customMetadata: { resourcetype: "<collection />" },
        uploaded,
      },
    ]);
  }

  /** 测试断言辅助：读当前字节内容。 */
  rawBytes(key: string): Uint8Array | undefined {
    return this.objects.get(key)?.bytes;
  }

  rawText(key: string): string | undefined {
    const stored = this.objects.get(key);
    return stored ? new TextDecoder().decode(stored.bytes) : undefined;
  }

  rawJson<T = Record<string, unknown>>(key: string): T | undefined {
    const text = this.rawText(key);
    if (text === undefined || text.trim() === "") return undefined;
    return JSON.parse(text) as T;
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }

  async head(key: string): Promise<R2Object | null> {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return this.toR2Object(stored);
  }

  async get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  async get(
    key: string,
    options: R2GetOptions & { onlyIf: R2Conditional | Headers }
  ): Promise<R2ObjectBody | R2Object | null>;
  async get(
    key: string,
    options?: R2GetOptions & { onlyIf?: R2Conditional | Headers }
  ): Promise<R2ObjectBody | R2Object | null> {
    const stored = this.objects.get(key);
    if (!stored) return null;
    if (!evaluateOnlyIf(options?.onlyIf, stored)) {
      // R2：条件失败返回无 body 的 R2Object（HTTP 412 语义）
      return this.toR2Object(stored);
    }
    let range: R2Range | undefined;
    if (options?.range) {
      if (typeof (options.range as Headers).get === "function") {
        range = rangeFromHeaders(options.range as Headers, stored.bytes.length);
      } else {
        range = options.range as R2Range;
        if ("suffix" in range) {
          if (range.suffix === 0) {
            throw new Error("R2 InvalidRange: unsatisfiable suffix");
          }
        } else if ((range.offset ?? 0) >= stored.bytes.length) {
          throw new Error("R2 InvalidRange: unsatisfiable offset");
        }
      }
    }
    return this.toR2ObjectBody(stored, range);
  }

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: R2PutOptions
  ): Promise<R2Object>;
  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options: R2PutOptions & { onlyIf: R2Conditional | Headers }
  ): Promise<R2Object | null>;
  async put(
    key: string,
    value:
      | ReadableStream
      | ArrayBuffer
      | ArrayBufferView
      | string
      | null
      | Blob,
    options?: R2PutOptions & { onlyIf?: R2Conditional | Headers }
  ): Promise<R2Object | null> {
    const existing = this.objects.get(key);
    if (!evaluateOnlyIf(options?.onlyIf, existing)) {
      return null;
    }
    const bytes = await streamToBytes(value);
    const stored: StoredObject = {
      key,
      bytes,
      uploaded: new Date(),
      etag: randomHex(16),
      httpMetadata: normalizeHttpMetadata(options?.httpMetadata),
      customMetadata: options?.customMetadata
        ? { ...options.customMetadata }
        : undefined,
    };
    this.objects.set(key, stored);
    return this.toR2Object(stored);
  }

  async delete(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      this.objects.delete(key);
    }
  }

  async list(options: R2ListOptions = {}): Promise<R2Objects> {
    const {
      prefix,
      cursor,
      delimiter,
      limit,
      startAfter,
      include,
    } = options;
    const after =
      cursor !== undefined
        ? decodeCursor(cursor)
        : startAfter !== undefined
          ? startAfter
          : "";

    const allKeys = [...this.objects.keys()]
      .filter((key) => (prefix ? key.startsWith(prefix) : true))
      .filter((key) => compareKeys(key, after) > 0)
      .sort(compareKeys);

    const objects: R2Object[] = [];
    const delimitedPrefixes: string[] = [];
    const seenPrefixes = new Set<string>();
    const maxResults = limit ?? 1000;
    let truncated = false;
    let lastEmitted = "";

    for (const key of allKeys) {
      if (objects.length + delimitedPrefixes.length >= maxResults) {
        truncated = true;
        break;
      }
      let rolledPrefix: string | null = null;
      if (delimiter) {
        const rest = key.slice(prefix ? prefix.length : 0);
        const delimiterIndex = rest.indexOf(delimiter);
        if (delimiterIndex >= 0) {
          rolledPrefix =
            (prefix ?? "") + rest.slice(0, delimiterIndex + delimiter.length);
        }
      }
      if (rolledPrefix !== null) {
        if (!seenPrefixes.has(rolledPrefix)) {
          seenPrefixes.add(rolledPrefix);
          delimitedPrefixes.push(rolledPrefix);
          lastEmitted = rolledPrefix;
        } else {
          continue;
        }
      } else {
        objects.push(this.toR2Object(this.objects.get(key)!, include));
        lastEmitted = key;
      }
    }

    const result: R2Objects = truncated
      ? ({
          objects,
          delimitedPrefixes,
          truncated: true,
          cursor: Buffer.from(lastEmitted, "utf8").toString("base64"),
        } as R2Objects)
      : ({ objects, delimitedPrefixes, truncated: false } as R2Objects);
    return result;
  }

  async createMultipartUpload(
    key: string,
    options?: R2MultipartOptions
  ): Promise<R2MultipartUpload> {
    const uploadId = randomHex(16);
    this.multiparts.set(uploadId, {
      key,
      uploadId,
      parts: new Map(),
      finalized: false,
      aborted: false,
    });
    return this.makeMultipartHandle(
      key,
      uploadId,
      normalizeHttpMetadata(options?.httpMetadata),
      options?.customMetadata
    );
  }

  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload {
    return this.makeMultipartHandle(key, uploadId);
  }

  private getState(uploadId: string): MultipartState {
    const state = this.multiparts.get(uploadId);
    if (!state || state.aborted || state.finalized) {
      throw new Error(
        `R2 error: multipart upload not found or already closed (${uploadId})`
      );
    }
    return state;
  }

  private makeMultipartHandle(
    key: string,
    uploadId: string,
    httpMetadata?: R2HTTPMetadata,
    customMetadata?: Record<string, string>
  ): R2MultipartUpload {
    return {
      key,
      uploadId,
      uploadPart: async (
        partNumber: number,
        value: ReadableStream | (ArrayBuffer | ArrayBufferView) | string | Blob
      ): Promise<R2UploadedPart> => {
        // R2：未知 uploadId 在操作时懒失败（resume 不校验）
        const state = this.getState(uploadId);
        if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > R2_PART_MAX) {
          throw new Error(`R2 error: part number ${partNumber} out of range 1-${R2_PART_MAX}`);
        }
        const bytes = await streamToBytes(value);
        const etag = randomHex(16);
        state.parts.set(partNumber, { etag, bytes });
        return { partNumber, etag };
      },
      abort: async (): Promise<void> => {
        const state = this.multiparts.get(uploadId);
        if (!state || state.aborted || state.finalized) {
          throw new Error(`R2 error: multipart upload not found (${uploadId})`);
        }
        this.multiparts.delete(uploadId);
      },
      complete: async (uploadedParts: R2UploadedPart[]): Promise<R2Object> => {
        const state = this.getState(uploadId);
        if (!Array.isArray(uploadedParts) || uploadedParts.length === 0) {
          throw new Error("R2 error: no parts to complete");
        }
        for (let i = 0; i < uploadedParts.length; i++) {
          if (i > 0 && uploadedParts[i].partNumber <= uploadedParts[i - 1].partNumber) {
            throw new Error("R2 error: parts must be in ascending partNumber order");
          }
        }
        const bytesChunks: Uint8Array[] = [];
        let total = 0;
        for (const part of uploadedParts) {
          const storedPart = state.parts.get(part.partNumber);
          if (!storedPart) {
            throw new Error(`R2 error: part ${part.partNumber} was never uploaded`);
          }
          if (part.etag !== storedPart.etag) {
            throw new Error(`R2 error: etag mismatch on part ${part.partNumber}`);
          }
          bytesChunks.push(storedPart.bytes);
          total += storedPart.bytes.length;
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of bytesChunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const stored: StoredObject = {
          key,
          bytes,
          uploaded: new Date(),
          etag: randomHex(16),
          httpMetadata,
          customMetadata: customMetadata
            ? { ...customMetadata }
            : undefined,
        };
        this.objects.set(key, stored);
        state.finalized = true;
        this.multiparts.delete(uploadId);
        return this.toR2Object(stored);
      },
    };
  }

  private toR2Object(
    stored: StoredObject,
    include?: ("httpMetadata" | "customMetadata")[]
  ): R2Object {
    const showHttp = !include || include.includes("httpMetadata");
    const showCustom = !include || include.includes("customMetadata");
    const object = {
      key: stored.key,
      version: randomHex(16),
      size: stored.bytes.length,
      etag: stored.etag,
      httpEtag: `"${stored.etag}"`,
      checksums: { toJSON: () => ({}) },
      uploaded: stored.uploaded,
      httpMetadata: showHttp
        ? stored.httpMetadata
          ? { ...stored.httpMetadata }
          : undefined
        : undefined,
      customMetadata: showCustom
        ? stored.customMetadata
          ? { ...stored.customMetadata }
          : undefined
        : undefined,
      range: undefined,
      storageClass: "Standard",
      writeHttpMetadata: (headers: Headers) => {
        const metadata = stored.httpMetadata;
        if (!metadata) return;
        if (metadata.contentType) headers.set("Content-Type", metadata.contentType);
        if (metadata.contentLanguage) headers.set("Content-Language", metadata.contentLanguage);
        if (metadata.contentDisposition) headers.set("Content-Disposition", metadata.contentDisposition);
        if (metadata.contentEncoding) headers.set("Content-Encoding", metadata.contentEncoding);
        if (metadata.cacheControl) headers.set("Cache-Control", metadata.cacheControl);
      },
    };
    return object as unknown as R2Object;
  }

  private toR2ObjectBody(stored: StoredObject, range?: R2Range): R2ObjectBody {
    const base = this.toR2Object(stored) as R2Object & { range?: R2Range };
    base.range = range;
    const bytes = rangeSlice(stored.bytes, range);
    const body = Object.assign(bytes, {
      // 单块 reader：一次 read 返回全部内容后即 done（zip 流式读取依赖它终止）
      getReader: () => {
        let consumed = false;
        return {
          read: async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
            if (consumed || bytes.byteLength === 0) {
              return { done: true, value: undefined };
            }
            consumed = true;
            return { done: false, value: bytes };
          },
        };
      },
    }) as unknown as ReadableStream;
    const objectBody = {
      ...base,
      body,
      bodyUsed: false,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      bytes: async () => bytes,
      text: async () => new TextDecoder().decode(bytes),
      json: async <T>() => JSON.parse(new TextDecoder().decode(bytes)) as T,
      blob: async () => new Blob([bytes]),
    };
    return objectBody as unknown as R2ObjectBody;
  }
}

function rangeSlice(bytes: Uint8Array, range?: R2Range): Uint8Array {
  if (!range) return bytes;
  if ("suffix" in range) {
    const start = Math.max(bytes.length - range.suffix, 0);
    return bytes.subarray(start);
  }
  const offset = range.offset ?? 0;
  const length = range.length ?? bytes.length - offset;
  return bytes.subarray(offset, Math.min(offset + length, bytes.length));
}

/** 便捷 env 工厂：带上 Basic 认证所需的 WEBDAV 凭据。 */
export function makeEnv(
  bucket: R2Bucket,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    BUCKET: bucket,
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
    ...extra,
  };
}

/** Basic Authorization 头（与 verifyBasicAuth/isAuthorized 的期望值一致）。 */
export function basicAuthHeader(
  username = "user",
  password = "pass"
): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

/** Pages Function EventContext 最小实现（类型上直接对齐 PagesFunction 入参）。 */
export function makeContext<TEnv extends object>(
  request: Request,
  env: TEnv,
  params: Record<string, string | string[]> = {},
  next?: () => Promise<Response>
): Parameters<PagesFunction<TEnv>>[0] {
  const context = {
    request,
    env,
    params,
    data: {},
    next:
      next ??
      (async () => new Response(null, { status: 404 })),
    waitUntil: (_promise: Promise<unknown>) => {},
    passThroughOnException: () => {},
  };
  return context as unknown as Parameters<PagesFunction<TEnv>>[0];
}

/** 可注入 body/headers 的 GET/PUT 等请求构造（默认补 Authority 便于 new URL）。 */
export function makeRequest(
  url: string,
  method: string,
  headers?: Record<string, string>,
  body?: BodyInit | null
): Request {
  return new Request(url, {
    method,
    headers,
    body: body ?? undefined,
  });
}

export { NodeReadableStream };
