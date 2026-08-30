/** Open API 客户端：列表/上传（自动分块）/下载（Range 续传）/元操作。 */
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface RemoteEntry {
  key: string;
  name: string;
  isDir: boolean;
  size: number;
  uploaded: string;
  etag?: string;
}

export interface ListPage {
  items: RemoteEntry[];
  nextCursor?: string | null;
}

const SINGLE_UPLOAD_LIMIT = 100 * 1000 * 1000; // 与服务端 413 阈值一致
const PART_SIZE = 8 * 1000 * 1000; // 三段式分块大小（服务端按 R2 multipart 转存）

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class DavflareClient {
  constructor(
    private readonly server: string,
    private readonly key: string
  ) {}

  private url(apiPath: string, params?: Record<string, string>): string {
    const url = new URL(apiPath, this.server);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    return url.toString();
  }

  private async request(
    method: string,
    apiPath: string,
    params: Record<string, string> | undefined,
    init?: { body?: BodyInit; headers?: Record<string, string>; json?: unknown }
  ): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.key}`, ...(init?.headers ?? {}) };
    let body: BodyInit | undefined;
    if (init?.json !== undefined) {
      body = JSON.stringify(init.json);
    } else if (init?.body !== undefined) {
      body = new Uint8Array(init.body as Uint8Array);
    }
    if (init?.json !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(this.url(apiPath, params), { method, headers, body });
    if (!response.ok) {
      const text = (await response.text()).trim();
      throw new ApiError(response.status, text || `HTTP ${response.status}`);
    }
    return response;
  }

  async listPage(folder: string, cursor?: string, limit = 1000): Promise<ListPage> {
    const params: Record<string, string> = { path: folder, limit: String(limit) };
    if (cursor) params.cursor = cursor;
    const response = await this.request("GET", "/api/list", params);
    return (await response.json()) as ListPage;
  }

  /** 递归列出目录下全部对象（BFS 走子目录）。folder 传 "" 表示根目录。 */
  async *walk(folder: string): AsyncGenerator<RemoteEntry> {
    const queue = [folder.replace(/\/+$/, "")];
    while (queue.length > 0) {
      const current = queue.shift()!;
      let cursor: string | undefined;
      let page: ListPage;
      try {
        page = await this.listPage(current ? `${current}/` : "", cursor);
      } catch (error) {
        // 远端目录不存在（尚未创建）：视为空，便于 sync 首推
        if (error instanceof ApiError && error.status === 404) return;
        throw error;
      }
      do {
        for (const entry of page.items) {
          if (entry.isDir) {
            queue.push(entry.key.replace(/\/+$/, ""));
          } else {
            yield entry;
          }
        }
        cursor = page.nextCursor || undefined;
      } while (cursor);
    }
  }

  async stat(key: string): Promise<Record<string, unknown>> {
    const response = await this.request("GET", "/api/stat", { path: key });
    return (await response.json()) as Record<string, unknown>;
  }

  async mkdir(folder: string): Promise<void> {
    await this.request("POST", "/api/mkdir", undefined, { json: { path: folder } });
  }

  async remove(key: string, hard = false): Promise<void> {
    await this.request("DELETE", "/api/delete", { path: key, soft: hard ? "0" : "1" });
  }

  async move(from: string, to: string, overwrite = false): Promise<void> {
    await this.request("POST", "/api/rename", undefined, { json: { from, to, overwrite } });
  }

  async backup(key: string): Promise<void> {
    await this.request("POST", "/api/backup", { path: key });
  }

  async search(query: string, limit = 100): Promise<ListPage & { hasMore?: boolean }> {
    const response = await this.request("GET", "/api/search", { q: query, limit: String(limit) });
    return (await response.json()) as ListPage & { hasMore?: boolean };
  }

  /** 上传本地文件。>100MB 自动走三段式分块；onProgress 上报已发送字节。 */
  async uploadFile(localPath: string, remoteKey: string, onProgress?: (sent: number, total: number) => void): Promise<void> {
    const body = await fs.promises.readFile(localPath);
    if (body.byteLength >= SINGLE_UPLOAD_LIMIT) {
      await this.multipartUpload(remoteKey, body, onProgress);
      return;
    }
    // 单发原始体模式：path=目标目录 + X-File-Name=文件名
    const slash = remoteKey.lastIndexOf("/");
    const folder = slash >= 0 ? remoteKey.slice(0, slash + 1) : "";
    const fileName = slash >= 0 ? remoteKey.slice(slash + 1) : remoteKey;
    let sent = 0;
    const response = await fetch(this.url("/api/upload", { path: folder, overwrite: "1" }), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/octet-stream",
        "X-File-Name": fileName,
      },
      body: new Uint8Array(body),
    });
    if (!response.ok) throw new ApiError(response.status, (await response.text()).trim() || `HTTP ${response.status}`);
    sent = body.byteLength;
    onProgress?.(sent, sent);
  }

  private async multipartUpload(
    remoteKey: string,
    body: Buffer,
    onProgress?: (sent: number, total: number) => void
  ): Promise<void> {
    const createResponse = await this.request("POST", "/api/upload", { uploads: "1", path: remoteKey });
    const { uploadId } = (await createResponse.json()) as { uploadId: string };
    const parts: Array<{ partNumber: number; etag: string }> = [];
    try {
      let partNumber = 1;
      for (let offset = 0; offset < body.byteLength; partNumber += 1) {
        const chunk = body.subarray(offset, Math.min(offset + PART_SIZE, body.byteLength));
        const partResponse = await this.request("PUT", "/api/upload", {
          path: remoteKey,
          uploadId,
          partNumber: String(partNumber),
        }, { body: new Uint8Array(chunk), headers: { "Content-Type": "application/octet-stream" } });
        const part = (await partResponse.json()) as { etag: string };
        parts.push({ partNumber, etag: part.etag });
        onProgress?.(Math.min(offset + chunk.byteLength, body.byteLength), body.byteLength);
        offset += chunk.byteLength;
      }
      await this.request("POST", "/api/upload", { path: remoteKey, uploadId }, { json: { parts } });
    } catch (error) {
      try {
        await this.request("DELETE", "/api/upload", { path: remoteKey, uploadId });
      } catch {
        // 清理失败不影响错误上报
      }
      throw error;
    }
  }

  /** 下载远端文件到本地；localPath 已有前缀时用 Range 续传。返回是否发生了续传。 */
  async downloadFile(remoteKey: string, localPath: string, onProgress?: (received: number, total: number) => void): Promise<boolean> {
    const stat = (await this.stat(remoteKey)) as { kind?: string; size?: number };
    if (stat.kind !== "file" || typeof stat.size !== "number") {
      throw new ApiError(400, `${remoteKey} 不是文件`);
    }
    const total = stat.size;
    let offset = 0;
    let resumed = false;
    try {
      offset = (await fs.promises.stat(localPath)).size;
    } catch {
      offset = 0;
    }
    if (offset > 0 && offset < total) {
      resumed = true; // 尝试续传；服务器不支持 Range 时回退全量
    } else {
      offset = 0;
    }
    const headers: Record<string, string> = {};
    if (resumed) headers.Range = `bytes=${offset}-`;
    const response = await fetch(this.url("/api/download", { path: remoteKey }), {
      headers: { Authorization: `Bearer ${this.key}`, ...headers },
    });
    if (!response.ok || response.body === null) {
      throw new ApiError(response.status, (await response.text()).trim() || `HTTP ${response.status}`);
    }
    if (resumed && response.status !== 206) {
      offset = 0;
      resumed = false;
    }
    let received = offset;
    const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
    source.on("data", (chunk: Buffer) => {
      received += chunk.byteLength;
      onProgress?.(received, total);
    });
    await pipeline(source, fs.createWriteStream(localPath, { flags: resumed ? "a" : "w" }));
    return resumed;
  }

  /** login 时用会话凭据创建专用 API 密钥。 */
  async createKeyWithSession(username: string, password: string, name: string): Promise<{ key: string; id?: string }> {
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const response = await fetch(this.url("/api/keys"), {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      throw new ApiError(response.status, (await response.text()).trim() || `HTTP ${response.status}`);
    }
    return (await response.json()) as { key: string; id?: string };
  }

  async revokeKey(id: string): Promise<void> {
    // 密钥管理是会话端点；logout 时由调用方决定是否仍持有会话。此处尽力而为。
    const response = await this.request("DELETE", "/api/keys", { id });
    await response.arrayBuffer();
  }
}
