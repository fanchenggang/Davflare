import { act, renderHook } from "@testing-library/react";

import { useHashRoute } from "../route";

function setHash(hash: string) {
  window.location.hash = hash;
}

async function flushEvents() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("useHashRoute extras", () => {
  beforeEach(() => {
    setHash("");
    window.history.replaceState(null, "", window.location.pathname);
  });

  test("#/sites 解析为站点分区", () => {
    setHash("#/sites");
    const { result } = renderHook(() => useHashRoute());
    expect(result.current[0]).toEqual({ kind: "sites" });
  });

  test("navigate 到 sites", async () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => result.current[1]({ kind: "sites" }));
    expect(window.location.hash).toBe("#/sites");
    await flushEvents();
    expect(result.current[0]).toEqual({ kind: "sites" });
  });

  test("navigate 到相同 hash 直接更新状态", () => {
    setHash("#/docs/");
    const { result } = renderHook(() => useHashRoute());
    act(() => result.current[1]({ kind: "folder", path: "docs/" }));
    expect(result.current[0]).toEqual({ kind: "folder", path: "docs/" });
    expect(window.location.hash).toBe("#/docs/");
  });

  test("?p= 查询参数映射到 hash 并移除 p", () => {
    window.history.replaceState(null, "", "?p=docs/my%20file");
    const { result } = renderHook(() => useHashRoute());
    expect(result.current[0]).toEqual({ kind: "folder", path: "docs/my file/" });
    expect(window.location.hash).toBe("#/docs/my%20file/");
    expect(window.location.search).not.toContain("p=");
  });

  test("?p= 为空且 hash 为空时返回 null 路由（回退 hash 解码）", () => {
    window.history.replaceState(null, "", "?p=");
    const { result } = renderHook(() => useHashRoute());
    expect(result.current[0]).toEqual({ kind: "folder", path: "" });
    expect(window.location.search).toBe("");
  });
});
