import { jsonResponse, textResponse, verifyBasicAuth } from "./_apikey";
import { runSetupChecks, type SetupEnv } from "./_setup";

/** GET /api/setup — Basic web session only (not API key). */
export const onRequestGet: PagesFunction<SetupEnv> = async (context) => {
  const { request, env } = context;
  if (!verifyBasicAuth(request, env.WEBDAV_USERNAME, env.WEBDAV_PASSWORD)) {
    return textResponse("Unauthorized", 401);
  }
  const result = await runSetupChecks(env, request);
  return jsonResponse(result);
};
