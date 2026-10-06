import { vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import CollectDialog from "../../CollectDialog";
import CollectLinksSection from "../../CollectLinksSection";
import { CollectInfo, createCollect, deleteCollect, disableCollect, listCollects } from "../collects";
import { setLang, strings, translate } from "../strings";
import { FileItem } from "../types";

vi.mock("../collects", async () => {
  const actual = await vi.importActual("../collects");
  return {
    ...actual,
    listCollects: vi.fn(),
    createCollect: vi.fn(),
    disableCollect: vi.fn(),
    deleteCollect: vi.fn(),
  };
});
vi.mock("../../ShareQrButton", () => ({ __esModule: true, default: () => <span>qr</span> }));

const mockList = listCollects as unknown as Mock;
const mockCreate = createCollect as unknown as Mock;
const mockDisable = disableCollect as unknown as Mock;
const mockDelete = deleteCollect as unknown as Mock;

const folder: FileItem = {
  key: "inbox/",
  name: "inbox",
  isDir: true,
  size: 0,
  uploaded: "",
  contentType: "application/x-directory",
};

function info(overrides: Partial<CollectInfo> = {}): CollectInfo {
  return {
    token: "t1",
    url: "https://drive.example/collect/t1",
    folder: "inbox",
    name: "inbox",
    note: "",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    disabledAt: null,
    status: "active",
    limits: { maxFileBytes: 100 * 1024 * 1024, maxFiles: 200, maxTotalBytes: 2 * 1024 ** 3 },
    usage: { files: 3, bytes: 2048 },
    pendingCount: 0,
    ...overrides,
  };
}

let writeText: Mock;

beforeEach(() => {
  setLang("zh");
  mockList.mockReset();
  mockCreate.mockReset();
  mockDisable.mockReset();
  mockDelete.mockReset();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

describe("CollectDialog", () => {
  test("shows only this folder's links; creates with chosen expiry and note; copies", async () => {
    mockList.mockResolvedValue([info(), info({ token: "t2", folder: "other", url: "u2" })]);
    mockCreate.mockResolvedValue(info({ token: "t3", url: "https://drive.example/collect/t3", note: "hw" }));
    const onNotify = vi.fn();
    render(<CollectDialog open folder={folder} onClose={vi.fn()} onNotify={onNotify} />);
    expect(screen.getByText(translate("collectDialogTitle", { name: "inbox" }))).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("https://drive.example/collect/t1")).toBeInTheDocument());
    expect(screen.queryByText("u2")).not.toBeInTheDocument();
    expect(screen.getByText(/2.0 KB/)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(within(screen.getByRole("listbox")).getByText(strings.collectExpiry3d));
    fireEvent.change(screen.getByLabelText(strings.collectNoteLabel), { target: { value: "hw" } });
    fireEvent.click(screen.getByText(strings.createCollectLink));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith("inbox", 72, "hw"));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith(translate("collectLinkCreated"), "success"));
    expect(writeText).toHaveBeenCalledWith("https://drive.example/collect/t3");
    expect(screen.getByText("https://drive.example/collect/t3")).toBeInTheDocument();
  });

  test("clipboard failure still reports creation; create error notifies", async () => {
    mockList.mockResolvedValue([]);
    writeText.mockRejectedValue(new Error("denied"));
    mockCreate.mockResolvedValueOnce(info({ token: "t9" }));
    const onNotify = vi.fn();
    render(<CollectDialog open folder={folder} onClose={vi.fn()} onNotify={onNotify} />);
    fireEvent.click(screen.getByText(strings.createCollectLink));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("collectLinkCreatedNoCopy"), "success")
    );
    mockCreate.mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(screen.getByText(strings.createCollectLink));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("boom", "error"));
  });

  test("list load failure notifies", async () => {
    mockList.mockRejectedValue(new Error("nope"));
    const onNotify = vi.fn();
    render(<CollectDialog open folder={folder} onClose={vi.fn()} onNotify={onNotify} />);
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("nope", "error"));
  });

  test("closed dialog does not load", () => {
    render(<CollectDialog open={false} folder={null} onClose={vi.fn()} onNotify={vi.fn()} />);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe("CollectLinkList actions (via CollectLinksSection)", () => {
  test("copy, disable, delete", async () => {
    mockList.mockResolvedValue([info({ note: "请上传作业" }), info({ token: "old", url: "u-old", status: "expired" })]);
    mockDisable.mockResolvedValue(info({ status: "disabled", disabledAt: new Date().toISOString() }));
    mockDelete.mockResolvedValue(undefined);
    const onNotify = vi.fn();
    render(<CollectLinksSection onNotify={onNotify} />);
    await waitFor(() => expect(screen.getByText("请上传作业")).toBeInTheDocument());
    expect(screen.getByText(strings.collectLinks)).toBeInTheDocument();
    expect(screen.getAllByText(translate("collectTarget", { folder: "inbox" }))).toHaveLength(2);
    expect(screen.getByText(strings.collectStatusExpired)).toBeInTheDocument();
    // expired 只有删除按钮
    expect(screen.getAllByText(strings.copy)).toHaveLength(1);

    fireEvent.click(screen.getByText(strings.copy));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith(translate("linkCopied"), "success"));

    fireEvent.click(screen.getByText(strings.collectDisable));
    await waitFor(() => expect(mockDisable).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(screen.getByText(strings.collectStatusDisabled)).toBeInTheDocument());
    expect(screen.queryByText(strings.collectDisable)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByText(strings.delete)[1]);
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("old"));
    await waitFor(() => expect(screen.queryByText("u-old")).not.toBeInTheDocument());
    expect(onNotify).toHaveBeenCalledWith(translate("collectDeletedToast"), "success");
  });

  test("action failures notify errors; copy failure", async () => {
    mockList.mockResolvedValue([info()]);
    mockDisable.mockRejectedValue(new Error("d-fail"));
    mockDelete.mockRejectedValue(new Error("x-fail"));
    writeText.mockRejectedValue(new Error("denied"));
    const onNotify = vi.fn();
    render(<CollectLinksSection onNotify={onNotify} />);
    await waitFor(() => expect(screen.getByText(strings.copy)).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.copy));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith(translate("copyFailed2"), "error"));
    fireEvent.click(screen.getByText(strings.collectDisable));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("d-fail", "error"));
    fireEvent.click(screen.getByText(strings.delete));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("x-fail", "error"));
  });

  test("empty hint and inline load failure", async () => {
    mockList.mockResolvedValueOnce([]);
    const { unmount } = render(<CollectLinksSection onNotify={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(strings.collectEmptyHint)).toBeInTheDocument());
    unmount();
    mockList.mockRejectedValueOnce(new Error("x"));
    const onNotify = vi.fn();
    render(<CollectLinksSection onNotify={onNotify} />);
    await waitFor(() => expect(screen.getByText(strings.loadCollectsFailed)).toBeInTheDocument());
    expect(onNotify).not.toHaveBeenCalled();
  });
});
