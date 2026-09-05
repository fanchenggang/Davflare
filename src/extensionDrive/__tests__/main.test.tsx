// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// main.tsx 在 import 时把 window.DavflareDrive 挂到 window 上;
// 这里用 jsdom + chrome mock 验证挂载、权限门与凭据播种的最小行为。
// 完整渲染 <App/> 的链路由手动用例覆盖(见 TESTING.md),避免在测试里
// 真正拉起整个应用打网络请求。

const storageStore: Record<string, unknown> = {};

function stubChrome(opts: { granted: boolean }) {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (keys: string[]) =>
          Object.fromEntries(
            keys
              .filter((key) => key in storageStore)
              .map((key) => [key, storageStore[key]])
          ),
        set: async (obj: Record<string, unknown>) => {
          Object.assign(storageStore, obj);
        },
        remove: async (keys: string[]) => {
          for (const key of keys) delete storageStore[key];
        },
      },
      sync: { get: async () => ({}) },
    },
    permissions: {
      contains: vi.fn(async () => opts.granted),
      request: vi.fn(async () => true),
    },
  };
}

describe("DavflareDrive bridge", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
    for (const key of Object.keys(storageStore)) delete storageStore[key];
  });

  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
    vi.restoreAllMocks();
  });

  it("exposes mount/reload on window", async () => {
    stubChrome({ granted: true });
    await import("../main");
    expect(window.DavflareDrive).toBeDefined();
    expect(typeof window.DavflareDrive?.mount).toBe("function");
    expect(typeof window.DavflareDrive?.reload).toBe("function");
  });

  it("rejects invalid instance URLs without rendering", async () => {
    stubChrome({ granted: true });
    await import("../main");
    const target = document.createElement("div");
    document.body.appendChild(target);
    window.DavflareDrive!.mount(target, "not-a-url");
    expect(target.textContent).toContain("Invalid instance URL");
  });

  it("shows the grant card when the instance origin is not authorized", async () => {
    stubChrome({ granted: false });
    await import("../main");
    const target = document.createElement("div");
    document.body.appendChild(target);
    window.DavflareDrive!.mount(target, "https://drive.example.com");
    await vi.waitFor(() => {
      expect(target.querySelector("button")).not.toBeNull();
    });
    expect(target.textContent).toContain("Grant access");
  });

  it("seeds chrome.storage credentials into the app auth module", async () => {
    // 走未授权路径:seedCredentials 在权限门之前执行,且不会渲染 <App/>
    stubChrome({ granted: false });
    storageStore.davUsername = "alice";
    storageStore.davPassword = "secret";
    await import("../main");
    const target = document.createElement("div");
    document.body.appendChild(target);
    window.DavflareDrive!.mount(target, "https://drive.example.com");
    await vi.waitFor(() => {
      expect(window.localStorage.getItem("flaredrive.auth")).toContain("alice");
    });
  });
});
