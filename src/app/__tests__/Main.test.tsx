import { vi, type Mock } from "vitest";
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import Main from "../../Main";
import { ClipboardProvider } from "../clipboard";
import { DEFAULT_FEATURE_FLAGS, useFeatures } from "../features";
import { useAuth } from "../auth";
import {
  collectFilesFromDataTransfer,
  copyPaste,
  createFolder,
  downloadArchive,
  downloadFile,
  fetchFolderCounts,
  fetchPath,
  openFile,
  searchFiles,
  selectDirectoryFiles,
} from "../transfer";
import { moveToTrash, restoreTrash } from "../trash";
import { setLang, strings, translate } from "../strings";

vi.mock("../auth", () => ({
  useAuth: vi.fn(),
  authFetch: vi.fn(),
}));

vi.mock("../features", async () => {
  const actual = await vi.importActual("../features");
  return { ...actual, useFeatures: vi.fn() };
});

const mockEnqueue = vi.fn();
vi.mock("../transferQueue", () => ({
  useTransferQueue: () => [],
  useUploadEnqueue: () => mockEnqueue,
}));

vi.mock("../transfer", () => ({
  collectFilesFromDataTransfer: vi.fn(),
  copyPaste: vi.fn(),
  createFolder: vi.fn(),
  downloadArchive: vi.fn(),
  downloadFile: vi.fn(),
  fetchFolderCounts: vi.fn().mockResolvedValue({}),
  fetchPath: vi.fn(),
  openFile: vi.fn(),
  searchFiles: vi.fn(),
  selectDirectoryFiles: vi.fn(),
}));

vi.mock("../trash", () => ({
  moveToTrash: vi.fn(),
  restoreTrash: vi.fn(),
}));

vi.mock("../../PreviewDialog", () => ({ __esModule: true, default: () => null }));
vi.mock("../../ShareDialog", () => ({ __esModule: true, default: () => null }));
vi.mock("../../SitesView", () => ({ __esModule: true, default: () => <div>sites-stub</div> }));
vi.mock("../../ImagesView", () => ({ __esModule: true, default: () => <div>images-stub</div> }));
vi.mock("../../TrashView", () => ({ __esModule: true, default: () => <div>trash-stub</div> }));
vi.mock("../../SharesView", () => ({ __esModule: true, default: () => <div>shares-stub</div> }));
vi.mock("../../SettingsView", () => ({ __esModule: true, default: () => <div>settings-stub</div> }));
vi.mock("../../WebDavPanel", () => ({ __esModule: true, default: () => null }));
vi.mock("../../TextPadDrawer", () => ({ __esModule: true, default: () => null }));
vi.mock("../../MoveDialog", () => ({ __esModule: true, default: () => null }));
vi.mock("../../AuthThumbnail", () => ({ __esModule: true, default: () => <span /> }));
vi.mock("../../MimeIcon", () => ({ __esModule: true, default: () => <span /> }));

const mockUseAuth = useAuth as unknown as Mock;
const mockUseFeatures = useFeatures as unknown as Mock;
const mockFetchPath = fetchPath as unknown as Mock;
const mockSearch = searchFiles as unknown as Mock;
const mockCopyPaste = copyPaste as unknown as Mock;
const mockCreateFolder = createFolder as unknown as Mock;
const mockMoveTrash = moveToTrash as unknown as Mock;
const mockRestore = restoreTrash as unknown as Mock;
const mockCollect = collectFilesFromDataTransfer as unknown as Mock;
const mockSelectDir = selectDirectoryFiles as unknown as Mock;
const mockDownload = downloadFile as unknown as Mock;
const mockArchive = downloadArchive as unknown as Mock;
const mockOpen = openFile as unknown as Mock;
const mockCounts = fetchFolderCounts as unknown as Mock;

const file = {
  key: "a.txt",
  name: "a.txt",
  isDir: false,
  size: 1,
  uploaded: "2026-01-01T00:00:00.000Z",
  contentType: "text/plain",
};

const folder = {
  key: "docs",
  name: "docs",
  isDir: true,
  size: 0,
  uploaded: "2026-01-02T00:00:00.000Z",
  contentType: "application/x-directory",
};

const hidden = {
  key: ".DS_Store",
  name: ".DS_Store",
  isDir: false,
  size: 1,
  uploaded: "2026-01-03T00:00:00.000Z",
  contentType: "application/octet-stream",
};

function renderMain(route: any = { kind: "folder", path: "" }, extra: Partial<React.ComponentProps<typeof Main>> = {}) {
  const props = {
    search: "",
    onSearchChange: vi.fn(),
    onNotify: vi.fn(),
    view: "list" as const,
    onViewChange: vi.fn(),
    sort: { field: "name" as const, order: "asc" as const },
    onSortChange: vi.fn(),
    route,
    navigate: vi.fn(),
    onOpenApi: vi.fn(),
    onContentScroll: vi.fn(),
    ...extra,
  };
  const result = render(
    <ClipboardProvider>
      <Main {...props} />
    </ClipboardProvider>
  );
  return { ...result, props };
}

