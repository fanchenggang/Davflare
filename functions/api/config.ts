import { hasApiKeyHeader, verifyBasicAuth } from "./_apikey";
import {
  loadFeatureFlags,
  normalizeFeatureFlags,
  parseConfigPatch,
  saveFeatureFlags,
} from "../_flags";
import { normalizeSitesHost } from "../_sites";

interface ConfigEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
  WEBDAV_PUBLIC_READ?: string;
  SITES_HOST?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export type ConfigWriteAuth = "ok" | "unauthorized" | "api-key-forbidden";

/** PATCH /api/config is Basic session only. API keys cannot change switches. */
export function authorizeConfigWrite(
  request: Request,
  username: string,
  password: string
): ConfigWriteAuth {
  if (verifyBasicAuth(request, username, password)) return "ok";
  if (hasApiKeyHeader(request)) return "api-key-forbidden";
  return "unauthorized";
}

function configBody(
  env: ConfigEnv,
  flags: ReturnType<typeof normalizeFeatureFlags>
) {
  return {
    username: env.WEBDAV_USERNAME || "",
    publicRead: env.WEBDAV_PUBLIC_READ === "1",
    sitesHost: normalizeSitesHost(env.SITES_HOST) || null,
    ...flags,
  };
}

export const onRequestGet: PagesFunction<ConfigEnv> = async (context) => {
  const { request, env } = context;
  if (!verifyBasicAuth(request, env.WEBDAV_USERNAME, env.WEBDAV_PASSWORD)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const flags = await loadFeatureFlags(env.BUCKET);
  return jsonResponse(configBody(env, flags));
};

export const onRequestPatch: PagesFunction<ConfigEnv> = async (context) => {
  const { request, env } = context;
  const auth = authorizeConfigWrite(
    request,
    env.WEBDAV_USERNAME,
    env.WEBDAV_PASSWORD
  );
  if (auth === "api-key-forbidden") {
    return new Response("API keys cannot change feature flags", { status: 403 });
  }
  if (auth !== "ok") {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const parsed = parseConfigPatch(body);
  if (!parsed.ok) {
    return new Response(parsed.error, { status: 400 });
  }

  const current = await loadFeatureFlags(env.BUCKET);
  const next = normalizeFeatureFlags({ ...current, ...parsed.patch });
  await saveFeatureFlags(env.BUCKET, next);
  return jsonResponse(configBody(env, next));
};

export const onRequestPut = onRequestPatch;
