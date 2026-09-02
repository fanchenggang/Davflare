import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import Main from "../../Main";
import { ClipboardProvider } from "../clipboard";
import { DEFAULT_FEATURE_FLAGS, useFeatures } from "../features";
import { useAuth } from "../auth";
import { fetchPath } from "../transfer";
import { setLang, strings } from "../strings";

jest.mock("../auth", () => ({
  useAuth: jest.fn(),
  authFetch: jest.fn(),
}));

jest.mock("../features", () => {
  const actual = jest.requireActual("../features");
  return { ...actual, useFeatures: jest.fn() };
});

jest.mock("../transferQueue", () => ({
  useTransferQueue: () => [],
  useUploadEnqueue: () => jest.fn(),
}));

jest.mock("../transfer", () => ({
  collectFilesFromDataTransfer: jest.fn(),
  copyPaste: jest.fn(),
  createFolder: jest.fn(),
  downloadArchive: jest.fn(),
  downloadFile: jest.fn(),
  fetchFolderCounts: jest.fn().mockResolvedValue({}),
  fetchPath: jest.fn(),
  openFile: jest.fn(),
  searchFiles: jest.fn(),
  selectDirectoryFiles: jest.fn(),
}));

jest.mock("../trash", () => ({
  moveToTrash: jest.fn(),
  restoreTrash: jest.fn(),
}));

jest.mock("../../PreviewDialog", () => ({ __esModule: true, default: () => null }));
jest.mock("../../ShareDialog", () => ({ __esModule: true, default: () => null }));
jest.mock("../../SitesView", () => ({ __esModule: true, default: () => <div>sites-stub</div> }));
jest.mock("../../ImagesView", () => ({ __esModule: true, default: () => <div>images-stub</div> }));
jest.mock("../../TrashView", () => ({ __esModule: true, default: () => <div>trash-stub</div> }));
jest.mock("../../SharesView", () => ({ __esModule: true, default: () => <div>shares-stub</div> }));
jest.mock("../../SettingsView", () => ({ __esModule: true, default: () => <div>settings-stub</div> }));
jest.mock("../../WebDavPanel", () => ({ __esModule: true, default: () => null }));
jest.mock("../../TextPadDrawer", () => ({ __esModule: true, default: () => null }));
jest.mock("../../MoveDialog", () => ({ __esModule: true, default: () => null }));
jest.mock("../../AuthThumbnail", () => ({ __esModule: true, default: () => <span /> }));
jest.mock("../../MimeIcon", () => ({ __esModule: true, default: () => <span /> }));

const mockUseAuth = useAuth as unknown as jest.Mock;
const mockUseFeatures = useFeatures as unknown as jest.Mock;
const mockFetchPath = fetchPath as unknown as jest.Mock;

const file = {
  key: "a.txt",
  name: "a.txt",
  isDir: false,
  size: 1,
  uploaded: "2026-01-01T00:00:00.000Z",
  contentType: "text/plain",
};

function renderMain(route: any = { kind: "folder", path: "" }, extra: Partial<React.ComponentProps<typeof Main>> = {}) {
  const props = {
    search: "",
    onSearchChange: jest.fn(),
    onNotify: jest.fn(),
    view: "list" as const,
    onViewChange: jest.fn(),
    sort: { field: "name" as const, order: "asc" as const },
    onSortChange: jest.fn(),
    route,
    navigate: jest.fn(),
    onOpenApi: jest.fn(),
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
});

beforeEach(() => {
  setLang("zh");
  mockUseAuth.mockReturnValue({ username: "alice", login: jest.fn(), logout: jest.fn() });
  mockUseFeatures.mockReturnValue({
    flags: DEFAULT_FEATURE_FLAGS,
    sitesHost: null,
    updateFlags: jest.fn(),
    refresh: jest.fn(),
    config: { username: "alice", publicRead: false, sitesHost: null, flags: DEFAULT_FEATURE_FLAGS },
  });
  mockFetchPath.mockReset();
  mockFetchPath.mockResolvedValue([file]);
});

describe("Main", () => {
  test("loads folder listing", async () => {
    renderMain();
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
    expect(mockFetchPath).toHaveBeenCalledWith("");
  });

  test("listing error notifies", async () => {
    mockFetchPath.mockRejectedValue(new Error("list-fail"));
    const onNotify = jest.fn();
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
});
