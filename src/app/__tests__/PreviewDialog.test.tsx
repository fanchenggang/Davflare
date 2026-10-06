import { vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import PreviewDialog from "../../PreviewDialog";
import { authFetch } from "../auth";
import { downloadFile } from "../transfer";
import { setLang, strings } from "../strings";
import { FileItem } from "../types";

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
}));

vi.mock("../transfer", () => ({
  downloadFile: vi.fn(),
}));

const mockAuthFetch = authFetch as unknown as Mock;
const mockDownload = downloadFile as unknown as Mock;

const textFile: FileItem = {
  key: "notes.txt",
  name: "notes.txt",
  isDir: false,
  size: 5,
  uploaded: "",
  contentType: "text/plain",
};

beforeEach(() => {
  setLang("zh");
  mockAuthFetch.mockReset();
  mockDownload.mockReset();
  (URL as any).createObjectURL = vi.fn(() => "blob:preview");
  (URL as any).revokeObjectURL = vi.fn();
});

describe("PreviewDialog", () => {
  test("renders text preview and share action", async () => {
    const bytes = new TextEncoder().encode("hello");
    mockAuthFetch.mockResolvedValue({
      ok: true,
      headers: { get: (n: string) => (n.toLowerCase() === "content-length" ? "5" : null) },
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
    });
    const onShare = vi.fn();
    render(
      <PreviewDialog
        file={textFile}
        onClose={vi.fn()}
        onNotify={vi.fn()}
        onShare={onShare}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText("hello")).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.share));
    expect(onShare).toHaveBeenCalled();
  });

  test("fetch error notifies", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
      body: null,
    });
    const onNotify = vi.fn();
    render(
      <PreviewDialog
        file={textFile}
        onClose={vi.fn()}
        onNotify={onNotify}
        onShare={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(onNotify).toHaveBeenCalled());
  });

  test("closed when file is null", () => {
    render(
      <PreviewDialog
        file={null}
        onClose={vi.fn()}
        onNotify={vi.fn()}
        onShare={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.queryByText(strings.share)).not.toBeInTheDocument();
  });

  function textResponse(text: string, etag: string | null) {
    const bytes = new TextEncoder().encode(text);
    return {
      ok: true,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "etag" ? etag : null,
      },
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

  test("text edit saves via PUT with If-Match and refreshes", async () => {
    mockAuthFetch
      .mockResolvedValueOnce(textResponse("hello", '"v1"'))
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: (name: string) => (name.toLowerCase() === "etag" ? '"v2"' : null) },
      });
    const onSaved = vi.fn();
    const onNotify = vi.fn();
    render(
      <PreviewDialog
        file={textFile}
        onClose={vi.fn()}
        onNotify={onNotify}
        onShare={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onSaved={onSaved}
      />
    );
    await waitFor(() => expect(screen.getByText("hello")).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.previewEdit));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.click(screen.getByText(strings.save));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [putUrl, putInit] = mockAuthFetch.mock.calls[1];
    expect(putUrl).toBe("/webdav/notes.txt");
    expect(putInit.method).toBe("PUT");
    expect(putInit.headers).toEqual({ "If-Match": '"v1"' });
    expect(putInit.body).toBe("hello world");
    expect(onNotify).toHaveBeenCalledWith(strings.previewSavedToast, "success");
  });

  test("save conflict (412) keeps editing state", async () => {
    mockAuthFetch
      .mockResolvedValueOnce(textResponse("hello", '"v1"'))
      .mockResolvedValueOnce({ ok: false, status: 412, headers: { get: () => null } });
    const onNotify = vi.fn();
    const onClose = vi.fn();
    render(
      <PreviewDialog
        file={textFile}
        onClose={onClose}
        onNotify={onNotify}
        onShare={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText("hello")).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.previewEdit));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "local edit" } });
    fireEvent.click(screen.getByText(strings.save));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith(strings.previewConflictToast, "error"));
    // 编辑态保留，内容未被覆盖
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("closing with unsaved edits asks for discard confirmation", async () => {
    mockAuthFetch.mockResolvedValueOnce(textResponse("hello", '"v1"'));
    const onClose = vi.fn();
    render(
      <PreviewDialog
        file={textFile}
        onClose={onClose}
        onNotify={vi.fn()}
        onShare={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText("hello")).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.previewEdit));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "dirty" } });
    // 编辑态没有「关闭」按钮，「取消」在有未保存修改时走确认
    fireEvent.click(screen.getByText(strings.cancel));
    expect(await screen.findByText(strings.previewDiscardTitle)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(strings.previewDiscardConfirm));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});


function blobFetch(type: string) {
  return {
    ok: true,
    headers: { get: () => null },
    blob: async () => new Blob(["xx"], { type }),
    body: null,
  };
}

