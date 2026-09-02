import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import PreviewDialog from "../../PreviewDialog";
import { authFetch } from "../auth";
import { downloadFile } from "../transfer";
import { setLang, strings } from "../strings";
import { FileItem } from "../types";

jest.mock("../auth", () => ({
  authFetch: jest.fn(),
}));

jest.mock("../transfer", () => ({
  downloadFile: jest.fn(),
}));

const mockAuthFetch = authFetch as unknown as jest.Mock;
const mockDownload = downloadFile as unknown as jest.Mock;

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
  (URL as any).createObjectURL = jest.fn(() => "blob:preview");
  (URL as any).revokeObjectURL = jest.fn();
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
    const onShare = jest.fn();
    render(
      <PreviewDialog
        file={textFile}
        onClose={jest.fn()}
        onNotify={jest.fn()}
        onShare={onShare}
        onRename={jest.fn()}
        onDelete={jest.fn()}
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
    const onNotify = jest.fn();
    render(
      <PreviewDialog
        file={textFile}
        onClose={jest.fn()}
        onNotify={onNotify}
        onShare={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    await waitFor(() => expect(onNotify).toHaveBeenCalled());
  });

  test("closed when file is null", () => {
    render(
      <PreviewDialog
        file={null}
        onClose={jest.fn()}
        onNotify={jest.fn()}
        onShare={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(screen.queryByText(strings.share)).not.toBeInTheDocument();
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
    const onSibling = jest.fn();
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
        onClose={jest.fn()}
        onNotify={jest.fn()}
        onShare={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
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
        onClose={jest.fn()}
        onNotify={jest.fn()}
        onShare={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
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
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
    const jsonFile: FileItem = {
      key: "a.json",
      name: "a.json",
      isDir: false,
      size: 9,
      uploaded: "",
      contentType: "application/json",
    };
    const onNotify = jest.fn();
    render(
      <PreviewDialog
        file={jsonFile}
        onClose={jest.fn()}
        onNotify={onNotify}
        onShare={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
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
        onClose={jest.fn()}
        onNotify={jest.fn()}
        onShare={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText("a.mp4")).toBeInTheDocument());
    unmount();

    mockAuthFetch.mockResolvedValue(blobFetch("audio/mpeg"));
    const audio: FileItem = { ...video, key: "a.mp3", name: "a.mp3", contentType: "audio/mpeg" };
    const r2 = render(
      <PreviewDialog
        file={audio}
        onClose={jest.fn()}
        onNotify={jest.fn()}
        onShare={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    await waitFor(() => expect(document.querySelector("audio")).toBeTruthy());
    r2.unmount();

    mockAuthFetch.mockResolvedValue(blobFetch("application/pdf"));
    const pdf: FileItem = { ...video, key: "a.pdf", name: "a.pdf", contentType: "application/pdf" };
    render(
      <PreviewDialog
        file={pdf}
        onClose={jest.fn()}
        onNotify={jest.fn()}
        onShare={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    await waitFor(() => expect(document.querySelector("iframe")).toBeTruthy());
  });
});
