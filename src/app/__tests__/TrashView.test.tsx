import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import TrashView from "../../TrashView";
import { listTrash, permanentDeleteTrash, restoreTrash } from "../trash";
import { setLang, strings, translate } from "../strings";
import { TrashItem } from "../types";

jest.mock("../trash", () => ({
  listTrash: jest.fn(),
  permanentDeleteTrash: jest.fn(),
  restoreTrash: jest.fn(),
}));

const mockListTrash = listTrash as unknown as jest.Mock;
const mockPermanent = permanentDeleteTrash as unknown as jest.Mock;
const mockRestore = restoreTrash as unknown as jest.Mock;

const item: TrashItem = {
  trashKey: "t1",
  originalKey: "a.txt",
  name: "a.txt",
  deletedAt: "2026-01-01T00:00:00.000Z",
  size: 12,
};

beforeEach(() => {
  setLang("zh");
  mockListTrash.mockReset();
  mockPermanent.mockReset();
  mockRestore.mockReset();
});

describe("TrashView", () => {
  test("empty trash state", async () => {
    mockListTrash.mockResolvedValue([]);
    const onGoFiles = jest.fn();
    render(<TrashView onNotify={jest.fn()} onGoFiles={onGoFiles} />);
    await waitFor(() => expect(screen.getByText(strings.emptyTrash)).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.goToFiles));
    expect(onGoFiles).toHaveBeenCalled();
  });

  test("select and restore", async () => {
    mockListTrash.mockResolvedValue([item]);
    mockRestore.mockResolvedValue([{ trashKey: "t1", status: "restored" }]);
    const onNotify = jest.fn();
    render(<TrashView onNotify={onNotify} />);
    fireEvent.click(await screen.findByText("a.txt"));
    fireEvent.click(screen.getByText(strings.restoreBtn));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("restoreDone"), "success")
    );
    expect(mockRestore).toHaveBeenCalledWith(["t1"]);
  });

  test("load error notifies", async () => {
    mockListTrash.mockRejectedValue(new Error("trash-fail"));
    const onNotify = jest.fn();
    render(<TrashView onNotify={onNotify} />);
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("trash-fail", "error"));
  });

  test("renders loading skeleton before list resolves", () => {
    let resolveList!: (v: TrashItem[]) => void;
    mockListTrash.mockReturnValue(
      new Promise<TrashItem[]>((resolve) => { resolveList = resolve; })
    );
    const { container } = render(<TrashView onNotify={jest.fn()} />);
    expect(container.querySelector(".MuiSkeleton-root")).toBeTruthy();
    resolveList([]);
  });

  test("permanent delete selected item through confirm dialog", async () => {
    mockListTrash.mockResolvedValue([item]);
    mockPermanent.mockResolvedValue(undefined);
    const onNotify = jest.fn();
    render(<TrashView onNotify={onNotify} />);
    fireEvent.click(await screen.findByText("a.txt"));
    fireEvent.click(screen.getByText(strings.permanentDelete));
    expect(
      screen.getByText(translate("permanentDeleteCountConfirm", { count: 1 }))
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText(strings.deleteAction));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("permanentDeletedToast"), "success")
    );
    expect(mockPermanent).toHaveBeenCalledWith(["t1"]);
  });

  test("empty trash through confirm dialog", async () => {
    mockListTrash.mockResolvedValue([item]);
    mockPermanent.mockResolvedValue(undefined);
    const onNotify = jest.fn();
    render(<TrashView onNotify={onNotify} />);
    await screen.findByText("a.txt");
    fireEvent.click(screen.getByText(strings.clearTrash));
    expect(screen.getByText(strings.clearTrashConfirm)).toBeInTheDocument();
    fireEvent.click(screen.getByText(strings.deleteAction));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("trashClearedToast"), "success")
    );
    expect(mockPermanent).toHaveBeenCalledWith([], true);
  });

  test("partial restore failure notifies error", async () => {
    mockListTrash.mockResolvedValue([item]);
    mockRestore.mockResolvedValue([
      { trashKey: "t1", status: "error", message: "目标位置已存在" },
    ]);
    const onNotify = jest.fn();
    render(<TrashView onNotify={onNotify} />);
    fireEvent.click(await screen.findByText("a.txt"));
    fireEvent.click(screen.getByText(strings.restoreBtn));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith("目标位置已存在", "error")
    );
  });

  test("permanent delete failure notifies error", async () => {
    mockListTrash.mockResolvedValue([item]);
    mockPermanent.mockRejectedValue(new Error("perm-fail"));
    const onNotify = jest.fn();
    render(<TrashView onNotify={onNotify} />);
    fireEvent.click(await screen.findByText("a.txt"));
    fireEvent.click(screen.getByText(strings.permanentDelete));
    fireEvent.click(screen.getByText(strings.deleteAction));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith("perm-fail", "error")
    );
  });

  test("row click toggles selection off", async () => {
    mockListTrash.mockResolvedValue([item]);
    render(<TrashView onNotify={jest.fn()} />);
    const row = await screen.findByText("a.txt");
    fireEvent.click(row);
    const restoreBtn = screen.getByText(strings.restoreBtn).closest("button")!;
    expect(restoreBtn.disabled).toBe(false);
    fireEvent.click(row);
    expect(restoreBtn.disabled).toBe(true);
  });

  test("checkbox toggles selection", async () => {
    mockListTrash.mockResolvedValue([item]);
    render(<TrashView onNotify={jest.fn()} />);
    const checkbox = (await screen.findByRole("checkbox")) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(screen.getByText(strings.restoreBtn).closest("button")!.disabled).toBe(false);
  });

  test("restore rejection notifies error", async () => {
    mockListTrash.mockResolvedValue([item]);
    mockRestore.mockRejectedValue(new Error("restore-fail"));
    const onNotify = jest.fn();
    render(<TrashView onNotify={onNotify} />);
    fireEvent.click(await screen.findByText("a.txt"));
    fireEvent.click(screen.getByText(strings.restoreBtn));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("restore-fail", "error"));
  });

  test("empty trash rejection notifies error", async () => {
    mockListTrash.mockResolvedValue([item]);
    mockPermanent.mockRejectedValue(new Error("empty-fail"));
    const onNotify = jest.fn();
    render(<TrashView onNotify={onNotify} />);
    await screen.findByText("a.txt");
    fireEvent.click(screen.getByText(strings.clearTrash));
    fireEvent.click(screen.getByText(strings.deleteAction));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("empty-fail", "error"));
  });

  test("cancel delete dialog leaves item untouched", async () => {
    mockListTrash.mockResolvedValue([item]);
    const onNotify = jest.fn();
    render(<TrashView onNotify={onNotify} />);
    fireEvent.click(await screen.findByText("a.txt"));
    fireEvent.click(screen.getByText(strings.permanentDelete));
    fireEvent.click(screen.getByText(strings.cancel));
    expect(mockPermanent).not.toHaveBeenCalled();
    expect(screen.getByText("a.txt")).toBeInTheDocument();
  });
});
