// Post-deploy green-light checks (pure helpers + runners). Used by GET /api/setup.
import {
  KEYS_PREFIX,
  authorizeApiKey,
  listStoredKeys,
  sha256Hex,
  utf8ToBase64,
  type StoredApiKey,
} from "./_apikey";
import {
  loadFeatureFlags,
  type FeatureFlags,
} from "../_flags";
import { dispatchMcpRequest, type ToolCallApis } from "../_mcp";
import { normalizeSitesHost } from "../_sites";
import { onRequest as webdavOnRequest, type WebDavEnv } from "../webdav/protocol";

export type SetupCheckStatus = "green" | "red" | "skipped";

export type SetupDocsSlug = "deploy" | "webdav" | "API" | "sites";

export interface SetupCheck {
  id: "r2" | "webdav" | "flags" | "sitesHost" | "mcp";
  status: SetupCheckStatus;
  /** Short bilingual titles for UI/API consumers. */
  title: { zh: string; en: string };
  /** Fix hint when red/skipped; empty when green. */
  message: { zh: string; en: string };
  docs?: SetupDocsSlug;
  /** Present on the flags check. */
  flags?: FeatureFlags;
}

export interface SetupResult {
  checks: SetupCheck[];
  allApplicableGreen: boolean;
  origin: string;
  mcpUrl: string;
  mcpJson: string;
}

export interface SetupEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
  WEBDAV_PUBLIC_READ?: string;
  SITES_HOST?: string;
}

const STUB_APIS = {} as ToolCallApis;

function docsPath(slug: SetupDocsSlug, lang: "zh" | "en" = "en"): string {
  if (lang === "zh") {
    if (slug === "API") return "docs/API.zh-CN.md";
    return `docs/${slug}.zh-CN.md`;
  }
  if (slug === "API") return "docs/API.md";
  return `docs/${slug}.md`;
}

/** Public helper so UI/docs can build the same relative links. */
export function setupDocsHref(slug: SetupDocsSlug, lang: "zh" | "en" = "en"): string {
  return docsPath(slug, lang);
}

export function buildMcpJsonSnippet(origin: string): string {
  const url = `${origin.replace(/\/+$/, "")}/mcp`;
  return JSON.stringify(
    {
      mcpServers: {
        davflare: {
          url,
          headers: {
            Authorization: "Bearer <apiKey>",
          },
        },
      },
    },
    null,
    2
  );
}

function check(
  partial: Omit<SetupCheck, "message"> & { message?: SetupCheck["message"] }
): SetupCheck {
  return {
    message: { zh: "", en: "" },
    ...partial,
  };
}

export async function probeR2(bucket: R2Bucket): Promise<SetupCheck> {
  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const key = `_$flaredrive$/setup-probe/${id}`;
  try {
    await bucket.put(key, "ok", {
      httpMetadata: { contentType: "text/plain" },
    });
    const got = await bucket.get(key);
    if (got === null) {
      return check({
        id: "r2",
        status: "red",
        title: { zh: "R2 读写", en: "R2 read/write" },
        message: {
          zh: "写入后读不到探测对象。检查 Pages 是否绑定了 BUCKET，见 docs/deploy.zh-CN.md。",
          en: "Probe object missing after write. Bind BUCKET on Pages — see docs/deploy.md.",
        },
        docs: "deploy",
      });
    }
    const text = await got.text();
    await bucket.delete(key);
    if (text !== "ok") {
      return check({
        id: "r2",
        status: "red",
        title: { zh: "R2 读写", en: "R2 read/write" },
        message: {
          zh: "探测对象内容不正确。检查 R2 绑定，见 docs/deploy.zh-CN.md。",
          en: "Probe payload mismatch. Check the R2 binding — see docs/deploy.md.",
        },
        docs: "deploy",
      });
    }
    return check({
      id: "r2",
      status: "green",
      title: { zh: "R2 读写", en: "R2 read/write" },
    });
  } catch (error) {
    try {
      await bucket.delete(key);
    } catch {
      // ignore cleanup failures
    }
    const detail = (error as Error)?.message || "unknown error";
    return check({
      id: "r2",
      status: "red",
      title: { zh: "R2 读写", en: "R2 read/write" },
      message: {
        zh: `R2 探测失败（${detail}）。绑定 BUCKET 并确认读写权限，见 docs/deploy.zh-CN.md。`,
        en: `R2 probe failed (${detail}). Bind BUCKET with read/write — see docs/deploy.md.`,
      },
      docs: "deploy",
    });
  }
}

