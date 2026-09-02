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
});
