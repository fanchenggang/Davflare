// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// main.tsx 静态 import 了整棵 <App/>；在 bridge 单测里 mock 掉，
// 避免冷启动拉起 React+MUI 整树导致 CI 上偶发超过默认 5s timeout。
// 完整渲染链路由手动用例覆盖（见 TESTING.md）。
vi.mock("../../App", () => ({
  default: function MockApp(props: {layout?:string;themeMode?:string;onThemeModeChange?:(mode:string)=>void}) {
    return <button onClick={() => props.onThemeModeChange?.("light")}>{props.layout}:{props.themeMode}</button>;
  },
}));

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
    vi.resetModules();
  });

  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
    delete (window as unknown as { DavflareDrive?: unknown }).DavflareDrive;
    delete window.DavflareTheme;
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

it("embedded drive follows extension theme changes and writes selections back", async () => {
  stubChrome({granted:true});
  let callback: ((mode:"system"|"light"|"dark") => void) | undefined;
  const write = vi.fn(async () => {}), dispose = vi.fn();
  window.DavflareTheme = {getPreference:()=>"dark",setPreference:write,subscribe:fn=>{callback=fn;return dispose;}};
  await import("../main");
  const target=document.createElement("div");document.body.appendChild(target);
  window.DavflareDrive!.mount(target,"https://drive.example.com");
  await vi.waitFor(()=>expect(target.textContent).toBe("embedded:dark"));
  callback!("system");await vi.waitFor(()=>expect(target.textContent).toBe("embedded:system"));
  target.querySelector("button")!.click();expect(write).toHaveBeenCalledWith("light");
  window.DavflareDrive!.reload();await vi.waitFor(()=>expect(dispose).toHaveBeenCalled());
});

});