export async function probeWebDav(
  env: SetupEnv,
  origin: string
): Promise<SetupCheck> {
  const username = (env.WEBDAV_USERNAME || "").trim();
  const password = (env.WEBDAV_PASSWORD || "").trim();
  if (!username || !password) {
    return check({
      id: "webdav",
      status: "skipped",
      title: { zh: "WebDAV PROPFIND", en: "WebDAV PROPFIND" },
      message: {
        zh: "未配置 WEBDAV_USERNAME / WEBDAV_PASSWORD，已跳过。见 docs/webdav.zh-CN.md。",
        en: "WEBDAV_USERNAME / WEBDAV_PASSWORD not set — skipped. See docs/webdav.md.",
      },
      docs: "webdav",
    });
  }

  try {
    const authorization = `Basic ${utf8ToBase64(`${username}:${password}`)}`;
    const request = new Request(`${origin.replace(/\/+$/, "")}/webdav/`, {
      method: "PROPFIND",
      headers: {
        Authorization: authorization,
        Depth: "0",
        "Content-Type": "application/xml",
      },
      body: `<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>`,
    });
    const davEnv: WebDavEnv = {
      BUCKET: env.BUCKET,
      WEBDAV_USERNAME: username,
      WEBDAV_PASSWORD: password,
      WEBDAV_PUBLIC_READ: env.WEBDAV_PUBLIC_READ,
    };
    const response = await webdavOnRequest({
      request,
      env: davEnv,
      params: { path: "" },
      data: {},
      next: async () => new Response("Not Found", { status: 404 }),
      waitUntil: () => {},
      passThroughOnException: () => {},
    } as unknown as Parameters<typeof webdavOnRequest>[0]);

    if (response.status === 207 || response.status === 200) {
      return check({
        id: "webdav",
        status: "green",
        title: { zh: "WebDAV PROPFIND", en: "WebDAV PROPFIND" },
      });
    }
    return check({
      id: "webdav",
      status: "red",
      title: { zh: "WebDAV PROPFIND", en: "WebDAV PROPFIND" },
      message: {
        zh: `PROPFIND 返回 HTTP ${response.status}。核对 WEBDAV_USERNAME / WEBDAV_PASSWORD，见 docs/webdav.zh-CN.md。`,
        en: `PROPFIND returned HTTP ${response.status}. Check WEBDAV_USERNAME / WEBDAV_PASSWORD — see docs/webdav.md.`,
      },
      docs: "webdav",
    });
  } catch (error) {
    const detail = (error as Error)?.message || "unknown error";
    return check({
      id: "webdav",
      status: "red",
      title: { zh: "WebDAV PROPFIND", en: "WebDAV PROPFIND" },
      message: {
        zh: `PROPFIND 探测失败（${detail}）。见 docs/webdav.zh-CN.md。`,
        en: `PROPFIND probe failed (${detail}). See docs/webdav.md.`,
      },
      docs: "webdav",
    });
  }
}

export async function probeFlags(bucket: R2Bucket): Promise<SetupCheck> {
  const flags = await loadFeatureFlags(bucket);
  // Informational: always green once loaded; UI shows each switch.
  return check({
    id: "flags",
    status: "green",
    title: { zh: "功能开关", en: "Feature switches" },
    flags,
  });
}

