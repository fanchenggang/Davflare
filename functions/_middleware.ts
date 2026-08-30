import { indexFallbackKey, isSitesHost, parseSitesPath, sitesNotFound, sitesResponse } from "./_sites";

interface SitesEnv {
  BUCKET: R2Bucket;
  SITES_HOST?: string;
}

export const onRequest: PagesFunction<SitesEnv> = async (context) => {
  const host = context.request.headers.get("Host") || new URL(context.request.url).host;
  if (!isSitesHost(host, context.env.SITES_HOST)) {
    return context.next();
  }

  const method = context.request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const parsed = parseSitesPath(new URL(context.request.url).pathname);
  if (!parsed.ok) return sitesNotFound();

  let key = parsed.key;
  let object = await context.env.BUCKET.get(key);
  if (!object && parsed.tryIndex) {
    key = indexFallbackKey(parsed.key);
    object = await context.env.BUCKET.get(key);
  }
  if (!object) return sitesNotFound();

  return sitesResponse(
    { body: object.body, httpEtag: object.httpEtag },
    key,
    method === "HEAD"
  );
};