beforeAll(() => {
  (global as any).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

beforeEach(() => {
  setLang("zh");
  mockEnqueue.mockReset();
  mockUseAuth.mockReturnValue({ username: "alice", login: vi.fn(), logout: vi.fn() });
  mockUseFeatures.mockReturnValue({
    flags: DEFAULT_FEATURE_FLAGS,
    sitesHost: null,
    updateFlags: vi.fn(),
    refresh: vi.fn(),
    config: { username: "alice", publicRead: false, sitesHost: null, flags: DEFAULT_FEATURE_FLAGS },
  });
  mockFetchPath.mockReset();
  mockFetchPath.mockResolvedValue([file, folder, hidden]);
  mockSearch.mockReset();
  mockSearch.mockResolvedValue({ items: [file], hasMore: false });
  mockCopyPaste.mockReset();
  mockCopyPaste.mockResolvedValue(undefined);
  mockCreateFolder.mockReset();
  mockCreateFolder.mockResolvedValue(undefined);
  mockMoveTrash.mockReset();
  mockMoveTrash.mockResolvedValue({ results: [{ id: "t1" }] });
  mockRestore.mockReset();
  mockRestore.mockResolvedValue(undefined);
  mockCollect.mockReset();
  mockCollect.mockResolvedValue([]);
  mockSelectDir.mockReset();
  mockSelectDir.mockResolvedValue([]);
  mockDownload.mockReset();
  mockDownload.mockResolvedValue(undefined);
  mockArchive.mockReset();
  mockArchive.mockResolvedValue(undefined);
  mockOpen.mockReset();
  mockCounts.mockResolvedValue({ docs: 2 });
  sessionStorage.clear();
});

describe("Main", () => {
  test("loads folder listing", async () => {
    renderMain();
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
    expect(mockFetchPath).toHaveBeenCalledWith("");
  });

  test("listing error notifies", async () => {
    mockFetchPath.mockRejectedValue(new Error("list-fail"));
    const onNotify = vi.fn();
    renderMain({ kind: "folder", path: "" }, { onNotify });
    await waitFor(() => expect(onNotify).toHaveBeenCalled());
    expect(onNotify.mock.calls[0][0]).toBe("list-fail");
  });

  test("shares route renders stub", async () => {
    renderMain({ kind: "shares" });
    await waitFor(() => expect(screen.getByText("shares-stub")).toBeInTheDocument());
  });

  test("section switch navigates to trash", async () => {
    const { props } = renderMain();
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(strings.trash));
    expect(props.navigate).toHaveBeenCalledWith({ kind: "trash" });
  });

  test("sites/images/settings/trash stubs", async () => {
    const { unmount } = renderMain({ kind: "sites" });
    await waitFor(() => expect(screen.getByText("sites-stub")).toBeInTheDocument());
    unmount();
    const r2 = renderMain({ kind: "images" });
    await waitFor(() => expect(screen.getByText("images-stub")).toBeInTheDocument());
    r2.unmount();
    const r3 = renderMain({ kind: "settings" });
    await waitFor(() => expect(screen.getByText("settings-stub")).toBeInTheDocument());
    r3.unmount();
    renderMain({ kind: "trash" });
    await waitFor(() => expect(screen.getByText("trash-stub")).toBeInTheDocument());
  });

  test("disabled sites/images flags bounce back to folder", async () => {
    mockUseFeatures.mockReturnValue({
      flags: { ...DEFAULT_FEATURE_FLAGS, sites: false, imageHost: false },
      sitesHost: null,
      updateFlags: vi.fn(),
      refresh: vi.fn(),
      config: { username: "alice", publicRead: false, sitesHost: null, flags: DEFAULT_FEATURE_FLAGS },
    });
    const { props } = renderMain({ kind: "sites" });
    await waitFor(() =>
      expect(props.navigate).toHaveBeenCalledWith({ kind: "folder", path: "" })
    );
  });

  test("copy path, search scope, create folder, keyboard select/delete", async () => {
    const onNotify = vi.fn();
    renderMain({ kind: "folder", path: "docs/" }, { onNotify });
    mockFetchPath.mockResolvedValue([file]);
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(strings.copyPath));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("pathCopied"), "success")
    );

    fireEvent.click(screen.getByText(strings.searchAll));
    fireEvent.click(screen.getByText(strings.createFolder));
    fireEvent.change(screen.getByLabelText(strings.folderName), {
      target: { value: "newdir" },
    });
    fireEvent.click(screen.getByRole("button", { name: strings.create }));
    await waitFor(() => expect(mockCreateFolder).toHaveBeenCalledWith("docs/", "newdir"));
    await waitFor(() =>
      expect(screen.queryByLabelText(strings.folderName)).not.toBeInTheDocument()
    );

    fireEvent.click(
      screen.getByLabelText(translate("selectFileLabel", { name: "a.txt" }))
    );
    fireEvent.click(screen.getByRole("button", { name: strings.copy }));
    expect(onNotify).toHaveBeenCalledWith(translate("copiedToClipboard"), "success");
    fireEvent.click(screen.getByRole("button", { name: strings.delete }));
    fireEvent.click(screen.getByRole("button", { name: strings.confirmAction }));
    await waitFor(() => expect(mockMoveTrash).toHaveBeenCalled());
  });

  test("context menu copy/cut/download and open folder", async () => {
    const onNotify = vi.fn();
    const { props } = renderMain({ kind: "folder", path: "" }, { onNotify, view: "list" });
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
    fireEvent.click(
      screen.getByLabelText(translate("fileActionsLabel", { name: "a.txt" }))
    );
    fireEvent.click(screen.getByRole("menuitem", { name: strings.copy }));
    expect(onNotify).toHaveBeenCalledWith(translate("copiedToClipboard"), "success");

    fireEvent.click(
      screen.getByLabelText(translate("fileActionsLabel", { name: "a.txt" }))
    );
    fireEvent.click(screen.getByRole("menuitem", { name: strings.cut }));
    expect(onNotify).toHaveBeenCalledWith(translate("cutToClipboard"), "success");

    fireEvent.click(
      screen.getByLabelText(translate("fileActionsLabel", { name: "a.txt" }))
    );
    fireEvent.click(screen.getByRole("menuitem", { name: strings.download }));
    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith("a.txt"));

    fireEvent.click(screen.getByText("docs"));
    expect(props.navigate).toHaveBeenCalledWith({ kind: "folder", path: "docs/" });
  });

  test("rename via F2 and paste clipboard", async () => {
    const onNotify = vi.fn();
    renderMain({ kind: "folder", path: "" }, { onNotify });
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
    fireEvent.click(
      screen.getByLabelText(translate("selectFileLabel", { name: "a.txt" }))
    );
    fireEvent.keyDown(window, { key: "F2" });
    await waitFor(() => expect(screen.getByLabelText(strings.name)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(strings.name), {
      target: { value: "b.txt" },
    });
    fireEvent.click(screen.getByText(strings.ok));
    await waitFor(() => expect(mockCopyPaste).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByLabelText(strings.name)).not.toBeInTheDocument()
    );

    fireEvent.click(
      screen.getByLabelText(translate("fileActionsLabel", { name: "a.txt" }))
    );
    fireEvent.click(screen.getByRole("menuitem", { name: strings.copy }));
    const pasteBtn = screen.getByRole("button", { name: new RegExp(strings.paste) });
    fireEvent.click(pasteBtn);
    await waitFor(() => expect(mockCopyPaste).toHaveBeenCalled());
  });

  test("keyboard arrows, select all, escape, enter, backspace, delete", async () => {
    const { props } = renderMain({ kind: "folder", path: "docs/" });
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Home" });
    fireEvent.keyDown(window, { key: "End" });
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(props.navigate).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Delete" });
  });

  test("window file paste and drag overlay", async () => {
    const onNotify = vi.fn();
    renderMain({ kind: "folder", path: "" }, { onNotify });
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
    const pasted = new File(["x"], "image.png", { type: "image/png" });
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [{ kind: "file", getAsFile: () => pasted }],
      },
    });
    Object.defineProperty(pasteEvent, "target", { value: document.body });
    window.dispatchEvent(pasteEvent);
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());

    mockCollect.mockResolvedValue([new File(["z"], "drop.txt")]);
    const dt = { types: ["Files"], files: [] };
    const enter = new Event("dragenter", { bubbles: true, cancelable: true });
    Object.defineProperty(enter, "dataTransfer", { value: dt });
    window.dispatchEvent(enter);
    await waitFor(() => expect(screen.getByText(strings.dropToUpload)).toBeInTheDocument());
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: dt });
    window.dispatchEvent(drop);
    await waitFor(() => expect(mockCollect).toHaveBeenCalled());
  });

  test("global search uses searchFiles", async () => {
    vi.useFakeTimers();
    renderMain({ kind: "folder", path: "" }, { search: "hello" });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await waitFor(() => expect(mockSearch).toHaveBeenCalled());
    vi.useRealTimers();
  });

  test("sort by size and date still lists files", async () => {
    const { rerender, props } = renderMain(
      { kind: "folder", path: "" },
      { sort: { field: "size", order: "desc" } }
    );
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
    rerender(
      <ClipboardProvider>
        <Main
          {...props}
          sort={{ field: "date", order: "asc" }}
        />
      </ClipboardProvider>
    );
    await waitFor(() => expect(screen.getByText("docs")).toBeInTheDocument());
  });

  test("username null skips listing", async () => {
    mockUseAuth.mockReturnValue({ username: null, login: vi.fn(), logout: vi.fn() });
    renderMain();
    await waitFor(() => expect(mockFetchPath).not.toHaveBeenCalled());
  });
});
