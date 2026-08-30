import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import LoginDialog from "../../LoginDialog";
import { setLang, strings, translate } from "../strings";

const mockLogin = jest.fn();
const mockAuthFetch = jest.fn();

jest.mock("../auth", () => ({
  useAuth: () => ({ login: mockLogin, logout: jest.fn(), username: null }),
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}));

beforeEach(() => {
  setLang("zh");
  mockLogin.mockReset();
  mockAuthFetch.mockReset();
});

describe("LoginDialog", () => {
  test("空账号密码不提交", () => {
    render(<LoginDialog />);
    fireEvent.click(screen.getByText(strings.login));
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  test("登录成功写入凭据", async () => {
    mockAuthFetch.mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    render(<LoginDialog />);

    fireEvent.change(screen.getByLabelText(strings.username), { target: { value: "user" } });
    fireEvent.change(screen.getByLabelText(strings.password), { target: { value: "pass" } });
    fireEvent.click(screen.getByText(strings.login));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ username: "user", password: "pass" }));
    expect(mockAuthFetch).toHaveBeenCalled();
  });

  test("凭据错误显示提示", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 401 } as unknown as Response);
    render(<LoginDialog />);

    fireEvent.change(screen.getByLabelText(strings.username), { target: { value: "user" } });
    fireEvent.change(screen.getByLabelText(strings.password), { target: { value: "bad" } });
    fireEvent.click(screen.getByText(strings.login));

    await waitFor(() =>
      expect(screen.getByText(translate("wrongCredentials"))).toBeInTheDocument()
    );
    expect(mockLogin).not.toHaveBeenCalled();
  });

  test("网络错误显示提示", async () => {
    mockAuthFetch.mockRejectedValue(new Error("network"));
    render(<LoginDialog />);

    fireEvent.change(screen.getByLabelText(strings.username), { target: { value: "user" } });
    fireEvent.change(screen.getByLabelText(strings.password), { target: { value: "pass" } });
    fireEvent.click(screen.getByText(strings.login));

    await waitFor(() =>
      expect(screen.getByText(translate("networkError"))).toBeInTheDocument()
    );
  });
});
