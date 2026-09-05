import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SharesView from "../../SharesView";
import { listShares, revokeShare } from "../share";
import { setLang, strings, translate } from "../strings";
import { ShareInfo } from "../types";
import { formatDateTime } from "../utils";

jest.mock("../share", () => {
  const actual = jest.requireActual("../share");
  return { ...actual, listShares: jest.fn(), revokeShare: jest.fn() };
});

const mockListShares = listShares as unknown as jest.Mock;
const mockRevokeShare = revokeShare as unknown as jest.Mock;

const share: ShareInfo = {
  token: "tok1",
  key: "a.txt",
  name: "notes.txt",
  expiresAt: null,
  createdAt: "2026-01-01",
  url: "https://x.example/s/tok1",
};

beforeEach(() => {
  setLang("zh");
  mockListShares.mockReset();
  mockRevokeShare.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("SharesView", () => {
  test("empty state and go to files", async () => {
    mockListShares.mockResolvedValue([]);
    const onGoFiles = jest.fn();
    render(<SharesView onNotify={jest.fn()} onGoFiles={onGoFiles} />);
    await waitFor(() => expect(screen.getByText(strings.emptyShares)).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.goToFiles));
    expect(onGoFiles).toHaveBeenCalled();
  });

  test("lists shares and copies", async () => {
    mockListShares.mockResolvedValue([share]);
    const onNotify = jest.fn();
    render(<SharesView onNotify={onNotify} />);
    await waitFor(() => expect(screen.getByText("notes.txt")).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.copy));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("linkCopied"), "success")
    );
  });

  test("load error notifies", async () => {
    mockListShares.mockRejectedValue(new Error("nope"));
    const onNotify = jest.fn();
    render(<SharesView onNotify={onNotify} />);
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("nope", "error"));
  });

  test("revoke error reloads", async () => {
    mockListShares.mockResolvedValue([share]);
    mockRevokeShare.mockRejectedValue(new Error("revoke-fail"));
    const onNotify = jest.fn();
    render(<SharesView onNotify={onNotify} />);
    fireEvent.click(await screen.findByText(strings.revoke));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("revoke-fail", "error"));
  });

  test("永不过期的分享显示永久有效徽标", async () => {
    mockListShares.mockResolvedValue([share]);
    render(<SharesView onNotify={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("notes.txt")).toBeInTheDocument());
    expect(screen.getByText(strings.shareNeverExpires)).toBeInTheDocument();
  });

  test("临期分享倒计时徽标用 warning 色", async () => {
    mockListShares.mockResolvedValue([
      {
        ...share,
        expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
      },
    ]);
    render(<SharesView onNotify={jest.fn()} />);
    await screen.findByText("notes.txt");
    const chip = await screen.findByText(translate("shareExpiresIn", { time: "90 分钟" }));
    expect(chip.closest(".MuiChip-root")).toHaveClass("MuiChip-colorWarning");
  });

  test("创建时间徽标：相对时间 + tooltip 绝对时间", async () => {
    const now = new Date();
    mockListShares.mockResolvedValue([{ ...share, createdAt: now.toISOString() }]);
    render(<SharesView onNotify={jest.fn()} />);
    await screen.findByText("notes.txt");
    const createdChip = screen.getByText(
      translate("shareCreatedAt", { time: translate("justNow") })
    );
    fireEvent.mouseOver(createdChip.closest(".MuiChip-root") as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      formatDateTime(now.toISOString())
    );
  });

  test("旧记录无 createdAt 时不显示创建徽标", async () => {
    mockListShares.mockResolvedValue([{ ...share, createdAt: undefined }]);
    render(<SharesView onNotify={jest.fn()} />);
    await screen.findByText("notes.txt");
    expect(screen.queryByText(/创建于/)).not.toBeInTheDocument();
  });

  test("二维码按钮弹出含 dataURL 图片的 Popover", async () => {
    mockListShares.mockResolvedValue([share]);
    render(<SharesView onNotify={jest.fn()} />);
    await screen.findByText("notes.txt");
    fireEvent.click(screen.getByRole("button", { name: strings.shareQrTitle }));
    expect(await screen.findByText(strings.shareQrTitle)).toBeInTheDocument();
    const qrImage = await screen.findByRole("img", { name: strings.shareQrTitle });
    expect(qrImage.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  });
});
