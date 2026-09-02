import { authorizeApiKey } from "../../../functions/api/_apikey";
import { authorizeConfigWrite } from "../../../functions/api/config";
import {
  CONFIG_KEY,
  DEFAULT_FEATURE_FLAGS,
  gateDriveProductRoute,
  loadFeatureFlags,
  normalizeFeatureFlags,
  parseConfigPatch,
} from "../../../functions/_flags";

function mockBucket(objects: Record<string, unknown> = {}): R2Bucket {
  return {
    get: async (key: string) => {
      if (!(key in objects)) return null;
      return { json: async () => objects[key] };
    },
  } as unknown as R2Bucket;
}

function requestWith(headers: Record<string, string>) {
  return new Request("https://drive.example/api/config", { headers });
}

describe("feature flag defaults", () => {
  test("all five switches default on", () => {
    expect(DEFAULT_FEATURE_FLAGS).toEqual({
      webdav: true,
      mcp: true,
      apiKey: true,
      sites: true,
      imageHost: true,
    });
  });

  test("missing or corrupt payload falls back to defaults", () => {
    expect(normalizeFeatureFlags(null)).toEqual(DEFAULT_FEATURE_FLAGS);
    expect(normalizeFeatureFlags("nope")).toEqual(DEFAULT_FEATURE_FLAGS);
    expect(normalizeFeatureFlags({ webdav: false })).toEqual({
      ...DEFAULT_FEATURE_FLAGS,
      webdav: false,
    });
    expect(normalizeFeatureFlags({ webdav: "off", mcp: false })).toEqual({
      ...DEFAULT_FEATURE_FLAGS,
      mcp: false,
    });
  });

  test("parseConfigPatch accepts partial booleans only", () => {
    expect(parseConfigPatch({ webdav: false, mcp: true })).toEqual({
      ok: true,
      patch: { webdav: false, mcp: true },
    });
    expect(parseConfigPatch({ webdav: "false" }).ok).toBe(false);
    expect(parseConfigPatch({}).ok).toBe(false);
    expect(parseConfigPatch(null).ok).toBe(false);
  });
});

describe("PATCH /api/config auth", () => {
  const user = "owner";
  const pass = "secret";
  const basic = `Basic ${btoa(`${user}:${pass}`)}`;

  test("valid Basic session is allowed", () => {
    expect(
      authorizeConfigWrite(requestWith({ Authorization: basic }), user, pass)
    ).toBe("ok");
  });

  test("API key Bearer is rejected", () => {
    expect(
      authorizeConfigWrite(
        requestWith({ Authorization: "Bearer fd_abc" }),
        user,
        pass
      )
    ).toBe("api-key-forbidden");
  });

  test("X-Api-Key is rejected", () => {
    expect(
      authorizeConfigWrite(requestWith({ "X-Api-Key": "fd_abc" }), user, pass)
    ).toBe("api-key-forbidden");
  });

  test("missing credentials is unauthorized", () => {
    expect(authorizeConfigWrite(requestWith({}), user, pass)).toBe(
      "unauthorized"
    );
  });
});

describe("drive-host product route 404s", () => {
  const off = {
    ...DEFAULT_FEATURE_FLAGS,
    webdav: false,
    mcp: false,
    apiKey: false,
  };

  test("webdav mount is 404 when the switch is off", () => {
    const blocked = gateDriveProductRoute(
      "/webdav",
      off,
      requestWith({})
    );
    expect(blocked?.status).toBe(404);
    expect(
      gateDriveProductRoute("/webdav/docs", off, requestWith({}))?.status
    ).toBe(404);
  });

  test("web file manager header still reaches /webdav when the switch is off", () => {
    expect(
      gateDriveProductRoute(
        "/webdav/",
        off,
        requestWith({ "X-Davflare-UI": "1" })
      )
    ).toBeNull();
  });

  test("mcp is 404 when the MCP switch is off", () => {
    const flags = { ...DEFAULT_FEATURE_FLAGS, mcp: false };
    expect(
      gateDriveProductRoute("/mcp", flags, requestWith({}))?.status
    ).toBe(404);
  });

  test("mcp is 404 when API Key is off even if MCP is on", () => {
    const flags = { ...DEFAULT_FEATURE_FLAGS, apiKey: false, mcp: true };
    expect(
      gateDriveProductRoute("/mcp", flags, requestWith({}))?.status
    ).toBe(404);
  });

  test("loadFeatureFlags uses defaults when the object is missing", async () => {
    await expect(loadFeatureFlags(mockBucket())).resolves.toEqual(
      DEFAULT_FEATURE_FLAGS
    );
  });

  test("authorizeApiKey returns 401 when the API Key switch is off", async () => {
    const bucket = mockBucket({
      [CONFIG_KEY]: { ...DEFAULT_FEATURE_FLAGS, apiKey: false },
    });
    const response = await authorizeApiKey(
      new Request("https://drive.example/api/list", {
        headers: { "X-Api-Key": "fd_secret" },
      }),
      bucket
    );
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
  });

  test("enabled routes are not gated", () => {
    expect(
      gateDriveProductRoute("/webdav", DEFAULT_FEATURE_FLAGS, requestWith({}))
    ).toBeNull();
    expect(
      gateDriveProductRoute("/mcp", DEFAULT_FEATURE_FLAGS, requestWith({}))
    ).toBeNull();
  });
});
