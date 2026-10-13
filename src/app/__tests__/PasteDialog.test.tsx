import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import PasteDialog from "../../PasteDialog";
import { createPasteShare } from "../paste";
import { setLang, strings, translate } from "../strings";

vi.mock("../paste", async () => {
  const actual = await vi.importActual<typeof import("../paste")>("../paste");
  return { ...actual, createPasteShare: vi.fn() };
});

const mockCreate = createPasteShare as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  setLang("zh");
  mockCreate.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("PasteDialog", () => {
  test("空文本时提交按钮禁用；成功后展示链接并可复制", async () => {
    mockCreate.mockResolvedValue({
      key: "notes/paste.txt",
      share: {
        token: "tok",
        key: "notes/paste.txt",
        name: "paste.txt",
        expiresAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        url: "https://drive.example/share/tok",
        extractCode: "abcd",
      },
      clipboard: "链接：https://drive.example/share/tok\n提取码：abcd",
    });
    const onNotify = vi.fn();
    const onCreated = vi.fn();
    render(
      <PasteDialog
        open
        cwd="notes"
        onClose={vi.fn()}
        onNotify={onNotify}
        onCreated={onCreated}
      />
    );

    expect(screen.getByText(strings.pasteShareTitle)).toBeInTheDocument();
    const submit = screen.getByTestId("paste-share-submit");
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId("paste-share-text"), {
      target: { value: "hello paste" },
    });
    fireEvent.change(screen.getByTestId("paste-share-filename"), {
      target: { value: "paste.txt" },
    });
    fireEvent.change(screen.getByTestId("paste-share-code"), {
      target: { value: "abcd" },
    });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "notes",
        text: "hello paste",
        filename: "paste.txt",
        extractCode: "abcd",
        expiresInHours: 168,
      })
    );
    await waitFor(() =>
      expect(screen.getByTestId("paste-share-url")).toHaveTextContent("https://drive.example/share/tok")
    );
    expect(onCreated).toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith(translate("pasteCreatedCopied"), "success");

    fireEvent.click(screen.getByRole("button", { name: strings.copy }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("linkCopied"), "success")
    );

    fireEvent.click(screen.getByRole("button", { name: strings.pasteShareAnother }));
    expect(screen.getByTestId("paste-share-text")).toBeInTheDocument();
    expect(screen.queryByTestId("paste-share-url")).not.toBeInTheDocument();
  });

  test("创建失败时通知错误", async () => {
    mockCreate.mockRejectedValue(new Error("nope"));
    const onNotify = vi.fn();
    render(<PasteDialog open cwd="" onClose={vi.fn()} onNotify={onNotify} />);
    fireEvent.change(screen.getByTestId("paste-share-text"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByTestId("paste-share-submit"));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("nope", "error"));
  });

  test("剪贴板失败仍提示已创建", async () => {
    mockCreate.mockResolvedValue({
      key: "a.txt",
      share: {
        token: "t",
        key: "a.txt",
        name: "a.txt",
        expiresAt: null,
        createdAt: "",
        url: "https://x/share/t",
      },
      clipboard: "链接：https://x/share/t",
    });
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("denied")
    );
    const onNotify = vi.fn();
    render(<PasteDialog open cwd="" onClose={vi.fn()} onNotify={onNotify} />);
    fireEvent.change(screen.getByTestId("paste-share-text"), {
      target: { value: "body" },
    });
    fireEvent.click(screen.getByTestId("paste-share-submit"));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("pasteCreated"), "success")
    );
  });

  test("关闭按钮调用 onClose", () => {
    const onClose = vi.fn();
    render(<PasteDialog open cwd="" onClose={onClose} onNotify={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: strings.close }));
    expect(onClose).toHaveBeenCalled();
  });

  test("expiry never 传 undefined；复制失败提示 copyFailed2", async () => {
    mockCreate.mockResolvedValue({
      key: "a.txt",
      share: {
        token: "t2",
        key: "a.txt",
        name: "a.txt",
        expiresAt: null,
        createdAt: "",
        url: "https://x/share/t2",
      },
      clipboard: "链接：https://x/share/t2",
    });
    const onNotify = vi.fn();
    render(<PasteDialog open cwd="" onClose={vi.fn()} onNotify={onNotify} />);
    fireEvent.change(screen.getByTestId("paste-share-text"), {
      target: { value: "body" },
    });
    // MUI Select: change via the native input under the FormControl
    const expiry = screen.getByTestId("paste-share-expiry");
    fireEvent.mouseDown(expiry.querySelector("[role=\"combobox\"]") || expiry);
    fireEvent.click(await screen.findByText(strings.apiNever));
    fireEvent.click(screen.getByTestId("paste-share-submit"));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ text: "body" })
      )
    );
    expect(mockCreate.mock.calls[0][0].expiresInHours).toBeUndefined();
    await waitFor(() => expect(screen.getByTestId("paste-share-url")).toBeInTheDocument());
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("denied")
    );
    fireEvent.click(screen.getByRole("button", { name: strings.copy }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("copyFailed2"), "error")
    );
  });
});
