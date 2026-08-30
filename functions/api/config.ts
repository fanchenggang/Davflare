interface ConfigEnv {
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
  WEBDAV_PUBLIC_READ?: string;
}

import { verifyBasicAuth } from "./_apikey";

function isAuthorized(request: Request, env: ConfigEnv) {
  return verifyBasicAuth(request, env.WEBDAV_USERNAME, env.WEBDAV_PASSWORD);
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
