import { vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { loadRecent, pushRecent, useRecent } from "../recent";
import { clearStorage } from "../testUtils";

beforeEach(() => {
  clearStorage();
});

describe("recent / loadRecent", () => {
  test("空存储返回空数组", () => {
    expect(loadRecent()).toEqual([]);
  });

  test("解析并过滤非法条目", () => {
    localStorage.setItem(
      "flaredrive.recent",
      JSON.stringify([
        { key: "a.txt", name: "a.txt", isDir: false, at: 1 },
        { key: "b.txt", name: "b.txt", isDir: true, at: 2 },
        null,
        { key: 1, name: "bad" },
        "junk",
      ])
    );
    expect(loadRecent()).toEqual([
      { key: "a.txt", name: "a.txt", isDir: false, at: 1 },
      { key: "b.txt", name: "b.txt", isDir: true, at: 2 },
    ]);
  });

  test("损坏 JSON 返回空数组", () => {
    localStorage.setItem("flaredrive.recent", "{bad json");
    expect(loadRecent()).toEqual([]);
  });

  test("最多 20 条", () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ key: `k${i}`, name: `n${i}`, isDir: false, at: i }));
    localStorage.setItem("flaredrive.recent", JSON.stringify(items));
    expect(loadRecent()).toHaveLength(20);
  });
});

describe("recent / pushRecent", () => {
  test("新条目插入头部并去重", () => {
    pushRecent({ key: "a.txt", name: "a.txt", isDir: false });
    pushRecent({ key: "b.txt", name: "b.txt", isDir: false });
    pushRecent({ key: "a.txt", name: "a.txt", isDir: false });
    const items = loadRecent();
    expect(items.map((i) => i.key)).toEqual(["a.txt", "b.txt"]);
    expect(items[0].at).toBeGreaterThan(0);
  });

  test("触发 window 事件", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    pushRecent({ key: "a.txt", name: "a.txt", isDir: false });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("recent / useRecent", () => {
  test("storage 与自定义事件驱动更新", () => {
    const { result } = renderHook(() => useRecent());
    expect(result.current).toEqual([]);

    act(() => {
      localStorage.setItem(
        "flaredrive.recent",
        JSON.stringify([{ key: "a", name: "a", isDir: false, at: 1 }])
      );
      window.dispatchEvent(new Event("storage"));
    });
    expect(result.current).toEqual([{ key: "a", name: "a", isDir: false, at: 1 }]);

    act(() => {
      localStorage.clear();
      window.dispatchEvent(new Event("flaredrive-recent"));
    });
    expect(result.current).toEqual([]);
  });
});
