import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ShareDialog from "../../ShareDialog";
import { createShare, listShares, revokeShare } from "../share";
import { setLang, strings, translate } from "../strings";
import { FileItem, ShareInfo } from "../types";

jest.mock("../share", () => {
  const actual = jest.requireActual("../share");
  return {
    ...actual,
    createShare: jest.fn(),
    listShares: jest.fn(),
    revokeShare: jest.fn(),
  };
});

const mockCreateShare = createShare as unknown as jest.Mock;
const mockListShares = listShares as unknown as jest.Mock;
const mockRevokeShare = revokeShare as unknown as jest.Mock;

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
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("ShareDialog", () => {
  test("opens existing shares and creates a link", async () => {
    mockCreateShare.mockResolvedValue({ ...share, token: "tok2", url: "https://x.example/s/tok2" });
    const onNotify = jest.fn();
    render(<ShareDialog open file={file} onClose={jest.fn()} onNotify={onNotify} />);

    await waitFor(() => expect(screen.getByText(share.url)).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.createShareLink));
    await waitFor(() => expect(mockCreateShare).toHaveBeenCalledWith("a.txt", undefined, undefined));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("shareLinkCreated"), "success")
    );
  });

  test("listShares error notifies", async () => {
    mockListShares.mockRejectedValue(new Error("boom"));
    const onNotify = jest.fn();
    render(<ShareDialog open file={file} onClose={jest.fn()} onNotify={onNotify} />);
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("boom", "error"));
  });

  test("copy existing link", async () => {
    const onNotify = jest.fn();
    render(<ShareDialog open file={file} onClose={jest.fn()} onNotify={onNotify} />);
    fireEvent.click(await screen.findByText(strings.copy));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("linkCopied"), "success")
    );
  });

  test("revokes an existing share without closing via overlay", async () => {
    mockRevokeShare.mockResolvedValue(undefined);
    const onClose = jest.fn();
    const onNotify = jest.fn();
    render(<ShareDialog open file={file} onClose={onClose} onNotify={onNotify} />);
    fireEvent.click(await screen.findByText(strings.revoke));
    await waitFor(() => expect(mockRevokeShare).toHaveBeenCalledWith("tok1"));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("shareLinkRevoked"), "success")
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(share.url)).not.toBeInTheDocument();
  });
});
