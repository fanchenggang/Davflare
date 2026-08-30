import { act, renderHook } from "@testing-library/react";

import { setLang, strings, useLang } from "../strings";

describe("strings / Proxy 与 useLang", () => {
  afterEach(() => {
    localStorage.clear();
    setLang("zh");
  });

  test("Proxy 按当前语言返回文案", () => {
    setLang("zh");
    expect(strings.upload).toBe("上传");
    setLang("en");
    expect(strings.upload).toBe("Upload");
  });

  test("未知 key 原样返回", () => {
    expect(strings["no.such.key"]).toBe("no.such.key");
  });

  test("useLang 订阅语言变化", () => {
    const { result } = renderHook(() => useLang());
    expect(result.current).toBe("zh");
    act(() => setLang("en"));
    expect(result.current).toBe("en");
  });
});
