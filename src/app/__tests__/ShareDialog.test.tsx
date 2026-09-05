import { vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ShareDialog from "../../ShareDialog";
import { createShare, listShares, revokeShare } from "../share";
import { setLang, strings, translate } from "../strings";
import { FileItem, ShareInfo } from "../types";

vi.mock("../share", async () => {
  const actual = await vi.importActual("../share");
  return {
    ...actual,
    createShare: vi.fn(),
    listShares: vi.fn(),
    revokeShare: vi.fn(),
  };
});

const mockCreateShare = createShare as unknown as Mock;
const mockListShares = listShares as unknown as Mock;
const mockRevokeShare = revokeShare as unknown as Mock;

const file: FileItem = {
  key: "a.txt",
  name: "a.txt",
  isDir: false,
  size: 1,
  uploaded: "",
  contentType: "text/plain",
};

const share: ShareInfo = {
  token: "tok1",
  key: "a.txt",
  name: "a.txt",
  expiresAt: null,
  createdAt: "2026-01-01",
  url: "https://x.example/s/tok1",
};

beforeEach(() => {
  setLang("zh");
  mockCreateShare.mockReset();
  mockListShares.mockReset();
  mockRevokeShare.mockReset();
  mockListShares.mockResolvedValue([share]);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("ShareDialog", () => {
  test("opens existing shares and creates a link", async () => {
    mockCreateShare.mockResolvedValue({ ...share, token: "tok2", url: "https://x.example/s/tok2" });
    const onNotify = vi.fn();
    render(<ShareDialog open file={file} onClose={vi.fn()} onNotify={onNotify} />);

    await waitFor(() => expect(screen.getByText(share.url)).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.createShareLink));
    await waitFor(() => expect(mockCreateShare).toHaveBeenCalledWith("a.txt", undefined, undefined));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("shareLinkCreated"), "success")
    );
  });

  test("listShares error notifies", async () => {
    mockListShares.mockRejectedValue(new Error("boom"));
    const onNotify = vi.fn();
    render(<ShareDialog open file={file} onClose={vi.fn()} onNotify={onNotify} />);
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("boom", "error"));
  });

  test("copy existing link", async () => {
    const onNotify = vi.fn();
    render(<ShareDialog open file={file} onClose={vi.fn()} onNotify={onNotify} />);
    fireEvent.click(await screen.findByText(strings.copy));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("linkCopied"), "success")
    );
  });

  test("revokes an existing share without closing via overlay", async () => {
    mockRevokeShare.mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onNotify = vi.fn();
    render(<ShareDialog open file={file} onClose={onClose} onNotify={onNotify} />);
    fireEvent.click(await screen.findByText(strings.revoke));
    await waitFor(() => expect(mockRevokeShare).toHaveBeenCalledWith("tok1"));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("shareLinkRevoked"), "success")
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(share.url)).not.toBeInTheDocument();
  });

  test("create share failure notifies error", async () => {
    mockCreateShare.mockRejectedValue(new Error("create-fail"));
    const onNotify = vi.fn();
    render(<ShareDialog open file={file} onClose={vi.fn()} onNotify={onNotify} />);
    await screen.findByText(share.url);
    fireEvent.click(screen.getByText(strings.createShareLink));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("create-fail", "error"));
  });

  test("copy failure notifies error", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const onNotify = vi.fn();
    render(<ShareDialog open file={file} onClose={vi.fn()} onNotify={onNotify} />);
    fireEvent.click(await screen.findByText(strings.copy));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("copyFailed2"), "error")
    );
  });

  test("expiry and extract code passed to createShare", async () => {
    mockCreateShare.mockResolvedValue({ ...share, token: "tok3" });
    const onNotify = vi.fn();
    render(<ShareDialog open file={file} onClose={vi.fn()} onNotify={onNotify} />);
    await screen.findByText(share.url);
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText(strings.apiExpiry1d));
    fireEvent.change(screen.getByLabelText(strings.extractCodeOptional), {
      target: { value: "abcd" },
    });
    fireEvent.click(screen.getByText(strings.createShareLink));
    await waitFor(() =>
      expect(mockCreateShare).toHaveBeenCalledWith("a.txt", 24, "abcd")
    );
  });

  test("revoke failure notifies and reloads", async () => {
    mockRevokeShare.mockRejectedValue(new Error("revoke-fail"));
    const onNotify = vi.fn();
    render(<ShareDialog open file={file} onClose={vi.fn()} onNotify={onNotify} />);
    fireEvent.click(await screen.findByText(strings.revoke));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("revoke-fail", "error"));
    await waitFor(() => expect(mockListShares.mock.calls.length).toBeGreaterThan(1));
  });

  test("列表项展示倒计时/永久徽标", async () => {
    mockListShares.mockResolvedValue([
      share,
      {
        ...share,
        token: "tok-urgent",
        url: "https://x.example/s/tok-urgent",
        expiresAt: new Date(Date.now() + 3.5 * 60 * 60 * 1000).toISOString(),
      },
    ]);
    render(<ShareDialog open file={file} onClose={vi.fn()} onNotify={vi.fn()} />);
    await screen.findByText(share.url);
    expect(screen.getByText(strings.shareNeverExpires)).toBeInTheDocument();
    const urgentChip = await screen.findByText(translate("shareExpiresIn", { time: "3 小时" }));
    expect(urgentChip.closest(".MuiChip-root")).toHaveClass("MuiChip-colorWarning");
  });

  test("每个分享带二维码入口且弹层渲染 dataURL 图片", async () => {
    render(<ShareDialog open file={file} onClose={vi.fn()} onNotify={vi.fn()} />);
    await screen.findByText(share.url);
    const qrButtons = screen.getAllByRole("button", { name: strings.shareQrTitle });
    expect(qrButtons.length).toBeGreaterThan(0);
    fireEvent.click(qrButtons[0]);
    expect(await screen.findByRole("img", { name: strings.shareQrTitle })).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/png;base64,/)
    );
  });
});
