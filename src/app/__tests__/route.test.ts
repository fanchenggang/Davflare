import { act, renderHook } from "@testing-library/react";
import { useHashRoute } from "../route";

function setHash(hash: string) {
  window.location.hash = hash;
}

// jsdom 的 hashchange 是异步任务，推进事件循环后路由才更新
async function flushEvents() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("useHashRoute", () => {
  beforeEach(() => {
    setHash("");
    // 清掉可能存在的 ?p= 查询参数
    window.history.replaceState(null, "", window.location.pathname);
  });

  test("空 hash 解析为根目录", () => {
    const { result } = renderHook(() => useHashRoute());
    expect(result.current[0]).toEqual({ kind: "folder", path: "" });
  });

  test("#/trash 与 #/shares 解析为对应分区", () => {
    setHash("#/trash");
    const trash = renderHook(() => useHashRoute());
    expect(trash.result.current[0]).toEqual({ kind: "trash" });
    trash.unmount();

    setHash("#/shares");
    const shares = renderHook(() => useHashRoute());
    expect(shares.result.current[0]).toEqual({ kind: "shares" });
    shares.unmount();
  });

  test("多级路径解析为 folder 且保留结尾斜杠语义", () => {
    setHash("#/docs/imgs");
    const { result } = renderHook(() => useHashRoute());
    expect(result.current[0]).toEqual({ kind: "folder", path: "docs/imgs/" });
  });

  test("路径段经 URI 解码（中文与空格目录名）", () => {
    setHash("#/%E6%96%87%E6%A1%A3/my%20pics");
    const { result } = renderHook(() => useHashRoute());
    expect(result.current[0]).toEqual({
      kind: "folder",
      path: "文档/my pics/",
    });
  });

  test("navigate 写入 hash 并更新路由", async () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => {
      result.current[1]({ kind: "folder", path: "a b/中文/" });
    });
    expect(window.location.hash).toBe("#/a%20b/%E4%B8%AD%E6%96%87/");
    await flushEvents();
    expect(result.current[0]).toEqual({ kind: "folder", path: "a b/中文/" });
  });

  test("navigate 到 trash/shares", async () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => {
      result.current[1]({ kind: "trash" });
    });
    expect(window.location.hash).toBe("#/trash");
    await flushEvents();
    expect(result.current[0]).toEqual({ kind: "trash" });
  });

  test("浏览器 hashchange 事件驱动路由更新", async () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => {
      window.location.hash = "#/manual/";
    });
    await flushEvents();
    expect(result.current[0]).toEqual({ kind: "folder", path: "manual/" });
  });
});
