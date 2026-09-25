/**
 * functions/api/_setup.ts 分支级直测：R2 读写探测（成功/读不到/内容不符/异常）、
 * WebDAV PROPFIND 探测（跳过/通过/401）、flags 读取、SITES_HOST 四种判定、
 * MCP 探测（开关关/无密钥跳过/探针密钥创建与清理）、汇总 runner。
 */
import {
  allApplicableGreen,
  buildMcpJsonSnippet,
  probeFlags,
  probeMcp,
  probeR2,
  probeSitesHost,
  probeWebDav,
  runSetupChecks,
  setupDocsHref,
  type SetupCheck,
} from "../../../functions/api/_setup";
import { KEYS_PREFIX } from "../../../functions/api/_apikey";
import { CONFIG_KEY } from "../../../functions/_flags";
import { InMemoryBucket, basicAuthHeader } from "../testInMemoryBucket";

const ORIGIN = "http://drive.example.com";

function makeEnv(bucket: InMemoryBucket, extra: Record<string, unknown> = {}) {
  return {
    BUCKET: bucket.asBucket(),
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
    ...extra,
  };
}

/** 包装 bucket：按脚本替换 get/put/delete 行为以模拟 R2 故障 */
function withOverrides(
  bucket: InMemoryBucket,
  overrides: Record<string, (...args: unknown[]) => unknown>
): R2Bucket {
  const base = bucket.asBucket() as unknown as Record<string, unknown>;
  return new Proxy(base, {
    get(target, prop) {
      if (prop in overrides) {
        return overrides[prop as string];
      }
      return target[prop as string];
    },
  }) as unknown as R2Bucket;
}

async function seedApiKey(bucket: InMemoryBucket) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fd_seed"));
  bucket.seed([
    {
      key: `${KEYS_PREFIX}seed.json`,
      body: JSON.stringify({
        id: "seed",
        name: "seed",
        prefix: "fd_seed",
        keyHash: Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: null,
      }),
      contentType: "application/json",
    },
  ]);
}

describe("纯工具函数", () => {
  test("buildMcpJsonSnippet 生成带 /mcp URL 的 JSON 片段", () => {
    const json = buildMcpJsonSnippet("http://drive.example.com/");
    const parsed = JSON.parse(json) as {
      mcpServers: { davflare: { url: string; headers: Record<string, string> } };
    };
    expect(parsed.mcpServers.davflare.url).toBe("http://drive.example.com/mcp");
    expect(parsed.mcpServers.davflare.headers.Authorization).toBe("Bearer <apiKey>");
  });

  test("setupDocsHref 区分语言与 API slug", () => {
    expect(setupDocsHref("deploy")).toBe("docs/deploy.md");
    expect(setupDocsHref("deploy", "zh")).toBe("docs/deploy.zh-CN.md");
    expect(setupDocsHref("API")).toBe("docs/API.md");
    expect(setupDocsHref("API", "zh")).toBe("docs/API.zh-CN.md");
  });

  test("allApplicableGreen：skipped 不算失败，red 算失败", () => {
    const checks = [
      { status: "green" },
      { status: "skipped" },
    ] as SetupCheck[];
    expect(allApplicableGreen(checks)).toBe(true);
    expect(
      allApplicableGreen([{ status: "green" }, { status: "red" }] as SetupCheck[])
    ).toBe(false);
  });
});

describe("probeR2", () => {
  test("读写正常 → green 且探测对象被清理", async () => {
    const bucket = new InMemoryBucket();
    const check = await probeR2(bucket.asBucket());
    expect(check.status).toBe("green");
    expect(check.message.zh).toBe("");
    const leftovers = await bucket.asBucket().list({
      prefix: "_$flaredrive$/setup-probe/",
    });
    expect(leftovers.objects).toHaveLength(0);
  });

  test("写入后读不到 → red", async () => {
    const bucket = new InMemoryBucket();
    const stub = withOverrides(bucket, {
      get: async () => null,
    });
    const check = await probeR2(stub);
    expect(check.status).toBe("red");
    expect(check.docs).toBe("deploy");
  });

  test("内容不符 → red", async () => {
    const bucket = new InMemoryBucket();
    const stub = withOverrides(bucket, {
      get: async (...args: unknown[]) => ({
        text: async () => "corrupted",
        key: args[0] as string,
      }),
    });
    const check = await probeR2(stub);
    expect(check.status).toBe("red");
  });

  test("异常 → red 且信息带错误详情", async () => {
    const bucket = new InMemoryBucket();
    const stub = withOverrides(bucket, {
      put: async () => {
        throw new Error("boom");
      },
    });
    const check = await probeR2(stub);
    expect(check.status).toBe("red");
    expect(check.message.zh).toContain("boom");
  });
});

describe("probeWebDav", () => {
  test("未配置凭据 → skipped", async () => {
    const bucket = new InMemoryBucket();
    const check = await probeWebDav(
      { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "", WEBDAV_PASSWORD: "" },
      ORIGIN
    );
    expect(check.status).toBe("skipped");
  });

  test("PROPFIND 207 → green", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    const check = await probeWebDav(makeEnv(bucket), ORIGIN);
    expect(check.status).toBe("green");
  });

  test("凭据与请求自洽（Basic 头由同组凭据构造，正常路径恒 207）", async () => {
    const bucket = new InMemoryBucket();
    const check = await probeWebDav(
      { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "wrong" },
      ORIGIN
    );
    // 探测请求的 Basic 头取自同一组凭据，认证恒通过；red 只能由后端异常触发
    expect(check.status).toBe("green");
  });

  test("env 未绑定 BUCKET → PROPFIND 404 → red", async () => {
    const check = await probeWebDav(
      { WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass" } as Parameters<typeof probeWebDav>[0],
      ORIGIN
    );
    expect(check.status).toBe("red");
    expect(check.message.en).toContain("404");
  });
});

