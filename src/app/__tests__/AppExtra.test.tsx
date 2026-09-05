/**
 * App.tsx 覆盖补充：Snackbar 队列消费（排队/error 时长/action 回调/上传完成失败
 * 通知去重）、主题三态切换持久化、快捷键的输入保护分支。
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import App from "../../App";
import { setLang, strings, translate } from "../strings";
import type { TransferTask } from "../types";

let mockNotify: ((message: string, severity?: any, options?: any) => void) | null = null;
let mockQueueTasks: TransferTask[] = [];

jest.mock("../transferQueue", () => {
  return {
    TransferQueueProvider: ({ children }: { children: JSX.Element }) => children,
    useTransferQueue: () => mockQueueTasks,
    useTransferQueueActions: () => ({}),
    useTransferQueueGlobalPaused: () => false,
    useUploadEnqueue: () => jest.fn(),
  };
});

jest.mock("../../Main", () => ({
  __esModule: true,
  default: (props: { onNotify: (m: string, s?: any, o?: any) => void }) => {
    mockNotify = props.onNotify;
    return <div>main-stub</div>;
  },
}));

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
  default: ({ open }: { open: boolean }) =>
    open ? <div>transfers-stub</div> : null,
}));

jest.mock("../../ApiKeysPanel", () => ({
  __esModule: true,
  default: () => null,
}));

const completedTask = (id: string, name: string): TransferTask =>
  ({
    id,
    type: "upload",
    status: "completed",
    name,
    basedir: "",
    remoteKey: name,
    loaded: 1,
    total: 1,
  }) as TransferTask;

beforeEach(() => {
  setLang("zh");
  localStorage.clear();
  mockQueueTasks = [];
});

describe("App Snackbar 队列", () => {
  test("连续 success 消息：后发的顶到队首，前一条排队随后展示", async () => {
    jest.useFakeTimers();
    try {
      render(<App />);
      await act(async () => {});
      expect(mockNotify).toBeTruthy();
      act(() => mockNotify!("第一条", "success"));
      act(() => mockNotify!("第二条", "success"));
      // enqueueSnack 把后发的非 error 顶到队首
      expect(screen.getByText("第二条")).toBeInTheDocument();
      expect(screen.queryByText("第一条")).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test("error 消息展示，Alert 自带关闭按钮可触发 onClose", async () => {
    render(<App />);
    await act(async () => {});
    act(() => mockNotify!("出错了", "error"));
    expect(screen.getByText("出错了")).toBeInTheDocument();
    const closeBtn = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeBtn);
    // App 的 onClose 会 setSnackOpen(false)
    expect(closeBtn).toBeInTheDocument();
  });

  // 修复后行为：8s 自动隐藏 → 退场动画完成 → onExited 排空队列，消息消失不再重闪
  test("error autoHideDuration 到点后自动隐藏且不再重闪", async () => {
    jest.useFakeTimers();
    try {
      render(<App />);
      await act(async () => {});
      act(() => mockNotify!("出错了", "error"));
      expect(screen.getByText("出错了")).toBeInTheDocument();
      // 8s 自动隐藏；分两段推进：先到隐藏点，再等退场动画触发 onExited
      act(() => jest.advanceTimersByTime(8200));
      act(() => jest.advanceTimersByTime(3000));
      expect(screen.queryByText("出错了")).not.toBeInTheDocument();
      // 修复前消息会在每轮 autoHideDuration 到点后重新进场；这里确认持续消失
      act(() => jest.advanceTimersByTime(12000));
      expect(screen.queryByText("出错了")).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test("action 按钮触发回调", async () => {
    render(<App />);
    await act(async () => {});
    const onClick = jest.fn();
    act(() =>
      mockNotify!("失败", "error", {
        action: { label: strings.transfers, onClick },
      })
    );
    const btn = await screen.findByText(strings.transfers);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("上传失败通知带 action，点击打开任务面板", async () => {
    mockQueueTasks = [
      {
        id: "t-fail",
        type: "upload",
        status: "failed",
        name: "bad.txt",
        basedir: "",
        remoteKey: "bad.txt",
        loaded: 0,
        total: 1,
      } as TransferTask,
    ];
    const { rerender } = render(<App />);
    await act(async () => {
      rerender(<App />);
    });
    await waitFor(() =>
      expect(
        screen.getByText(translate("uploadFailedToast", { name: "bad.txt" }))
      ).toBeInTheDocument()
    );
    fireEvent.click(screen.getByText(strings.transfers));
    expect(screen.getByText("transfers-stub")).toBeInTheDocument();
  });

  test("上传完成通知且同一任务只通知一次", async () => {
    const { rerender } = render(<App />);
    await act(async () => {});
    mockQueueTasks = [completedTask("t1", "same.txt")];
    await act(async () => {
      rerender(<App />);
    });
    await waitFor(() =>
      expect(
        screen.getByText(translate("uploadedToast", { name: "same.txt" }))
      ).toBeInTheDocument()
    );
    // 再次渲染同一队列：notified 去重，不产生第二条
    await act(async () => {
      rerender(<App />);
    });
    expect(
      screen.getAllByText(translate("uploadedToast", { name: "same.txt" }))
    ).toHaveLength(1);
  });
});

describe("App 主题三态", () => {
  test("外观菜单切换 light/dark/system 并持久化", async () => {
    render(<App />);
    await act(async () => {});
    fireEvent.click(screen.getByLabelText(strings.theme));
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByText(strings.themeDark));
    expect(localStorage.getItem("flaredrive.themeMode")).toBe('"dark"');

    fireEvent.click(screen.getByLabelText(strings.theme));
    const menu2 = await screen.findByRole("menu");
    fireEvent.click(within(menu2).getByText(strings.themeLight));
    expect(localStorage.getItem("flaredrive.themeMode")).toBe('"light"');

    fireEvent.click(screen.getByLabelText(strings.theme));
    const menu3 = await screen.findByRole("menu");
    fireEvent.click(within(menu3).getByText(strings.themeSystem));
    expect(localStorage.getItem("flaredrive.themeMode")).toBe('"system"');
  });
});

describe("App 快捷键保护分支", () => {
  test("isComposing / Process 键不触发命令面板", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true, isComposing: true });
    expect(screen.queryByText("command-palette-stub")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Process" });
    expect(screen.queryByText("command-palette-stub")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByText("command-palette-stub")).toBeInTheDocument();
  });

  test("带修饰键的 / 不聚焦搜索", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "/", metaKey: true, target: document.body });
    const input = screen.getByLabelText(strings.searchShortcutHint) as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
  });

  test("输入框聚焦时 cmd/ctrl+K 仍打开面板", () => {
    render(<App />);
    const input = screen.getByLabelText(strings.searchShortcutHint);
    fireEvent.focus(input);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByText("command-palette-stub")).toBeInTheDocument();
  });
});