describe("PreviewDialog leftovers", () => {
  test("image preview rotate, download, siblings", async () => {
    mockAuthFetch.mockResolvedValue(blobFetch("image/png"));
    const onSibling = vi.fn();
    const img: FileItem = {
      key: "a.png",
      name: "a.png",
      isDir: false,
      size: 4,
      uploaded: "",
      contentType: "image/png",
    };
    const img2: FileItem = { ...img, key: "b.png", name: "b.png" };
    render(
      <PreviewDialog
        file={img}
        siblings={[img, img2]}
        onSibling={onSibling}
        onClose={vi.fn()}
        onNotify={vi.fn()}
        onShare={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByLabelText(strings.nextFile)).toBeEnabled());
    fireEvent.click(screen.getByLabelText(strings.nextFile));
    expect(onSibling).toHaveBeenCalledWith(img2);
    fireEvent.click(screen.getByText(strings.nextFile));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.click(screen.getByText(strings.download));
    expect(mockDownload).toHaveBeenCalled();
  });

  test("too-large text skips fetch", async () => {
    const big: FileItem = {
      key: "huge.txt",
      name: "huge.txt",
      isDir: false,
      size: 5 * 1024 * 1024,
      uploaded: "",
      contentType: "text/plain",
    };
    render(
      <PreviewDialog
        file={big}
        onClose={vi.fn()}
        onNotify={vi.fn()}
        onShare={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(screen.getByText(strings.previewTooLargeTitle)).toBeInTheDocument()
    );
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  test("json parse warning and copy all", async () => {
    const bytes = new TextEncoder().encode("{not json");
    mockAuthFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => null },
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
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const jsonFile: FileItem = {
      key: "a.json",
      name: "a.json",
      isDir: false,
      size: 9,
      uploaded: "",
      contentType: "application/json",
    };
    const onNotify = vi.fn();
    render(
      <PreviewDialog
        file={jsonFile}
        onClose={vi.fn()}
        onNotify={onNotify}
        onShare={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(screen.getByText(strings.jsonParseFailed)).toBeInTheDocument()
    );
    fireEvent.click(screen.getByText(strings.copyAll));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(expect.any(String), "success")
    );
  });

  test("video and pdf and audio urls", async () => {
    mockAuthFetch.mockResolvedValue(blobFetch("video/mp4"));
    const video: FileItem = {
      key: "a.mp4",
      name: "a.mp4",
      isDir: false,
      size: 4,
      uploaded: "",
      contentType: "video/mp4",
    };
    const { unmount } = render(
      <PreviewDialog
        file={video}
        onClose={vi.fn()}
        onNotify={vi.fn()}
        onShare={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText("a.mp4")).toBeInTheDocument());
    unmount();

    mockAuthFetch.mockResolvedValue(blobFetch("audio/mpeg"));
    const audio: FileItem = { ...video, key: "a.mp3", name: "a.mp3", contentType: "audio/mpeg" };
    const r2 = render(
      <PreviewDialog
        file={audio}
        onClose={vi.fn()}
        onNotify={vi.fn()}
        onShare={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(document.querySelector("audio")).toBeTruthy());
    r2.unmount();

    mockAuthFetch.mockResolvedValue(blobFetch("application/pdf"));
    const pdf: FileItem = { ...video, key: "a.pdf", name: "a.pdf", contentType: "application/pdf" };
    render(
      <PreviewDialog
        file={pdf}
        onClose={vi.fn()}
        onNotify={vi.fn()}
        onShare={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(document.querySelector("iframe")).toBeTruthy());
  });
});

describe("PDF preview title (#149)", () => {
  test("iframe shows a copy titled with the file name; download keeps the original bytes", async () => {
    const original =
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 2\n0000000000 65535 f\r\n0000000009 00000 n\r\n" +
      "trailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n47\n%%EOF\n";
    const source = new Blob([original], { type: "application/pdf" });
    mockAuthFetch.mockResolvedValue({ ok: true, headers: { get: () => null }, blob: async () => source, body: null });
    const made: Blob[] = [];
    (URL as any).createObjectURL = vi.fn((blob: Blob) => {
      made.push(blob);
      return `blob:${made.length}`;
    });
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.getAttribute("href") || "");
    });
    const pdf: FileItem = { key: "docs/季度.pdf", name: "季度.pdf", isDir: false, size: original.length, uploaded: "", contentType: "application/pdf" };
    const { unmount } = render(
      <PreviewDialog file={pdf} onClose={vi.fn()} onNotify={vi.fn()} onShare={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />
    );
    await waitFor(() => expect(document.querySelector("iframe")?.getAttribute("src")).toBe("blob:2"));
    expect(made[0]).toBe(source);
    expect(made[1]).not.toBe(source);
    expect(made[1].size).toBeGreaterThan(source.size);
    fireEvent.click(screen.getAllByText(strings.download)[0]);
    expect(clicked).toEqual(["blob:1"]);
    expect(mockDownload).not.toHaveBeenCalled();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");
    click.mockRestore();
  });
});

describe("PDF sibling switch never shows the previous blob URL (#185)", () => {
  const pdfBody = (n: number) =>
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 2\n0000000000 65535 f\r\n0000000009 00000 n\r\n" +
    `trailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n47\n%%EOF\n%${"x".repeat(n)}\n`;

  test("switching from a loaded PDF to the previous one: no frame pairs the new file with the old URL", async () => {
    const a: FileItem = { key: "docs/英文 name & #hash.pdf", name: "英文 name & #hash.pdf", isDir: false, size: 200, uploaded: "", contentType: "application/pdf" };
    const b: FileItem = { ...a, key: "docs/季度报告 (v2).pdf", name: "季度报告 (v2).pdf" };
    let releaseB!: () => void;
    const gateB = new Promise<void>((r) => (releaseB = r));
    mockAuthFetch.mockImplementation(async (path: string) => {
      const isB = path.includes(encodeURIComponent("季度报告"));
      if (isB) await gateB;
      return { ok: true, headers: { get: () => null }, blob: async () => new Blob([pdfBody(isB ? 2 : 1)], { type: "application/pdf" }), body: null };
    });
    let n = 0;
    (URL as any).createObjectURL = vi.fn(() => `blob:u${++n}`);
    const props = { siblings: [b, a], onSibling: vi.fn(), onClose: vi.fn(), onNotify: vi.fn(), onShare: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() };
    const { rerender } = render(<PreviewDialog file={a} {...props} />);
    // a：u1 = 原文件（下载用），u2 = 带标题的副本（iframe 用）
    await waitFor(() => expect(document.querySelector("iframe")?.getAttribute("src")).toBe("blob:u2"));
    const firstFrame = document.querySelector("iframe");

    const seen: Array<{ src: string | null; title: string | null }> = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const nodes = record.type === "attributes" ? [record.target] : Array.from(record.addedNodes);
        for (const node of nodes) {
          const frames = node instanceof HTMLIFrameElement ? [node] : node instanceof Element ? Array.from(node.querySelectorAll("iframe")) : [];
          frames.forEach((el) => seen.push({ src: el.getAttribute("src"), title: el.getAttribute("title") }));
        }
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "title"] });

    rerender(<PreviewDialog file={b} {...props} />); // 「上一个」
    await Promise.resolve();
    expect(document.querySelector("iframe")).toBeNull(); // 加载中：不保留旧阅读器
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:u1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:u2");

    releaseB();
    await waitFor(() => expect(document.querySelector("iframe")?.getAttribute("src")).toBe("blob:u4"));
    observer.disconnect();
    expect(document.querySelector("iframe")).not.toBe(firstFrame);
    expect(document.querySelector("iframe")?.getAttribute("title")).toBe(b.name);
    // 任何时刻都没有「标题是 b、地址却是 a 的旧 URL」的 iframe
    expect(seen.filter((s) => s.title === b.name && s.src !== "blob:u4")).toEqual([]);
  });
});


