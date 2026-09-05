/**
 * PreviewDialog 覆盖补充：图片缩放（滚轮/双击/复位）、指针平移、旋转补偿、
 * 视频倍速、翻页 pager（按钮 + 键盘 + 输入框保护）、文本下载/复制失败、超限流式分支。
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import PreviewDialog from "../../PreviewDialog";
import { authFetch } from "../auth";
import { setLang, strings } from "../strings";
import { FileItem } from "../types";

jest.mock("../auth", () => ({
  authFetch: jest.fn(),
}));

jest.mock("../transfer", () => ({
  downloadFile: jest.fn(),
}));

const mockAuthFetch = authFetch as unknown as jest.Mock;

const img: FileItem = {
  key: "a.png",
  name: "a.png",
  isDir: false,
  size: 4,
  uploaded: "",
  contentType: "image/png",
};

const img2: FileItem = { ...img, key: "b.png", name: "b.png" };
const img3: FileItem = { ...img, key: "c.png", name: "c.png" };

function blobFetch(type: string) {
  return {
    ok: true,
    headers: { get: () => null },
    blob: async () => new Blob(["xx"], { type }),
    body: null,
  };
}

function textReaderResponse(text: string) {
  const bytes = new TextEncoder().encode(text);
  return {
    ok: true,
    headers: { get: () => String(bytes.length) },
    body: {
      getReader: () => {
        let done = false;
        return {
          read: async () => {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: bytes };
          },
          cancel: async () => {},
        };
      },
    },
  };
}

function renderPreview(file: FileItem, siblings: FileItem[] = [img], onSibling = jest.fn()) {
  const onNotify = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <PreviewDialog
      file={file}
      siblings={siblings}
      onSibling={siblings.length > 1 ? onSibling : undefined}
      onClose={onClose}
      onNotify={onNotify}
      onShare={jest.fn()}
      onRename={jest.fn()}
      onDelete={jest.fn()}
    />
  );
  return { ...utils, onNotify, onClose, onSibling };
}

beforeEach(() => {
  setLang("zh");
  mockAuthFetch.mockReset();
  (URL as any).createObjectURL = jest.fn(() => "blob:preview");
  (URL as any).revokeObjectURL = jest.fn();
  // jsdom 未实现 Pointer Capture，补最小桩
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
  (HTMLElement.prototype as any).hasPointerCapture = jest.fn(() => false);
});

// 旋转按钮是图标（无文本、无 aria-label），从 DialogActions 里挑出唯一的纯图标按钮
function clickRotateButton() {
  const actionsEl = document.querySelector(".MuiDialogActions-root")!;
  const iconOnly = Array.from(actionsEl.querySelectorAll("button")).find(
    (b) => b.querySelector("svg") && !(b.textContent || "").trim()
  );
  expect(iconOnly).toBeTruthy();
  fireEvent.click(iconOnly!);
}

describe("PreviewDialog 图片缩放/平移/旋转", () => {
  test("滚轮缩放放大/缩小并显示比例", async () => {
    mockAuthFetch.mockResolvedValue(blobFetch("image/png"));
    renderPreview(img);
    await waitFor(() => expect(document.querySelector("img")).toBeTruthy());
    const imgEl = document.querySelector("img")!;
    // 放大 1.1^2 ≈ 121%
    fireEvent.wheel(imgEl, { deltaY: -100 });
    fireEvent.wheel(imgEl, { deltaY: -100 });
    await waitFor(() => expect(screen.getByText("121%")).toBeInTheDocument());
    // 缩小回 110% 附近
    fireEvent.wheel(imgEl, { deltaY: 100 });
    await waitFor(() => expect(screen.getByText("110%")).toBeInTheDocument());
  });

  test("滚轮缩放钳制到 [0.25, 4]", async () => {
    mockAuthFetch.mockResolvedValue(blobFetch("image/png"));
    renderPreview(img);
    await waitFor(() => expect(document.querySelector("img")).toBeTruthy());
    const imgEl = document.querySelector("img")!;
    for (let i = 0; i < 40; i++) fireEvent.wheel(imgEl, { deltaY: -100 });
    await waitFor(() => expect(screen.getByText("400%")).toBeInTheDocument());
    for (let i = 0; i < 60; i++) fireEvent.wheel(imgEl, { deltaY: 100 });
    await waitFor(() => expect(screen.getByText("25%")).toBeInTheDocument());
  });

  test("双击在 2.5x 与 1x 间切换并复位偏移", async () => {
    mockAuthFetch.mockResolvedValue(blobFetch("image/png"));
    renderPreview(img);
    await waitFor(() => expect(document.querySelector("img")).toBeTruthy());
    const imgEl = document.querySelector("img")!;
    fireEvent.dblClick(imgEl);
    await waitFor(() => expect(screen.getByText("250%")).toBeInTheDocument());
    fireEvent.dblClick(imgEl);
    await waitFor(() => expect(screen.getByText("100%")).toBeInTheDocument());
  });

  test("指针拖拽平移图片并更新 transform", async () => {
    mockAuthFetch.mockResolvedValue(blobFetch("image/png"));
    renderPreview(img);
    await waitFor(() => expect(document.querySelector("img")).toBeTruthy());
    const imgEl = document.querySelector("img") as HTMLImageElement;
    // jsdom 无 PointerEvent 构造器，直接派发带坐标的 Event
    const pointer = (type: string, clientX: number, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { clientX, clientY, pointerId: 1 });
      return event;
    };
    fireEvent(imgEl, pointer("pointerdown", 10, 10));
    fireEvent(imgEl, pointer("pointermove", 40, 35));
    await waitFor(() =>
      expect(imgEl.style.transform).toContain("translate(30px, 25px)")
    );
    fireEvent(imgEl, pointer("pointerup", 40, 35));
    // 松开后再次 move 不再平移
    fireEvent(imgEl, pointer("pointermove", 100, 100));
    expect(imgEl.style.transform).toContain("translate(30px, 25px)");
  });

  test("旋转 90° 后按容器重新收敛 rotFit，比例按钮点击复位缩放", async () => {
    mockAuthFetch.mockResolvedValue(blobFetch("image/png"));
    renderPreview(img);
    await waitFor(() => expect(document.querySelector("img")).toBeTruthy());
    const imgEl = document.querySelector("img") as HTMLImageElement;
    const stage = imgEl.parentElement as HTMLElement;
    Object.defineProperty(imgEl, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(imgEl, "clientHeight", { value: 300, configurable: true });
    jest
      .spyOn(stage, "getBoundingClientRect")
      .mockReturnValue({ width: 200, height: 100, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);

    // 放大到 2x 后旋转：rotFit = min(1, 200/300, 100/400) = 0.25 → 2 * 0.25 = 50%
    fireEvent.wheel(imgEl, { deltaY: -100 });
    fireEvent.wheel(imgEl, { deltaY: -100 });
    await waitFor(() => expect(screen.getByText("121%")).toBeInTheDocument());
    // 放大到 1.21x，旋转 90°：rotFit = min(1, 200/300, 100/400) = 0.25 → 1.21*0.25 ≈ 30%
    clickRotateButton();
    await waitFor(() => expect(screen.getByText("30%")).toBeInTheDocument());
    // 点击比例按钮复位缩放（rotFit 仍 0.25 → 25%）
    fireEvent.click(screen.getByText("30%"));
    await waitFor(() => expect(screen.getByText("25%")).toBeInTheDocument());
  });

  test("旋转 180° 不再补偿（rotFit 回 1）", async () => {
    mockAuthFetch.mockResolvedValue(blobFetch("image/png"));
    renderPreview(img);
    await waitFor(() => expect(document.querySelector("img")).toBeTruthy());
    clickRotateButton();
    clickRotateButton();
    // rotation 180 → % 180 === 0 → rotFit 回 1
    await waitFor(() => expect(screen.getByText("100%")).toBeInTheDocument());
  });
});

describe("PreviewDialog 视频倍速", () => {
  test("倍速按钮循环 1 → 1.5 → 2 → 0.5 → 1 并写入 playbackRate", async () => {
    mockAuthFetch.mockResolvedValue(blobFetch("video/mp4"));
    const video: FileItem = { ...img, key: "a.mp4", name: "a.mp4", contentType: "video/mp4" };
    renderPreview(video);
    await waitFor(() => expect(document.querySelector("video")).toBeTruthy());
    const videoEl = document.querySelector("video") as HTMLVideoElement;
    const rateBtn = screen.getByText("1x");
    fireEvent.click(rateBtn);
    expect(screen.getByText("1.5x")).toBeInTheDocument();
    expect(videoEl.playbackRate).toBe(1.5);
    fireEvent.click(screen.getByText("1.5x"));
    expect(screen.getByText("2x")).toBeInTheDocument();
    fireEvent.click(screen.getByText("2x"));
    expect(screen.getByText("0.5x")).toBeInTheDocument();
    expect(videoEl.playbackRate).toBe(0.5);
    fireEvent.click(screen.getByText("0.5x"));
    expect(screen.getByText("1x")).toBeInTheDocument();
    expect(videoEl.playbackRate).toBe(1);
  });
});

describe("PreviewDialog 翻页 pager", () => {
  test("prev/next 按钮按边界启停并回调 onSibling", async () => {
    mockAuthFetch.mockResolvedValue(blobFetch("image/png"));
    const onSibling = jest.fn();
    const utils = renderPreview(img, [img, img2, img3], onSibling);
    const prevBtn = screen.getByLabelText(strings.prevFile);
    expect(prevBtn).toBeDisabled();
    const nextBtn = screen.getByLabelText(strings.nextFile);
    expect(nextBtn).toBeEnabled();
    fireEvent.click(nextBtn);
    expect(onSibling).toHaveBeenCalledWith(img2);

    // 切到中间文件：两端都可点
    utils.rerender(
      <PreviewDialog
        file={img2}
        siblings={[img, img2, img3]}
        onSibling={onSibling}
        onClose={jest.fn()}
        onNotify={jest.fn()}
        onShare={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText("b.png")).toBeInTheDocument());
    expect(screen.getByLabelText(strings.prevFile)).toBeEnabled();
    expect(screen.getByLabelText(strings.nextFile)).toBeEnabled();

    // 最后一个文件：next 禁用
    utils.rerender(
      <PreviewDialog
        file={img3}
        siblings={[img, img2, img3]}
        onSibling={onSibling}
        onClose={jest.fn()}
        onNotify={jest.fn()}
        onShare={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText("c.png")).toBeInTheDocument());
    expect(screen.getByLabelText(strings.nextFile)).toBeDisabled();
  });

  test("键盘左右翻页，输入框聚焦时不抢按键", async () => {
    mockAuthFetch.mockResolvedValue(blobFetch("image/png"));
    const onSibling = jest.fn();
    renderPreview(img, [img, img2], onSibling);
    await waitFor(() => expect(document.querySelector("img")).toBeTruthy());
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onSibling).toHaveBeenCalledWith(img2);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowLeft" });
    expect(onSibling).toHaveBeenCalledTimes(1);
    input.remove();

    // 未命中 sibling 的文件不翻页
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onSibling).toHaveBeenCalledTimes(1);
  });
});

describe("PreviewDialog 文本路径补充分支", () => {
  test("流式读取超限 → 超限提示（header content-length 超限）", async () => {
    const file: FileItem = {
      key: "big.log",
      name: "big.log",
      isDir: false,
      size: 1024,
      uploaded: "",
      contentType: "text/plain",
    };
    let canceled = false;
    mockAuthFetch.mockResolvedValue({
      ok: true,
      headers: { get: (n: string) => (n.toLowerCase() === "content-length" ? String(5 * 1024 * 1024) : null) },
      body: { cancel: async () => { canceled = true; } },
    });
    renderPreview(file);
    await waitFor(() =>
      expect(screen.getByText(strings.previewTooLargeTitle)).toBeInTheDocument()
    );
    expect(canceled).toBe(true);
  });

  test("纯文本下载走 blob 锚点", async () => {
    mockAuthFetch.mockResolvedValue(textReaderResponse("hello world"));
    const click = jest.fn();
    const orig = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = orig(tag);
      if (tag === "a") (el as HTMLAnchorElement).click = click;
      return el;
    });
    renderPreview({ ...img, key: "a.txt", name: "a.txt", contentType: "text/plain" });
    await waitFor(() => expect(screen.getByText("hello world")).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.download));
    await waitFor(() => expect(click).toHaveBeenCalled());
    (document.createElement as jest.Mock).mockRestore();
  });

  test("copyAll 失败时错误提示", async () => {
    mockAuthFetch.mockResolvedValue(textReaderResponse("hello"));
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockRejectedValue(new Error("denied")) },
    });
    const { onNotify } = renderPreview({ ...img, key: "a.txt", name: "a.txt", contentType: "text/plain" });
    await waitFor(() => expect(screen.getByText("hello")).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.copyAll));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith(expect.any(String), "error"));
  });

  test("关闭按钮回调 onClose 并 blur 当前焦点", async () => {
    mockAuthFetch.mockResolvedValue(textReaderResponse("hello"));
    const { onClose } = renderPreview({ ...img, key: "a.txt", name: "a.txt", contentType: "text/plain" });
    await waitFor(() => expect(screen.getByText("hello")).toBeInTheDocument());
    const blurSpy = jest.spyOn(HTMLElement.prototype, "blur");
    fireEvent.click(screen.getByText(strings.close));
    expect(onClose).toHaveBeenCalled();
    expect(blurSpy).toHaveBeenCalled();
    blurSpy.mockRestore();
  });
});
