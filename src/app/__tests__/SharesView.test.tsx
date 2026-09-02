import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SharesView from "../../SharesView";
import { listShares, revokeShare } from "../share";
import { setLang, strings, translate } from "../strings";
import { ShareInfo } from "../types";

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
});
