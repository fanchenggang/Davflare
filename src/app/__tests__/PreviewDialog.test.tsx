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
  if (!URL.createObjectURL) {
    (URL as any).createObjectURL = jest.fn(() => "blob:preview");
  }
  if (!URL.revokeObjectURL) {
    (URL as any).revokeObjectURL = jest.fn();
  }
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
