interface ConfigEnv {
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
  WEBDAV_PUBLIC_READ?: string;
}

function isAuthorized(request: Request, env: ConfigEnv) {
  const authorization = request.headers.get("Authorization");
  const expected = `Basic ${btoa(
    `${env.WEBDAV_USERNAME}:${env.WEBDAV_PASSWORD}`
  )}`;
  return Boolean(authorization && authorization === expected);
}

export const onRequestGet: PagesFunction<ConfigEnv> = async (context) => {
  const { request, env } = context;
  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  return new Response(
    JSON.stringify({
      username: env.WEBDAV_USERNAME || "",
      publicRead: env.WEBDAV_PUBLIC_READ === "1",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};