describe("PDF preview stays covered until the viewer settles (#190)", () => {
  const pdfBody =
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 2\n0000000000 65535 f\r\n0000000009 00000 n\r\n" +
    "trailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n47\n%%EOF\n";

  test("iframe is not mounted while withPdfTitle is still running; cover hides it until load", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockAuthFetch.mockImplementation(async () => {
      await gate;
      return {
        ok: true,
        headers: { get: () => null },
        blob: async () => new Blob([pdfBody], { type: "application/pdf" }),
        body: null,
      };
    });
    let n = 0;
    (URL as any).createObjectURL = vi.fn(() => `blob:t${++n}`);
    const pdf: FileItem = {
      key: "docs/a.pdf",
      name: "a.pdf",
      isDir: false,
      size: 30_000_000,
      uploaded: "",
      contentType: "application/pdf",
    };
    try {
      render(
        <PreviewDialog
          file={pdf}
          onClose={vi.fn()}
          onNotify={vi.fn()}
          onShare={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      // 标题还没写完：只有转圈，没有阅读器
      expect(document.querySelector("iframe")).toBeNull();
      expect(screen.getAllByRole("progressbar").length).toBeGreaterThan(0);
      release();
      await waitFor(() => expect(document.querySelector("iframe")?.getAttribute("src")).toBe("blob:t2"));
      const frame = document.querySelector("iframe")!;
      // 刚挂上时仍盖着（大文件按体积会有解析缓冲）
      expect(frame.style.visibility).toBe("hidden");
      fireEvent.load(frame);
      await vi.advanceTimersByTimeAsync(1600);
      expect(frame.style.visibility).toBe("visible");
    } finally {
      vi.useRealTimers();
    }
  });
});
