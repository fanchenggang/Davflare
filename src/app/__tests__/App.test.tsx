import { fireEvent, render, screen } from "@testing-library/react";

import App, { enqueueSnack, SnackbarMessage } from "../../App";
import { setLang, strings } from "../strings";

jest.mock("../transferQueue", () => {
  return {
    TransferQueueProvider: ({ children }: { children: JSX.Element }) => children,
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

// 真实 CommandPalette 会引 transfer.ts → p-limit（ESM-only），CRA 的 jest 不转换
// node_modules，套件加载即崩。App 层测试只需验证 cmd/ctrl+K 能开关面板，桩化即可。
jest.mock("../../CommandPalette", () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? <div>command-palette-stub</div> : null,
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

  test("cmd/ctrl+K opens command palette", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByText("command-palette-stub")).toBeInTheDocument();
  });
});
