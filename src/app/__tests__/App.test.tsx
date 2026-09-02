import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import App, { enqueueSnack, SnackbarMessage } from "../../App";
import { setLang, strings } from "../strings";

jest.mock("../transferQueue", () => {
  const React = require("react");
  return {
    TransferQueueProvider: ({ children }: { children: React.ReactNode }) => children,
    useTransferQueue: () => [],
    useTransferQueueActions: () => ({}),
    useTransferQueueGlobalPaused: () => false,
    useUploadEnqueue: () => jest.fn(),
  };
});


jest.mock("../../Main", () => ({
  __esModule: true,
  default: () => <div>main-stub</div>,
}));

jest.mock("../../LoginDialog", () => ({
  __esModule: true,
  default: () => <div>login-stub</div>,
}));

jest.mock("../../TransferManager", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../../ApiKeysPanel", () => ({
  __esModule: true,
  default: () => null,
}));

beforeEach(() => {
  setLang("zh");
  localStorage.clear();
});

describe("enqueueSnack", () => {
  const error: SnackbarMessage = { key: 1, message: "e", severity: "error" };
  const ok: SnackbarMessage = { key: 2, message: "ok", severity: "success" };

  test("errors append; success jumps to front and drops non-errors", () => {
    expect(enqueueSnack([], error)).toEqual([error]);
    expect(enqueueSnack([error], ok)).toEqual([ok, error]);
    expect(enqueueSnack([ok], error)).toEqual([ok, error]);
  });
});

describe("App", () => {
  test("renders header and main stub", () => {
    render(<App />);
    expect(screen.getByText("main-stub")).toBeInTheDocument();
    expect(screen.getByText("login-stub")).toBeInTheDocument();
    expect(screen.getByLabelText(strings.searchShortcutHint)).toBeInTheDocument();
  });

  test("slash focuses search when not typing", () => {
    render(<App />);
    const input = screen.getByLabelText(strings.searchShortcutHint) as HTMLInputElement;
    fireEvent.keyDown(window, { key: "/", target: document.body });
    expect(document.activeElement).toBe(input);
  });
});
