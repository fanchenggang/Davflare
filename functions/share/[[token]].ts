interface ShareEnv {
  BUCKET: R2Bucket;
}

const SHARES_PREFIX = "_$flaredrive$/shares/";

function inlineContentType(contentType: string) {
  return (
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/") ||
    contentType === "application/pdf" ||
    contentType.startsWith("text/")
  );
}

function tokenFromParams(params: Record<string, unknown>): string | null {
  const token = params.token;
  if (typeof token === "string") return token;
  if (Array.isArray(token)) return token[0] || null;
  return null;
}

export const onRequestGet: PagesFunction<ShareEnv> = async (context) => {
  const { request, env, params } = context;
  const token = tokenFromParams(params);
  if (!token) return new Response("Not found", { status: 404 });

  const metadataObject = await env.BUCKET.get(`${SHARES_PREFIX}${token}.json`);
  if (metadataObject === null) {
    return new Response("分享链接不存在或已撤销", { status: 404 });
  }

  const metadata = (await metadataObject.json()) as {
    key?: string;
    expiresAt?: string | null;
  };
  if (!metadata.key) return new Response("Not found", { status: 404 });

  if (
    metadata.expiresAt &&
    new Date(metadata.expiresAt).getTime() <= Date.now()
  ) {
    return new Response("分享链接已过期", { status: 410 });
  }

  const object = await env.BUCKET.get(metadata.key, {
    range: request.headers,
  });
  if (object === null || !("body" in object)) {
    return new Response("File not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "no-store");

  const contentType = object.httpMetadata?.contentType || "application/octet-stream";
  const disposition = inlineContentType(contentType) ? "inline" : "attachment";
  const encodedName = encodeURIComponent(
    metadata.key.split("/").pop() || "download"
  );
  headers.set(
    "Content-Disposition",
    `${disposition}; filename*=UTF-8''${encodedName}`
  );

  return new Response(object.body, { headers });
};

export const onRequestHead: PagesFunction<ShareEnv> = async (context) => {
  const { request, env, params } = context;
  const token = tokenFromParams(params);
  if (!token) return new Response(null, { status: 404 });

  const metadataObject = await env.BUCKET.get(`${SHARES_PREFIX}${token}.json`);
  if (metadataObject === null) return new Response(null, { status: 404 });
  const metadata = (await metadataObject.json()) as { key?: string };
  if (!metadata.key) return new Response(null, { status: 404 });

  const object = await env.BUCKET.head(metadata.key);
  if (object === null) return new Response(null, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  return new Response(null, { headers });
};
