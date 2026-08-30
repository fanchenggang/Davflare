import React from "react";
import { act, renderHook } from "@testing-library/react";

import { ClipboardProvider, useClipboard } from "../clipboard";

function wrapper({ children }: { children: React.ReactNode }) {
  return <ClipboardProvider>{children}</ClipboardProvider>;
}

describe("clipboard / ClipboardProvider", () => {
  test("初始为空，copy/cut/clear 更新状态", () => {
    const { result } = renderHook(() => useClipboard(), { wrapper });

    expect(result.current.clipboard).toBeNull();

    act(() => result.current.copy(["a.txt"]));
    expect(result.current.clipboard).toEqual({ mode: "copy", keys: ["a.txt"] });

    act(() => result.current.cut(["b.txt", "c.txt"]));
    expect(result.current.clipboard).toEqual({ mode: "cut", keys: ["b.txt", "c.txt"] });

    act(() => result.current.clear());
    expect(result.current.clipboard).toBeNull();
  });
});
