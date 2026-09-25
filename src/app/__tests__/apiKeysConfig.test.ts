/**
 * functions/api/keys + config 分支级直测：API key 生命周期（生成/自定义/过期
 * 校验输入、hash 存储、lastUsed 公开字段）、config 读默认值/持久化 flags、
 * PATCH 的三种鉴权结局（Basic ok / API key 403 / 匿名 401）与补丁校验。
 */
import { onRequestGet as keysOnGet, onRequestPost as keysOnPost, onRequestDelete as keysOnDelete } from "../../../functions/api/keys";
import { authorizeConfigWrite, onRequestGet as configOnGet, onRequestPatch as configOnPatch, onRequestPut as configOnPut } from "../../../functions/api/config";
import { KEYS_PREFIX } from "../../../functions/api/_apikey";
import { CONFIG_KEY } from "../../../functions/_flags";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const HOST = "http://drive.example.com";
const AUTH = basicAuthHeader("user", "pass");

function makeEnv(bucket: InMemoryBucket, extra: Record<string, unknown> = {}) {
  return {
    BUCKET: bucket.asBucket(),
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
    ...extra,
  };
}

function basicRequest(path: string, method: string, body?: string, headers: Record<string, string> = {}) {
  return new Request(`${HOST}${path}`, {
    method,
    headers: { Authorization: AUTH, ...headers },
    body,
  });
}