export function probeSitesHost(
  env: SetupEnv,
  flags: FeatureFlags,
  requestHost: string
): SetupCheck {
  const sitesHost = normalizeSitesHost(env.SITES_HOST);
  const needsHost = flags.sites || flags.imageHost;
  if (!sitesHost) {
    if (!needsHost) {
      return check({
        id: "sitesHost",
        status: "skipped",
        title: { zh: "SITES_HOST", en: "SITES_HOST" },
        message: {
          zh: "站点/图床开关均关闭，未配置 SITES_HOST 可跳过。见 docs/sites.zh-CN.md。",
          en: "Sites and Image Host are off — SITES_HOST not required. See docs/sites.md.",
        },
        docs: "sites",
      });
    }
    return check({
      id: "sitesHost",
      status: "red",
      title: { zh: "SITES_HOST", en: "SITES_HOST" },
      message: {
        zh: "未设置 SITES_HOST。绑定自定义域并设置环境变量（只要主机名），见 docs/sites.zh-CN.md / docs/deploy.zh-CN.md。",
        en: "SITES_HOST is empty. Bind a custom domain and set the env (hostname only) — see docs/sites.md / docs/deploy.md.",
      },
      docs: "sites",
    });
  }

  const driveHost = normalizeSitesHost(requestHost.split(":")[0]);
  // Best-effort: sites host should be a separate hostname from the drive UI.
  if (driveHost && driveHost === sitesHost) {
    return check({
      id: "sitesHost",
      status: "red",
      title: { zh: "SITES_HOST", en: "SITES_HOST" },
      message: {
        zh: `SITES_HOST（${sitesHost}）与当前网盘主机相同。应使用独立主机（如 sites.example.com），见 docs/sites.zh-CN.md。`,
        en: `SITES_HOST (${sitesHost}) matches this drive host. Use a separate hostname (e.g. sites.example.com) — see docs/sites.md.`,
      },
      docs: "sites",
    });
  }

  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(sitesHost) || !sitesHost.includes(".")) {
    return check({
      id: "sitesHost",
      status: "red",
      title: { zh: "SITES_HOST", en: "SITES_HOST" },
      message: {
        zh: `SITES_HOST（${sitesHost}）看起来不是有效主机名。只要主机名、不要 https://，见 docs/sites.zh-CN.md。`,
        en: `SITES_HOST (${sitesHost}) does not look like a hostname. Hostname only, no https:// — see docs/sites.md.`,
      },
      docs: "sites",
    });
  }

  return check({
    id: "sitesHost",
    status: "green",
    title: { zh: "SITES_HOST", en: "SITES_HOST" },
    message: {
      zh: `已配置为 ${sitesHost}（与网盘主机不同）。DNS/证书需在 Cloudflare 侧自行确认。`,
      en: `Configured as ${sitesHost} (distinct from drive host). Confirm DNS/certs in Cloudflare.`,
    },
  });
}

async function writeProbeApiKey(
  bucket: R2Bucket,
  rawKey: string
): Promise<string> {
  const id = `setupprobe${Date.now().toString(16)}`;
  const record: StoredApiKey = {
    id,
    name: "__setup_probe__",
    prefix: rawKey.slice(0, 8),
    keyHash: await sha256Hex(rawKey),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    createdBy: "setup",
    lastUsedAt: null,
  };
  await bucket.put(`${KEYS_PREFIX}${id}.json`, JSON.stringify(record), {
    httpMetadata: { contentType: "application/json" },
  });
  return id;
}

