import { vi } from "vitest";
import React from "react";
import { act, renderHook } from "@testing-library/react";

import {
  AuthProvider,
  authFetch,
  basicAuthHeader,
  clearCredentials,
  getCredentials,
  setCredentials,
  useAuth,
} from "../auth";

function authValue() {
  return btoa("user:pass");
}

const originalFetch = global.fetch;

beforeEach(() => {
  localStorage.clear();
  clearCredentials();
  vi.restoreAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("auth / credentials", () => {
  test("默认无凭据", () => {
    expect(getCredentials()).toBeNull();
    expect(basicAuthHeader()).toBeUndefined();
  });

  test("setCredentials 持久化并通知 AuthProvider 订阅者", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => setCredentials({ username: "user", password: "pass" }));
    expect(result.current.username).toBe("user");
    expect(getCredentials()).toEqual({ username: "user", password: "pass" });
    expect(localStorage.getItem("flaredrive.auth")).toBe(JSON.stringify({ username: "user", password: "pass" }));
  });

  test("clearCredentials 清空", () => {
    setCredentials({ username: "user", password: "pass" });
    clearCredentials();
    expect(getCredentials()).toBeNull();
    expect(localStorage.getItem("flaredrive.auth")).toBeNull();
  });

  test("basicAuthHeader 生成 Basic 头", () => {
    setCredentials({ username: "user", password: "pass" });
    expect(basicAuthHeader()).toBe(`Basic ${authValue()}`);
  });
});

describe("auth / authFetch", () => {
  test("注入 Basic Authorization 头并请求", async () => {
    setCredentials({ username: "user", password: "pass" });
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 } as unknown as Response);
    global.fetch = fetchMock as any;

    await authFetch("/api/keys");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/keys");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe(`Basic ${authValue()}`);
    expect(headers.get("X-Davflare-UI")).toBe("1");
  });

  test("401 清除凭据", async () => {
    setCredentials({ username: "user", password: "pass" });
    const fetchMock = vi.fn().mockResolvedValue({ status: 401 } as unknown as Response);
    global.fetch = fetchMock as any;

    const res = await authFetch("/api/keys");
    expect(res.status).toBe(401);
    expect(getCredentials()).toBeNull();
  });

  test("无凭据时保留原 headers 且不新增 Authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 } as unknown as Response);
    global.fetch = fetchMock as any;

    await authFetch("/api/keys", { headers: { "X-Test": "1" } });
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("X-Test")).toBe("1");
    expect(headers.get("Authorization")).toBeNull();
  });
});

describe("auth / AuthProvider", () => {
  test("login 更新 username，logout 清空", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.username).toBeNull();

    act(() => result.current.login({ username: "user", password: "pass" }));
    expect(result.current.username).toBe("user");
    expect(getCredentials()).toEqual({ username: "user", password: "pass" });

    act(() => result.current.logout());
    expect(result.current.username).toBeNull();
    expect(getCredentials()).toBeNull();
  });
});
