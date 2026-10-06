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

  test("Obsidian 同步卡片：复制服务器地址/用户名/配置，且从不展示密码", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      // 即便接口意外带回密码字段，卡片也不能展示或复制它
      json: async () => ({ username: "alice", publicRead: false, password: "s3cret-pass" }),
    } as unknown as Response);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const onNotify = vi.fn();
    render(<WebDavPanel open onClose={vi.fn()} onNotify={onNotify} />);

    const card = await screen.findByRole("region", { name: strings.obsidianSyncTitle });
    const server = `${window.location.origin}/webdav/`;
    expect(screen.getByTestId("obsidian-server-address")).toHaveTextContent(server);
    expect(card).toHaveTextContent(translate("obsidianUsernameLine", { username: "alice" }));
    expect(card).toHaveTextContent(strings.obsidianDepthTip);
    expect(card).toHaveTextContent(strings.obsidianBaseDirTip);
    expect(document.body.textContent).not.toContain("s3cret-pass");

    fireEvent.click(screen.getByRole("button", { name: strings.obsidianCopyServerAddress }));
    fireEvent.click(screen.getByRole("button", { name: strings.obsidianCopyAccount }));
    fireEvent.click(screen.getByRole("button", { name: strings.obsidianCopyGuide }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(3));
    expect(writeText).toHaveBeenNthCalledWith(1, server);
    expect(writeText).toHaveBeenNthCalledWith(2, "alice");
    const guide = writeText.mock.calls[2][0] as string;
    expect(guide).toContain(server);
    expect(guide).toContain(strings.obsidianAuthTip);
    expect(guide).toContain(strings.obsidianPasswordTip);
    for (const [text] of writeText.mock.calls) expect(text).not.toContain("s3cret-pass");
    expect(onNotify).toHaveBeenCalledWith(
      translate("copiedFormat", { label: strings.obsidianServerAddress }),
      "success"
    );
  });

  test("Obsidian 同步卡片：英文文案；未配置用户名时不出现复制用户名按钮", async () => {
    setLang("en");
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ username: "", publicRead: false }),
    } as unknown as Response);
    render(<WebDavPanel open onClose={vi.fn()} onNotify={vi.fn()} />);
    const card = await screen.findByRole("region", { name: "Obsidian sync" });
    expect(card).toHaveTextContent("Remotely Save");
    expect(card).toHaveTextContent("Username: (not configured)");
    expect(screen.getByRole("button", { name: "Copy server address" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy Obsidian username" })).toBeNull();
  });
});
