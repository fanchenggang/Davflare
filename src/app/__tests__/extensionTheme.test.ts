import { createRequire } from "module";
import { vi } from "vitest";
const Theme = createRequire(import.meta.url)("../../../extension/theme.js");
type Change = (
  changes: Record<string, { newValue?: unknown }>,
  area: string,
) => void;
function harness(
  stored: unknown = undefined,
  legacy: Record<string, string> = {},
  dark = false,
) {
  let change: Change = () => {};
  let mediaChange: () => void = () => {};
  const media = {
    matches: dark,
    addEventListener: vi.fn((_type, fn) => {
      mediaChange = fn;
    }),
    removeEventListener: vi.fn(),
  };
  const storage = {
    get: vi.fn(async () => ({ [Theme.KEY]: stored })),
    set: vi.fn(async () => {}),
  };
  const changes = {
    addListener: vi.fn((fn) => {
      change = fn;
    }),
    removeListener: vi.fn(),
  };
  const controller = Theme.create({
    storage,
    changes,
    media,
    legacy: { getItem: (key: string) => legacy[key] ?? null },
  });
  return {
    controller,
    storage,
    media,
    changes,
    emit: (value: unknown, area = "local") =>
      change({ [Theme.KEY]: { newValue: value } }, area),
    system: (value: boolean) => {
      media.matches = value;
      mediaChange();
    },
  };
}
test("migrates library preference before embedded drive, falling back to system", async () => {
  const a = harness(undefined, {
    "davflare-theme": "dark",
    "flaredrive.themeMode": '"light"',
  });
  await a.controller.ready;
  expect(a.controller.getPreference()).toBe("dark");
  expect(a.storage.set).toHaveBeenCalledWith({ [Theme.KEY]: "dark" });
  const b = harness(undefined, { "flaredrive.themeMode": '"light"' });
  await b.controller.ready;
  expect(b.controller.getPreference()).toBe("light");
  expect(Theme.legacyPreference({ getItem: () => "invalid" })).toBe("system");
  expect(
    Theme.legacyPreference({
      getItem: () => {
        throw new Error("blocked");
      },
    }),
  ).toBe("system");
  const c = harness();
  await c.controller.ready;
  expect(c.controller.getPreference()).toBe("system");
});
test("persisted preference wins over legacy and updates all page subscribers", async () => {
  const h = harness("light", { "davflare-theme": "dark" });
  await h.controller.ready;
  expect(h.storage.set).not.toHaveBeenCalled();
  const first = vi.fn(),
    second = vi.fn();
  const unsubscribe = h.controller.subscribe(first);
  h.controller.subscribe(second);
  h.emit("dark");
  expect(first).toHaveBeenLastCalledWith("dark", "dark");
  expect(second).toHaveBeenLastCalledWith("dark", "dark");
  unsubscribe();
  h.emit("light");
  expect(first).toHaveBeenCalledTimes(2);
  h.emit("dark", "sync");
  expect(h.controller.getPreference()).toBe("light");
  h.emit("bad");
  expect(h.controller.getPreference()).toBe("system");
  h.controller.dispose();
  expect(h.changes.removeListener).toHaveBeenCalled();
  expect(h.media.removeEventListener).toHaveBeenCalled();
});
test("system mode follows live OS changes while explicit modes ignore them", async () => {
  const h = harness("system");
  await h.controller.ready;
  const listener = vi.fn();
  h.controller.subscribe(listener);
  h.system(true);
  expect(listener).toHaveBeenLastCalledWith("system", "dark");
  await h.controller.setPreference("light");
  expect(h.storage.set).toHaveBeenLastCalledWith({ [Theme.KEY]: "light" });
  const count = listener.mock.calls.length;
  h.system(false);
  expect(listener).toHaveBeenCalledTimes(count);
  await h.controller.setPreference("garbage");
  expect(h.controller.getPreference()).toBe("light");
});
test("explicit user changes and external storage changes beat asynchronous startup", async () => {
  const h = harness("light");
  await h.controller.setPreference("dark");
  await h.controller.ready;
  expect(h.controller.getPreference()).toBe("dark");
  const g = harness("light");
  g.emit("dark");
  await g.controller.ready;
  expect(g.controller.getPreference()).toBe("dark");
});
test("storage failures keep a usable session appearance", async () => {
  const h = harness("system");
  await h.controller.ready;
  h.storage.set.mockRejectedValueOnce(new Error("quota"));
  await h.controller.setPreference("dark");
  expect(h.controller.getEffective()).toBe("dark");
  const controller = Theme.create({
    storage: {
      get: async () => {
        throw new Error("blocked");
      },
    },
    changes: { addListener: () => {}, removeListener: () => {} },
    media: {
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  const listener = vi.fn();
  controller.subscribe(listener);
  await controller.ready;
  expect(listener).toHaveBeenLastCalledWith("system", "dark");
});

test("real edge panel reads extension storage, follows changes and removes theme listeners on disable", async () => {
  const fs = await import("node:fs");
  const listeners: Change[] = [];
  const messages: Array<(message: { type: string }) => void> = [];
  let systemChange = () => {};
  const media = {
    matches: false,
    addEventListener: vi.fn((_type, fn) => {
      systemChange = fn;
    }),
    removeEventListener: vi.fn(),
  };
  const old = window.matchMedia;
  window.matchMedia = vi.fn(() => media) as unknown as typeof window.matchMedia;
  const changes = {
    addListener: vi.fn((fn) => listeners.push(fn)),
    removeListener: vi.fn(),
  };
  const chromeMock = {
    storage: {
      local: { get: async () => ({ "davflare.themeMode": "dark" }) },
      sync: {
        get: (_keys: unknown, callback: (r: object) => void) => callback({}),
      },
      onChanged: changes,
    },
    runtime: {
      onMessage: {
        addListener: (fn: (m: { type: string }) => void) => messages.push(fn),
      },
      sendMessage: vi.fn(),
    },
  };
  const source = fs.readFileSync(
    createRequire(import.meta.url).resolve("../../../extension/edgePanel.js"),
    "utf8",
  );
  const before = new Set(Array.from(document.documentElement.children));
  try {
    new Function("chrome", source)(chromeMock);
    await Promise.resolve();
    const host = Array.from(document.documentElement.children).find(
      (node) => !before.has(node),
    ) as HTMLElement;
    expect(host.dataset.theme).toBe("dark");
    listeners[0]({ "davflare.themeMode": { newValue: "light" } }, "local");
    expect(host.dataset.theme).toBe("light");
    listeners[0]({ "davflare.themeMode": { newValue: "system" } }, "local");
    media.matches = true;
    systemChange();
    expect(host.dataset.theme).toBe("dark");
    listeners[0]({ "davflare.themeMode": { newValue: "light" } }, "sync");
    expect(host.dataset.theme).toBe("dark");
    messages[0]({ type: "davflare-edge-remove" });
    expect(host.isConnected).toBe(false);
    expect(changes.removeListener).toHaveBeenCalled();
    expect(media.removeEventListener).toHaveBeenCalled();
  } finally {
    window.matchMedia = old;
    delete (window as unknown as Record<string, unknown>)
      .__davflareEdgePanelLoaded;
    delete (window as unknown as Record<string, unknown>)
      .__davflareEdgePanelToggle;
  }
});
