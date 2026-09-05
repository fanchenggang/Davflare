/**
 * 共享测试工具：供 src/app/__tests__ 下的测试套件复用。
 *
 * 注意：本文件位于 __tests__ 目录之外（CRA 的 testMatch 会把 __tests__ 下
 * 所有文件当作测试套件），也不计入 collectCoverageFrom 覆盖率。
 */
import type { JsonRpcRequest } from "../../functions/_mcp";

/* ------------------------------------------------------------------ *
 * Response 工厂
 * ------------------------------------------------------------------ */

/**
 * 纯对象 Response mock：前端 client 模块（share/trash/apikeys/sites/images/
 * transfer/features 等）只依赖 ok/status/headers.get/json/text 这几个成员。
 *
 * 失败分支（ok=false）时 text() 返回 JSON 序列化结果；需要空文本或自定义
 * 错误文案时用 mockError()。
 */
export function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** 真 Response 工厂：后端 functions 直测 / MCP 用（状态码、headers、流语义与运行时一致）。 */
export function httpJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/* ------------------------------------------------------------------ *
 * authFetch mock
 * ------------------------------------------------------------------ */

/** 在 jest.fn() 上附加常用响应 helper 的 authFetch mock 类型。 */
export interface AuthFetchMock extends jest.Mock {
  /** 模拟 2xx JSON 响应（默认 200；status=201 可覆盖 created 场景）。 */
  mockOk(body: unknown, status?: number): AuthFetchMock;
  /** 模拟非 2xx：text() 返回 message（默认空串，走各 client 的默认文案分支）。 */
  mockError(status: number, message?: string): AuthFetchMock;
  /** 同 mockOk，但只对下一次调用生效（等价 mockResolvedValueOnce）。 */
  mockOkOnce(body: unknown, status?: number): AuthFetchMock;
  /** 同 mockError，但只对下一次调用生效（等价 mockResolvedValueOnce）。 */
  mockErrorOnce(status: number, message?: string): AuthFetchMock;
}

/** 给已存在的 jest.fn（如 jest.mock 工厂里的 authFetch）附加 helper 并返回。 */
export function asAuthFetchMock(fetchFn: unknown): AuthFetchMock {
  const fn = fetchFn as AuthFetchMock;
  fn.mockOk = (body: unknown, status = 200) => {
    fn.mockResolvedValue(jsonResponse(body, true, status));
    return fn;
  };
  fn.mockError = (status: number, message = "") => {
    fn.mockResolvedValue({
      ok: false,
      status,
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => message,
    } as unknown as Response);
    return fn;
  };
  fn.mockOkOnce = (body: unknown, status = 200) => {
    fn.mockResolvedValueOnce(jsonResponse(body, true, status));
    return fn;
  };
  fn.mockErrorOnce = (status: number, message = "") => {
    fn.mockResolvedValueOnce({
      ok: false,
      status,
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => message,
    } as unknown as Response);
    return fn;
  };
  return fn;
}

/* ------------------------------------------------------------------ *
 * storage 清理
 * ------------------------------------------------------------------ */

/** beforeEach/afterEach 用：清空 localStorage 与 sessionStorage。 */
export function clearStorage(): void {
  localStorage.clear();
  sessionStorage.clear();
}

/* ------------------------------------------------------------------ *
 * WebDAV PROPFIND fixture
 * ------------------------------------------------------------------ */

export interface PropfindEntry {
  /** 完整 href，如 "/webdav/a.txt"、"/webdav/docs/"（空串模拟服务端空 response）。 */
  href: string;
  isDir?: boolean;
  contentType?: string;
  size?: number;
  /** RFC 1123 日期串；缺省时不输出 <getlastmodified>（解析端回退当前时间）。 */
  lastModified?: string;
  /** flaredrive 命名空间缩略图标记。 */
  thumbnail?: string;
}

/** 构造多文件目录 PROPFIND Multi-Status XML。 */
export function propfindXml(entries: PropfindEntry[]): string {
  const responses = entries
    .map((entry) => {
      const props = [
        entry.isDir
          ? "<resourcetype><collection/></resourcetype>"
          : "<resourcetype/>",
      ];
      if (entry.contentType) {
        props.push(`<getcontenttype>${entry.contentType}</getcontenttype>`);
      }
      if (entry.size !== undefined) {
        props.push(`<getcontentlength>${entry.size}</getcontentlength>`);
      }
      if (entry.lastModified) {
        props.push(`<getlastmodified>${entry.lastModified}</getlastmodified>`);
      }
      if (entry.thumbnail) {
        props.push(`<thumbnail xmlns="flaredrive">${entry.thumbnail}</thumbnail>`);
      }
      return [
        "  <response>",
        `    <href>${entry.href}</href>`,
        "    <propstat>",
        "      <prop>",
        ...props.map((p) => `        ${p}`),
        "      </prop>",
        "    </propstat>",
        "  </response>",
      ].join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>\n<multistatus>\n${responses}\n</multistatus>`;
}

/** 207 Multi-Status 响应 mock（fetchPath 校验 Content-Type: application/xml）。 */
export function propfindResponse(entries: PropfindEntry[], ok = true): Response {
  return {
    ok,
    status: ok ? 207 : 500,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "application/xml; charset=utf-8" : null,
    },
    text: async () => propfindXml(entries),
  } as unknown as Response;
}

/* ------------------------------------------------------------------ *
 * MCP JSON-RPC
 * ------------------------------------------------------------------ */

/** 构造 JSON-RPC 请求体（hasId=false 模拟 notification）。 */
export function rpc(
  partial: Partial<JsonRpcRequest> & { method: string }
): JsonRpcRequest {
  const hasId = partial.hasId !== undefined ? partial.hasId : true;
  return {
    jsonrpc: "2.0",
    id: hasId ? (partial.id ?? 1) : undefined,
    method: partial.method,
    params: partial.params,
    hasId,
  };
}