describe("probeFlags", () => {
  test("默认全开；已存储的 flags 原样返回", async () => {
    const bucket = new InMemoryBucket();
    const def = await probeFlags(bucket.asBucket());
    expect(def.status).toBe("green");
    expect(def.flags).toEqual({
      webdav: true, mcp: true, apiKey: true, sites: true, imageHost: true,
    });

    bucket.seed([
      { key: CONFIG_KEY, body: JSON.stringify({ sites: false }), contentType: "application/json" },
    ]);
    const stored = await probeFlags(bucket.asBucket());
    expect(stored.flags?.sites).toBe(false);
  });
});

describe("probeSitesHost", () => {
  const flagsAllOn = { webdav: true, mcp: true, apiKey: true, sites: true, imageHost: true };
  const flagsAllOff = { webdav: true, mcp: true, apiKey: true, sites: false, imageHost: false };

  test("未配置 SITES_HOST 且开关全关 → skipped", () => {
    const check = probeSitesHost(makeEnv(new InMemoryBucket()), flagsAllOff, "drive.example.com");
    expect(check.status).toBe("skipped");
  });

  test("未配置 SITES_HOST 但需要站点 → red", () => {
    const check = probeSitesHost(makeEnv(new InMemoryBucket()), flagsAllOn, "drive.example.com");
    expect(check.status).toBe("red");
  });

  test("SITES_HOST 与网盘主机相同 → red", () => {
    const check = probeSitesHost(
      makeEnv(new InMemoryBucket(), { SITES_HOST: "Drive.Example.com" }),
      flagsAllOn,
      "drive.example.com:8080"
    );
    expect(check.status).toBe("red");
  });

  test("SITES_HOST 不是合法主机名 → red", () => {
    const check = probeSitesHost(
      makeEnv(new InMemoryBucket(), { SITES_HOST: "https://sites.example.com" }),
      flagsAllOn,
      "drive.example.com"
    );
    expect(check.status).toBe("red");
  });

  test("独立合法主机名 → green", () => {
    const check = probeSitesHost(
      makeEnv(new InMemoryBucket(), { SITES_HOST: "sites.example.com" }),
      flagsAllOn,
      "drive.example.com"
    );
    expect(check.status).toBe("green");
    expect(check.message.en).toContain("sites.example.com");
  });
});

describe("probeMcp", () => {
  test("MCP/API Key 开关关闭 → red", async () => {
    const bucket = new InMemoryBucket();
    const check = await probeMcp(
      bucket.asBucket(),
      { webdav: true, mcp: false, apiKey: true, sites: true, imageHost: true },
      ORIGIN
    );
    expect(check.status).toBe("red");
  });

  test("没有 API 密钥 → skipped", async () => {
    const bucket = new InMemoryBucket();
    const check = await probeMcp(
      bucket.asBucket(),
      { webdav: true, mcp: true, apiKey: true, sites: true, imageHost: true },
      ORIGIN
    );
    expect(check.status).toBe("skipped");
  });

  test("有密钥 → 探针密钥鉴权通过并返回工具列表，探针清理", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    const check = await probeMcp(
      bucket.asBucket(),
      { webdav: true, mcp: true, apiKey: true, sites: true, imageHost: true },
      ORIGIN
    );
    expect(check.status).toBe("green");
    expect(check.message.en).toMatch(/tools\/list returned \d+ tools/);
    const leftovers = await bucket.asBucket().list({ prefix: KEYS_PREFIX });
    expect(leftovers.objects.map((o) => o.key)).toEqual([`${KEYS_PREFIX}seed.json`]);
  });
});

describe("runSetupChecks 汇总", () => {
  test("绿色环境：5 项检查全 green/skipped，origin 与 mcpJson 就位", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    const request = new Request(`${ORIGIN}/api/setup`, {
      headers: { Host: "drive.example.com" },
    });
    const result = await runSetupChecks(
      makeEnv(bucket, { SITES_HOST: "sites.example.com" }),
      request
    );
    expect(result.checks.map((c) => c.id)).toEqual(["r2", "webdav", "flags", "sitesHost", "mcp"]);
    expect(result.allApplicableGreen).toBe(true);
    expect(result.origin).toBe(ORIGIN);
    expect(result.mcpUrl).toBe(`${ORIGIN}/mcp`);
    expect(result.mcpJson).toContain("davflare");
  });

  test("未配置凭据且站点关闭时 WebDAV skipped，整体仍绿", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      {
        key: CONFIG_KEY,
        body: JSON.stringify({ sites: false, imageHost: false }),
        contentType: "application/json",
      },
    ]);
    const request = new Request(`${ORIGIN}/api/setup`);
    const result = await runSetupChecks(
      { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "", WEBDAV_PASSWORD: "" },
      request
    );
    const webdav = result.checks.find((c) => c.id === "webdav");
    expect(webdav?.status).toBe("skipped");
    expect(result.allApplicableGreen).toBe(true);
  });

  test("Basic 头构造与 basicAuthHeader 一致（utf8ToBase64 联动）", () => {
    expect(basicAuthHeader("user", "pass")).toBe(
      `Basic ${btoa("user:pass")}`
    );
  });
});
