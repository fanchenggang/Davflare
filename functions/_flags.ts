// Same internal prefix as shares / API keys / site config. Keep this file free of
// _apikey imports so authorizeApiKey can load flags without a cycle.
export const CONFIG_KEY = "_$flaredrive$/config.json";

export type FeatureFlagName =
  | "webdav"
  | "mcp"
  | "apiKey"
  | "sites"
  | "imageHost";

export interface FeatureFlags {
  webdav: boolean;
  mcp: boolean;
  apiKey: boolean;
  sites: boolean;
  imageHost: boolean;
}

export const FEATURE_FLAG_NAMES: FeatureFlagName[] = [
  "webdav",
  "mcp",
  "apiKey",
  "sites",
  "imageHost",
];

/** Product default: every switch on until the owner persists otherwise. */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  webdav: true,
  mcp: true,
  apiKey: true,
  sites: true,
  imageHost: true,
};

export const UI_CLIENT_HEADER = "X-Davflare-UI";

export function normalizeFeatureFlags(raw: unknown): FeatureFlags {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const pick = (key: FeatureFlagName): boolean =>
    typeof src[key] === "boolean" ? src[key] : DEFAULT_FEATURE_FLAGS[key];
  return {
    webdav: pick("webdav"),
    mcp: pick("mcp"),
    apiKey: pick("apiKey"),
    sites: pick("sites"),
    imageHost: pick("imageHost"),
  };
}

export function parseConfigPatch(
  body: unknown
): { ok: true; patch: Partial<FeatureFlags> } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  const patch: Partial<FeatureFlags> = {};
  let any = false;
  for (const key of FEATURE_FLAG_NAMES) {
    if (src[key] === undefined) continue;
    if (typeof src[key] !== "boolean") {
      return { ok: false, error: `${key} must be a boolean` };
    }
    patch[key] = src[key];
    any = true;
  }
  if (!any) return { ok: false, error: "no flags to update" };
  return { ok: true, patch };
}

export async function loadFeatureFlags(bucket: R2Bucket): Promise<FeatureFlags> {
  const object = await bucket.get(CONFIG_KEY);
  if (object === null) return { ...DEFAULT_FEATURE_FLAGS };
  try {
    return normalizeFeatureFlags(await object.json());
  } catch {
    return { ...DEFAULT_FEATURE_FLAGS };
  }
}

export async function saveFeatureFlags(
  bucket: R2Bucket,
  flags: FeatureFlags
): Promise<void> {
  await bucket.put(CONFIG_KEY, JSON.stringify(flags), {
    httpMetadata: { contentType: "application/json" },
  });
}

export function featureDisabledResponse(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

export function isInternalWebIo(request: Request): boolean {
  return (request.headers.get(UI_CLIENT_HEADER) || "").trim() === "1";
}

export function isDriveWebDavPath(pathname: string): boolean {
  return pathname === "/webdav" || pathname.startsWith("/webdav/");
}

export function isDriveMcpPath(pathname: string): boolean {
  return pathname === "/mcp" || pathname.startsWith("/mcp/");
}

/**
 * Drive-host product gates. WebDAV clients get 404 when the switch is off;
 * the web file manager keeps using /webdav via X-Davflare-UI (session I/O).
 * MCP is unusable if either the MCP switch or the API Key switch is off.
 */
export function gateDriveProductRoute(
  pathname: string,
  flags: FeatureFlags,
  request: Request
): Response | null {
  if (isDriveWebDavPath(pathname)) {
    if (!flags.webdav && !isInternalWebIo(request)) {
      return featureDisabledResponse();
    }
    return null;
  }
  if (isDriveMcpPath(pathname)) {
    if (!flags.mcp || !flags.apiKey) {
      return featureDisabledResponse();
    }
  }
  return null;
}
