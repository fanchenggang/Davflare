/**
 * GET /api/setup — session-only post-deploy checklist.
 */
import { onRequestGet } from "../../../functions/api/setup";
import {
  allApplicableGreen,
  buildMcpJsonSnippet,
  probeFlags,
  probeMcp,
  probeR2,
  probeSitesHost,
  probeWebDav,
  runSetupChecks,
} from "../../../functions/api/_setup";
import { CONFIG_KEY, DEFAULT_FEATURE_FLAGS } from "../../../functions/_flags";
import { KEYS_PREFIX } from "../../../functions/api/_apikey";
import {
  InMemoryBucket,
  basicAuthHeader,
  makeContext,
} from "../testInMemoryBucket";

const HOST = "http://drive.example.com";
const USER = "owner";
const PASS = "secret";
const AUTH = basicAuthHeader(USER, PASS);

function makeEnv(bucket: InMemoryBucket, extra: Record<string, unknown> = {}) {
  return {
    BUCKET: bucket.asBucket(),
    WEBDAV_USERNAME: USER,
    WEBDAV_PASSWORD: PASS,
    ...extra,
  };
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function seedApiKey(bucket: InMemoryBucket, raw = "fd_setup_test_key_abcdef") {
  bucket.seed([
    {
      key: `${KEYS_PREFIX}userkey.json`,
      body: JSON.stringify({
        id: "userkey",
        name: "user",
        prefix: "fd_",
        keyHash: await sha256Hex(raw),
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: null,
      }),
      contentType: "application/json",
    },
  ]);
}

describe("buildMcpJsonSnippet", () => {
  test("uses origin /mcp and Bearer placeholder", () => {
    const json = buildMcpJsonSnippet("https://drive.example.com/");
    const parsed = JSON.parse(json);
    expect(parsed.mcpServers.davflare.url).toBe("https://drive.example.com/mcp");
    expect(parsed.mcpServers.davflare.headers.Authorization).toBe(
      "Bearer <apiKey>"
    );
  });
});

describe("probeR2", () => {
  test("green when put/get/delete works", async () => {
    const bucket = new InMemoryBucket();
    const result = await probeR2(bucket.asBucket());
    expect(result.status).toBe("green");
    expect(result.id).toBe("r2");
  });
});

describe("probeWebDav", () => {
  test("skipped when credentials missing", async () => {
    const bucket = new InMemoryBucket();
    const result = await probeWebDav(
      {
        BUCKET: bucket.asBucket(),
        WEBDAV_USERNAME: "",
        WEBDAV_PASSWORD: "",
      },
      HOST
    );
    expect(result.status).toBe("skipped");
    expect(result.docs).toBe("webdav");
  });

  test("green when PROPFIND succeeds", async () => {
    const bucket = new InMemoryBucket();
    const result = await probeWebDav(makeEnv(bucket), HOST);
    expect(result.status).toBe("green");
  });

  test("configured credentials authenticate against themselves", async () => {
    // Probe signs PROPFIND with the same env credentials it verifies —
    // a typo in Pages secrets still "passes" until a real client fails.
    const bucket = new InMemoryBucket();
    const result = await probeWebDav(
      {
        BUCKET: bucket.asBucket(),
        WEBDAV_USERNAME: USER,
        WEBDAV_PASSWORD: "any-configured-secret",
      },
      HOST
    );
    expect(result.status).toBe("green");
  });
});

describe("probeFlags", () => {
  test("returns five switches", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      {
        key: CONFIG_KEY,
        body: JSON.stringify({ ...DEFAULT_FEATURE_FLAGS, webdav: false }),
        contentType: "application/json",
      },
    ]);
    const result = await probeFlags(bucket.asBucket());
    expect(result.status).toBe("green");
    expect(result.flags).toEqual({ ...DEFAULT_FEATURE_FLAGS, webdav: false });
  });
});

describe("probeSitesHost", () => {
  test("red when required and empty", () => {
    const result = probeSitesHost(
      { BUCKET: {} as R2Bucket, WEBDAV_USERNAME: "a", WEBDAV_PASSWORD: "b" },
      DEFAULT_FEATURE_FLAGS,
      "drive.example.com"
    );
    expect(result.status).toBe("red");
    expect(result.docs).toBe("sites");
  });

  test("skipped when sites+imageHost off and empty", () => {
    const result = probeSitesHost(
      { BUCKET: {} as R2Bucket, WEBDAV_USERNAME: "a", WEBDAV_PASSWORD: "b" },
      { ...DEFAULT_FEATURE_FLAGS, sites: false, imageHost: false },
      "drive.example.com"
    );
    expect(result.status).toBe("skipped");
  });

  test("red when same as drive host", () => {
    const result = probeSitesHost(
      {
        BUCKET: {} as R2Bucket,
        WEBDAV_USERNAME: "a",
        WEBDAV_PASSWORD: "b",
        SITES_HOST: "drive.example.com",
      },
      DEFAULT_FEATURE_FLAGS,
      "drive.example.com"
    );
    expect(result.status).toBe("red");
  });

  test("green when distinct hostname", () => {
    const result = probeSitesHost(
      {
        BUCKET: {} as R2Bucket,
        WEBDAV_USERNAME: "a",
        WEBDAV_PASSWORD: "b",
        SITES_HOST: "sites.example.com",
      },
      DEFAULT_FEATURE_FLAGS,
      "drive.example.com"
    );
    expect(result.status).toBe("green");
  });
});

