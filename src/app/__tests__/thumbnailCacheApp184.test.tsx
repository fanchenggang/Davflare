/**
 * #184：App 挂载时就挂上「退出登录清缩略图缓存」，不需要加载过任何缩略图。
 * 单独一个文件：静态导入 App（vi.mock 提升），避免 resetModules 后重新加载整棵 MUI 树拖慢 CI。
 */
import { vi } from "vitest";
import { act, render } from "@testing-library/react";

import App from "../../App";
import { clearCredentials, setCredentials } from "../auth";

vi.mock("../transferQueue", () => ({
  TransferQueueProvider: ({ children }: { children: JSX.Element }) => children,
  useTransferQueue: () => [],
  useTransferQueueActions: () => ({}),
  useTransferQueueGlobalPaused: () => false,
  useUploadEnqueue: () => vi.fn(),
}));
vi.mock("../../Main", () => ({ __esModule: true, default: () => <div>main-stub</div> }));
vi.mock("../../CommandPalette", () => ({ __esModule: true, default: () => null }));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

test("mounting App hooks the cleanup (no thumbnail involved)", async () => {
  setCredentials({ username: "bgb", password: "p" });
  const stores = new Map<string, unknown>([["davflare-thumbnails-v1", {}]]);
  const del = vi.fn(async (name: string) => stores.delete(name));
  vi.stubGlobal("caches", { delete: del });

  const view = render(<App />);
  expect(del).not.toHaveBeenCalled(); // 已登录：启动时不清
  act(() => clearCredentials()); // 退出登录
  await vi.waitFor(() => expect(stores.has("davflare-thumbnails-v1")).toBe(false));
  expect(del).toHaveBeenCalledWith("davflare-thumbnails-v1");
  view.unmount();
}, 30_000);
