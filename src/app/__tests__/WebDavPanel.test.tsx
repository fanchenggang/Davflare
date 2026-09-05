import { vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import WebDavPanel from "../../WebDavPanel";
import { authFetch } from "../auth";
import { setLang, strings, translate } from "../strings";

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
}));

const mockAuthFetch = authFetch as unknown as Mock;

beforeEach(() => {
  setLang("zh");
  mockAuthFetch.mockReset();
});

describe("WebDavPanel", () => {
  test("加载配置后展示用户名与地址", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ username: "alice", publicRead: true }),
    } as unknown as Response);
    render(<WebDavPanel open onClose={vi.fn()} onNotify={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    expect(screen.getByText(`${window.location.origin}/webdav`)).toBeInTheDocument();
    expect(screen.getByText(strings.publicReadOn)).toBeInTheDocument();
  });

  test("配置失败提示错误", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    const onNotify = vi.fn();
    render(<WebDavPanel open onClose={vi.fn()} onNotify={onNotify} />);
    await waitFor(() => expect(onNotify).toHaveBeenCalled());
  });

  test("点击复制写入剪贴板", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ username: "alice", publicRead: false }),
    } as unknown as Response);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const onNotify = vi.fn();
    render(<WebDavPanel open onClose={vi.fn()} onNotify={onNotify} />);

    fireEvent.click(await screen.findByText(strings.copyAddress));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(
        translate("copiedFormat", { label: strings.address }),
        "success"
      )
    );
  });

  test("copies username and full guide", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ username: "alice", publicRead: false }),
    } as unknown as Response);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const onNotify = vi.fn();
    render(<WebDavPanel open onClose={vi.fn()} onNotify={onNotify} />);
    await screen.findByText("alice");

    fireEvent.click(screen.getByText(strings.copyUsername));
    fireEvent.click(screen.getAllByRole("button", { name: strings.copyWebDavGuide })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: strings.copyWebDavGuide })[1]);
    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(3));
  });

  test("clipboard failure notifies error", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ username: "alice", publicRead: false }),
    } as unknown as Response);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
      configurable: true,
    });
    const onNotify = vi.fn();
    render(<WebDavPanel open onClose={vi.fn()} onNotify={onNotify} />);
    fireEvent.click(await screen.findByText(strings.copyAddress));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("copyFailed2"), "error")
    );
  });

});
