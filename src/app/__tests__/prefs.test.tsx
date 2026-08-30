import { act, renderHook } from "@testing-library/react";

import { usePersistedState } from "../prefs";

beforeEach(() => {
  localStorage.clear();
});

describe("prefs / usePersistedState", () => {
  test("无存储时使用初始值", () => {
    const { result } = renderHook(() => usePersistedState("k", "v0"));
    expect(result.current[0]).toBe("v0");
  });

  test("有存储时读取 JSON", () => {
    localStorage.setItem("k", JSON.stringify({ field: "size", order: "desc" }));
    const { result } = renderHook(() => usePersistedState("k", { field: "name", order: "asc" }));
    expect(result.current[0]).toEqual({ field: "size", order: "desc" });
  });

  test("损坏 JSON 回退初始值", () => {
    localStorage.setItem("k", "not json");
    const { result } = renderHook(() => usePersistedState("k", 42));
    expect(result.current[0]).toBe(42);
  });

  test("setValue 持久化到 localStorage", () => {
    const { result } = renderHook(() => usePersistedState("k", 1));
    act(() => result.current[1](2));
    expect(localStorage.getItem("k")).toBe("2");
  });
});