describe("keys", () => {
  test("GET 未授权 401；列表按 createdAt 倒序且不泄漏 hash", async () => {
    const bucket = new InMemoryBucket();
    const noAuth = await keysOnGet(
      makeContext(new Request(`${HOST}/api/keys`), makeEnv(bucket))
    );
    expect(noAuth.status).toBe(401);

    bucket.seed([
      {
        key: `${KEYS_PREFIX}a.json`,
        body: JSON.stringify({
          id: "a", name: "old", prefix: "fd_old", keyHash: "h1",
          createdAt: "2026-01-01T00:00:00.000Z", expiresAt: null,
        }),
      },
      {
        key: `${KEYS_PREFIX}b.json`,
        body: JSON.stringify({
          id: "b", name: "new", prefix: "fd_new", keyHash: "h2",
          createdAt: "2026-03-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z",
          createdBy: "user", lastUsedAt: "2026-04-01T00:00:00.000Z",
        }),
      },
      { key: `${KEYS_PREFIX}broken.json`, body: "{oops" },
      { key: `${KEYS_PREFIX}extra.txt`, body: "not json record" },
    ]);
    const response = await keysOnGet(
      makeContext(basicRequest("/api/keys", "GET"), makeEnv(bucket))
    );
    expect(response.status).toBe(200);
    const keys = (await response.json()) as Array<Record<string, unknown>>;
    expect(keys.map((key) => key.id)).toEqual(["b", "a"]);
    expect(keys[0]).toMatchObject({
      name: "new",
      prefix: "fd_new",
      createdBy: "user",
      lastUsedAt: "2026-04-01T00:00:00.000Z",
    });
    for (const key of keys) {
      expect(key.keyHash).toBeUndefined();
    }
  });

  test("POST 生成 fd_ 前缀随机 key 并存 hash", async () => {
    const bucket = new InMemoryBucket();
    const response = await keysOnPost(
      makeContext(
        basicRequest("/api/keys", "POST", JSON.stringify({ name: "ci" })),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, string>;
    expect(body.name).toBe("ci");
    expect(body.key).toMatch(/^fd_[0-9a-f]{64}$/);
    expect(body.prefix).toBe(body.key.slice(0, 8));
    expect(body.createdBy).toBe("user");
    expect(body.expiresAt).toBeNull();

    const stored = bucket.rawJson<{ keyHash: string }>(`${KEYS_PREFIX}${body.id}.json`);
    expect(stored?.keyHash).not.toBe(body.key);
    expect(stored?.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("POST 自定义 key 合法保留、非法拒绝", async () => {
    const bucket = new InMemoryBucket();
    const ok = await keysOnPost(
      makeContext(
        basicRequest("/api/keys", "POST", JSON.stringify({ name: "x", key: "my-custom-key" })),
        makeEnv(bucket)
      )
    );
    expect(((await ok.json()) as Record<string, string>).key).toBe("my-custom-key");

    const short = await keysOnPost(
      makeContext(
        basicRequest("/api/keys", "POST", JSON.stringify({ name: "x", key: "abc" })),
        makeEnv(bucket)
      )
    );
    expect(short.status).toBe(400);

    const whitespace = await keysOnPost(
      makeContext(
        basicRequest("/api/keys", "POST", JSON.stringify({ name: "x", key: "ab cd" })),
        makeEnv(bucket)
      )
    );
    expect(whitespace.status).toBe(400);
  });

  test("POST 校验：缺名称 400、坏 JSON 400、expiresInHours 换算过期时间", async () => {
    const bucket = new InMemoryBucket();
    const noName = await keysOnPost(
      makeContext(
        basicRequest("/api/keys", "POST", JSON.stringify({ name: "  " })),
        makeEnv(bucket)
      )
    );
    expect(noName.status).toBe(400);
    expect(await noName.text()).toBe("请填写密钥名称");

    const badJson = await keysOnPost(
      makeContext(basicRequest("/api/keys", "POST", "{nope"), makeEnv(bucket))
    );
    expect(badJson.status).toBe(400);
    expect(await badJson.text()).toBe("Bad Request");

    const withExpiry = await keysOnPost(
      makeContext(
        basicRequest("/api/keys", "POST", JSON.stringify({ name: "x", expiresInHours: 24 })),
        makeEnv(bucket)
      )
    );
    const body = (await withExpiry.json()) as { expiresAt: string };
    const expected = Date.parse(body.expiresAt) - Date.now();
    expect(expected).toBeGreaterThan(23.9 * 60 * 60 * 1000);
    expect(expected).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  test("DELETE 按 id 移除；缺 id 400；未授权 401", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      {
        key: `${KEYS_PREFIX}doomed.json`,
        body: JSON.stringify({ id: "doomed", name: "x", prefix: "fd_", keyHash: "h", createdAt: "" }),
      },
    ]);
    const noAuth = await keysOnDelete(
      makeContext(new Request(`${HOST}/api/keys?id=doomed`, { method: "DELETE" }), makeEnv(bucket))
    );
    expect(noAuth.status).toBe(401);

    const response = await keysOnDelete(
      makeContext(
        basicRequest("/api/keys?id=doomed", "DELETE"),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(204);
    expect(bucket.has(`${KEYS_PREFIX}doomed.json`)).toBe(false);

    const noId = await keysOnDelete(
      makeContext(basicRequest("/api/keys", "DELETE"), makeEnv(bucket))
    );
    expect(noId.status).toBe(400);
  });
});

describe("config", () => {
  test("GET 默认 flags + env 信息；未授权 401", async () => {
    const bucket = new InMemoryBucket();
    const noAuth = await configOnGet(
      makeContext(new Request(`${HOST}/api/config`), makeEnv(bucket))
    );
    expect(noAuth.status).toBe(401);

    const response = await configOnGet(
      makeContext(basicRequest("/api/config", "GET"), makeEnv(bucket, { SITES_HOST: "Sites.Example.com." }))
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      username: "user",
      publicRead: false,
      sitesHost: "sites.example.com",
      webdav: true,
      mcp: true,
      apiKey: true,
      sites: true,
      imageHost: true,
    });
  });

  test("GET 反映已持久化的 flags 与 WEBDAV_PUBLIC_READ", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      {
        key: CONFIG_KEY,
        body: JSON.stringify({ webdav: false, mcp: "not-boolean" }),
        contentType: "application/json",
      },
    ]);
    const response = await configOnGet(
      makeContext(
        basicRequest("/api/config", "GET"),
        makeEnv(bucket, { WEBDAV_PUBLIC_READ: "1" })
      )
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.webdav).toBe(false);
    // 非布尔值回退默认
    expect(body.mcp).toBe(true);
    expect(body.publicRead).toBe(true);
  });

  test("PATCH 鉴权：Basic 通过 / API key 403 / 匿名 401", async () => {
    const bucket = new InMemoryBucket();
    const ok = await configOnPatch(
      makeContext(
        basicRequest("/api/config", "PATCH", JSON.stringify({ mcp: false })),
        makeEnv(bucket)
      )
    );
    expect(ok.status).toBe(200);

    const byKey = await configOnPatch(
      makeContext(
        new Request(`${HOST}/api/config`, {
          method: "PATCH",
          headers: { "X-Api-Key": "fd_whatever" },
          body: JSON.stringify({ mcp: false }),
        }),
        makeEnv(bucket)
      )
    );
    expect(byKey.status).toBe(403);
    expect(await byKey.text()).toBe("API keys cannot change feature flags");

    const anonymous = await configOnPatch(
      makeContext(
        new Request(`${HOST}/api/config`, {
          method: "PATCH",
          body: JSON.stringify({ mcp: false }),
        }),
        makeEnv(bucket)
      )
    );
    expect(anonymous.status).toBe(401);
  });

  test("PATCH 校验：坏 JSON / 非对象 / 非布尔 / 空补丁", async () => {
    const bucket = new InMemoryBucket();
    const badJson = await configOnPatch(
      makeContext(basicRequest("/api/config", "PATCH", "{nope"), makeEnv(bucket))
    );
    expect(badJson.status).toBe(400);
    expect(await badJson.text()).toBe("Bad Request");

    for (const [payload, error] of [
      ["[]", "body must be an object"],
      [JSON.stringify({ mcp: "yes" }), "mcp must be a boolean"],
      [JSON.stringify({ unrelated: 1 }), "no flags to update"],
    ] as const) {
      const response = await configOnPatch(
        makeContext(basicRequest("/api/config", "PATCH", payload), makeEnv(bucket))
      );
      expect(response.status).toBe(400);
      expect(await response.text()).toBe(error);
    }
  });

  test("PATCH 持久化到 CONFIG_KEY 并只覆盖提交的开关；PUT 等价 PATCH", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: CONFIG_KEY, body: JSON.stringify({ sites: false }), contentType: "application/json" },
    ]);
    const patched = await configOnPatch(
      makeContext(
        basicRequest("/api/config", "PATCH", JSON.stringify({ mcp: false })),
        makeEnv(bucket)
      )
    );
    const body = (await patched.json()) as Record<string, unknown>;
    // 已存的 sites:false 保留，只覆盖提交的 mcp
    expect(body.sites).toBe(false);
    expect(body.mcp).toBe(false);
    expect(bucket.rawJson<Record<string, unknown>>(CONFIG_KEY)).toEqual({
      webdav: true,
      mcp: false,
      apiKey: true,
      sites: false,
      imageHost: true,
    });

    const viaPut = await configOnPut(
      makeContext(
        basicRequest("/api/config", "PUT", JSON.stringify({ mcp: true })),
        makeEnv(bucket)
      )
    );
    expect(((await viaPut.json()) as Record<string, unknown>).mcp).toBe(true);
  });

  test("authorizeConfigWrite 直接导出三分支", () => {
    expect(
      authorizeConfigWrite(basicRequest("/api/config", "PATCH"), "user", "pass")
    ).toBe("ok");
    expect(
      authorizeConfigWrite(
        new Request(`${HOST}/api/config`, {
          method: "PATCH",
          headers: { Authorization: "Bearer fd_whatever" },
        }),
        "user",
        "pass"
      )
    ).toBe("api-key-forbidden");
    expect(authorizeConfigWrite(basicRequest("/api/config", "PATCH"), "user", "wrong")).toBe(
      "unauthorized"
    );
  });
});