describe("probeMcp", () => {
  test("red when mcp or apiKey off", async () => {
    const bucket = new InMemoryBucket();
    const result = await probeMcp(
      bucket.asBucket(),
      { ...DEFAULT_FEATURE_FLAGS, mcp: false },
      HOST
    );
    expect(result.status).toBe("red");
    expect(result.docs).toBe("API");
  });

  test("skipped when no API key (does not invent one)", async () => {
    const bucket = new InMemoryBucket();
    const result = await probeMcp(bucket.asBucket(), DEFAULT_FEATURE_FLAGS, HOST);
    expect(result.status).toBe("skipped");
    // Still no key invented
    const listing = await bucket.asBucket().list({ prefix: KEYS_PREFIX });
    expect(listing.objects.length).toBe(0);
  });

  test("green when key exists and tools/list works", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    const result = await probeMcp(bucket.asBucket(), DEFAULT_FEATURE_FLAGS, HOST);
    expect(result.status).toBe("green");
    // Probe key cleaned up; only the seeded user key remains
    const listing = await bucket.asBucket().list({ prefix: KEYS_PREFIX });
    expect(listing.objects.map((o) => o.key)).toEqual([
      `${KEYS_PREFIX}userkey.json`,
    ]);
  });
});

describe("allApplicableGreen", () => {
  test("treats skipped as non-blocking", () => {
    expect(
      allApplicableGreen([
        { id: "r2", status: "green", title: { zh: "", en: "" }, message: { zh: "", en: "" } },
        { id: "mcp", status: "skipped", title: { zh: "", en: "" }, message: { zh: "", en: "" } },
      ])
    ).toBe(true);
    expect(
      allApplicableGreen([
        { id: "r2", status: "red", title: { zh: "", en: "" }, message: { zh: "", en: "" } },
      ])
    ).toBe(false);
  });
});

describe("GET /api/setup", () => {
  test("rejects missing / API-key auth", async () => {
    const bucket = new InMemoryBucket();
    const env = makeEnv(bucket, { SITES_HOST: "sites.example.com" });
    const anon = await onRequestGet(
      makeContext(new Request(`${HOST}/api/setup`), env)
    );
    expect(anon.status).toBe(401);

    const keyed = await onRequestGet(
      makeContext(
        new Request(`${HOST}/api/setup`, {
          headers: { Authorization: "Bearer fd_nope" },
        }),
        env
      )
    );
    expect(keyed.status).toBe(401);
  });

  test("session returns structured checks", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    const env = makeEnv(bucket, { SITES_HOST: "sites.example.com" });
    const response = await onRequestGet(
      makeContext(
        new Request(`${HOST}/api/setup`, { headers: { Authorization: AUTH } }),
        env
      )
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      allApplicableGreen: boolean;
      mcpUrl: string;
      mcpJson: string;
      checks: Array<{ id: string; status: string }>;
    };
    expect(body.allApplicableGreen).toBe(true);
    expect(body.mcpUrl).toBe(`${HOST}/mcp`);
    expect(body.mcpJson).toContain("Bearer <apiKey>");
    expect(body.checks.map((c: { id: string }) => c.id)).toEqual([
      "r2",
      "webdav",
      "flags",
      "sitesHost",
      "mcp",
    ]);
    expect(body.checks.every((c: { status: string }) => c.status === "green")).toBe(
      true
    );
  });

  test("runSetupChecks marks mcp skipped without key", async () => {
    const bucket = new InMemoryBucket();
    const env = makeEnv(bucket, { SITES_HOST: "sites.example.com" });
    const result = await runSetupChecks(
      env,
      new Request(`${HOST}/api/setup`, { headers: { Authorization: AUTH } })
    );
    const mcp = result.checks.find((c) => c.id === "mcp");
    expect(mcp?.status).toBe("skipped");
    expect(result.allApplicableGreen).toBe(true);
  });
});