export async function probeMcp(
  bucket: R2Bucket,
  flags: FeatureFlags,
  origin: string
): Promise<SetupCheck> {
  if (!flags.mcp || !flags.apiKey) {
    return check({
      id: "mcp",
      status: "red",
      title: { zh: "MCP tools/list", en: "MCP tools/list" },
      message: {
        zh: "MCP 或 API Key 开关已关闭。在 #/settings 打开两者，见 docs/API.zh-CN.md。",
        en: "MCP or API Key switch is off. Enable both in #/settings — see docs/API.md.",
      },
      docs: "API",
    });
  }

  const existing = await listStoredKeys(bucket);
  if (existing.length === 0) {
    return check({
      id: "mcp",
      status: "skipped",
      title: { zh: "MCP tools/list", en: "MCP tools/list" },
      message: {
        zh: "尚无 API 密钥，已跳过（不会自动创建）。在 API 面板创建密钥后再测，见 docs/API.zh-CN.md。",
        en: "No API key yet — skipped (will not invent one). Create a key in the API panel, then re-check — see docs/API.md.",
      },
      docs: "API",
    });
  }

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const rawKey = `fd_${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
  let probeId: string | null = null;
  try {
    probeId = await writeProbeApiKey(bucket, rawKey);
    const authReq = new Request(`${origin.replace(/\/+$/, "")}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });
    const auth = await authorizeApiKey(authReq, bucket);
    if (auth instanceof Response) {
      return check({
        id: "mcp",
        status: "red",
        title: { zh: "MCP tools/list", en: "MCP tools/list" },
        message: {
          zh: `API 密钥鉴权失败（HTTP ${auth.status}）。见 docs/API.zh-CN.md。`,
          en: `API key auth failed (HTTP ${auth.status}). See docs/API.md.`,
        },
        docs: "API",
      });
    }
    const result = await dispatchMcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        hasId: true,
      },
      STUB_APIS
    );
    if (result.kind !== "rpc" || !result.body.result) {
      return check({
        id: "mcp",
        status: "red",
        title: { zh: "MCP tools/list", en: "MCP tools/list" },
        message: {
          zh: "tools/list 未返回结果。见 docs/API.zh-CN.md。",
          en: "tools/list returned no result. See docs/API.md.",
        },
        docs: "API",
      });
    }
    const tools = (result.body.result as { tools?: unknown }).tools;
    if (!Array.isArray(tools) || tools.length === 0) {
      return check({
        id: "mcp",
        status: "red",
        title: { zh: "MCP tools/list", en: "MCP tools/list" },
        message: {
          zh: "tools/list 工具列表为空。见 docs/API.zh-CN.md。",
          en: "tools/list returned an empty tool list. See docs/API.md.",
        },
        docs: "API",
      });
    }
    return check({
      id: "mcp",
      status: "green",
      title: { zh: "MCP tools/list", en: "MCP tools/list" },
      message: {
        zh: `API 密钥可用，tools/list 返回 ${tools.length} 个工具。`,
        en: `API key works; tools/list returned ${tools.length} tools.`,
      },
    });
  } catch (error) {
    const detail = (error as Error)?.message || "unknown error";
    return check({
      id: "mcp",
      status: "red",
      title: { zh: "MCP tools/list", en: "MCP tools/list" },
      message: {
        zh: `MCP 探测失败（${detail}）。见 docs/API.zh-CN.md。`,
        en: `MCP probe failed (${detail}). See docs/API.md.`,
      },
      docs: "API",
    });
  } finally {
    if (probeId) {
      try {
        await bucket.delete(`${KEYS_PREFIX}${probeId}.json`);
      } catch {
        // ignore
      }
    }
  }
}

export function allApplicableGreen(checks: SetupCheck[]): boolean {
  return checks.every((c) => c.status === "green" || c.status === "skipped");
}

export async function runSetupChecks(
  env: SetupEnv,
  request: Request
): Promise<SetupResult> {
  const url = new URL(request.url);
  const origin = url.origin;
  const requestHost =
    request.headers.get("Host") || url.host || url.hostname;

  const r2 = await probeR2(env.BUCKET);
  const webdav = await probeWebDav(env, origin);
  const flagsCheck = await probeFlags(env.BUCKET);
  const flags = flagsCheck.flags || {
    webdav: true,
    mcp: true,
    apiKey: true,
    sites: true,
    imageHost: true,
  };
  const sitesHost = probeSitesHost(env, flags, requestHost);
  const mcp = await probeMcp(env.BUCKET, flags, origin);

  const checks = [r2, webdav, flagsCheck, sitesHost, mcp];
  return {
    checks,
    allApplicableGreen: allApplicableGreen(checks),
    origin,
    mcpUrl: `${origin.replace(/\/+$/, "")}/mcp`,
    mcpJson: buildMcpJsonSnippet(origin),
  };
}

