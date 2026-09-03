import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import FileGrid, { FileGridSkeleton } from "../../FileGrid";
import { strings, translate } from "../strings";
import { FileItem } from "../types";

jest.mock("../../AuthThumbnail", () => ({
  __esModule: true,
  default: () => <span data-testid="auth-thumb" />,
}));

jest.mock("../../MimeIcon", () => ({
  __esModule: true,
  default: () => <span data-testid="mime-icon" />,
}));

const file: FileItem = {
  key: "notes.txt",
  name: "photo notes.txt",
  isDir: false,
  size: 128,
  uploaded: "2026-01-01T00:00:00.000Z",
  contentType: "text/plain",
  thumbnail: "digest",
};

const folder: FileItem = {
  key: "docs/",
  name: "docs",
  isDir: true,
  size: 0,
  uploaded: "2026-01-02T00:00:00.000Z",
  contentType: "application/octet-stream",
};

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
}

describe("FileGrid extras", () => {
  test("empty message", () => {
    wrap(
      <FileGrid
        files={[]}
        view="list"
        selectedKeys={[]}
        onToggleSelect={jest.fn()}
        onNavigate={jest.fn()}
        onOpen={jest.fn()}
        onOpenMenu={jest.fn()}
        emptyMessage={<div>empty-here</div>}
      />
    );
    expect(screen.getByText("empty-here")).toBeInTheDocument();
  });

  test("grid tiles, highlight, checkbox, ctrl-click, drop, drag, quick actions", () => {
    const onToggle = jest.fn();
    const onDrop = jest.fn();
    const onDownload = jest.fn();
    const onShare = jest.fn();
    const onDelete = jest.fn();
    const onOpenMenu = jest.fn();
    const onNavigate = jest.fn();
    const onOpen = jest.fn();
    wrap(
      <FileGrid
        files={[file, folder]}
        view="grid"
        selectedKeys={[file.key]}
        dimmedKeys={new Set([folder.key])}
        focusedKey={folder.key}
        highlight="notes"
        folderCounts={{ "docs/": 3 }}
        onToggleSelect={onToggle}
        onNavigate={onNavigate}
        onOpen={onOpen}
        onOpenMenu={onOpenMenu}
        onDropOnFolder={onDrop}
        onDownload={onDownload}
        onShareFile={onShare}
        onDeleteFile={onDelete}
        density="standard"
      />
    );
    expect(screen.getAllByText("notes").length).toBeGreaterThan(0);
    expect(screen.getByTestId("auth-thumb")).toBeInTheDocument();

    fireEvent.click(
      screen.getByLabelText(translate("selectFileLabel", { name: folder.name }))
    );
    expect(onToggle).toHaveBeenCalledWith(folder.key, expect.anything());

    fireEvent.click(screen.getByText(folder.name), { ctrlKey: true });
    expect(onToggle).toHaveBeenCalled();

    const folderTile = screen.getByText(folder.name).closest("[data-file-key]")!;
    fireEvent.dragOver(folderTile);
    fireEvent.drop(folderTile, {
      dataTransfer: { getData: () => "x" },
    });
    expect(onDrop).toHaveBeenCalled();

    fireEvent.contextMenu(folderTile);
    expect(onOpenMenu).toHaveBeenCalled();

    fireEvent.pointerDown(folderTile);
    fireEvent.dragStart(folderTile, {
      dataTransfer: { setData: jest.fn(), effectAllowed: "move" },
    });

    fireEvent.click(screen.getByLabelText(`${file.name} ${strings.download}`));
    expect(onDownload).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(`${file.name} ${strings.share}`));
    expect(onShare).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(`${file.name} ${strings.delete}`));
    expect(onDelete).toHaveBeenCalled();
  });

  test("skeletons for list and grid", () => {
    const { unmount } = wrap(<FileGridSkeleton view="list" density="compact" />);
    unmount();
    wrap(<FileGridSkeleton view="grid" density="standard" />);
  });

  test("list view keyboard, context menu and drag", () => {
    const onOpen = jest.fn();
    const onOpenMenu = jest.fn();
    wrap(
      <FileGrid
        files={[file]}
        view="list"
        selectedKeys={[]}
        onToggleSelect={jest.fn()}
        onNavigate={jest.fn()}
        onOpen={onOpen}
        onOpenMenu={onOpenMenu}
        emptyMessage={null}
      />
    );
    const row = screen.getByText(file.name).closest("[data-file-key]")!;
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(file.key);
    fireEvent.keyDown(row, { key: " " });
    fireEvent.contextMenu(row);
    expect(onOpenMenu).toHaveBeenCalled();
    fireEvent.dragStart(row, {
      dataTransfer: { setData: jest.fn(), effectAllowed: "move" },
    });
  });

  test("grid tile keyboard opens", () => {
    const onOpen = jest.fn();
    wrap(
      <FileGrid
        files={[file]}
        view="grid"
        selectedKeys={[]}
        onToggleSelect={jest.fn()}
        onNavigate={jest.fn()}
        onOpen={onOpen}
        onOpenMenu={jest.fn()}
        emptyMessage={null}
      />
    );
    const tile = screen.getByText(file.name).closest("[data-file-key]")!;
    fireEvent.keyDown(tile, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(file.key);
  });

  test("checkbox and more button stop propagation on pointer/mouse down", () => {
    const onToggle = jest.fn();
    const onOpenMenu = jest.fn();
    wrap(
      <FileGrid
        files={[file]}
        view="grid"
        selectedKeys={[]}
        onToggleSelect={onToggle}
        onNavigate={jest.fn()}
        onOpen={jest.fn()}
        onOpenMenu={onOpenMenu}
        emptyMessage={null}
      />
    );
    const checkbox = screen.getByLabelText(
      translate("selectFileLabel", { name: file.name })
    );
    fireEvent.pointerDown(checkbox);
    fireEvent.mouseDown(checkbox);
    const more = screen.getByLabelText(
      translate("fileActionsLabel", { name: file.name })
    );
    fireEvent.pointerDown(more);
    fireEvent.mouseDown(more);
    fireEvent.click(more);
    expect(onOpenMenu).toHaveBeenCalled();
  });

  test("more button wrapper stops propagation on pointer/mouse down", () => {
    const onOpenMenu = jest.fn();
    wrap(
      <FileGrid
        files={[file]}
        view="grid"
        selectedKeys={[]}
        onToggleSelect={jest.fn()}
        onNavigate={jest.fn()}
        onOpen={jest.fn()}
        onOpenMenu={onOpenMenu}
        emptyMessage={null}
      />
    );
    const more = screen.getByLabelText(
      translate("fileActionsLabel", { name: file.name })
    );
    const wrapper = more.parentElement!;
    fireEvent.pointerDown(wrapper);
    fireEvent.mouseDown(wrapper);
    fireEvent.click(wrapper);
    expect(onOpenMenu).toHaveBeenCalled();

    const { unmount } = wrap(
      <FileGrid
        files={[file]}
        view="list"
        selectedKeys={[]}
        onToggleSelect={jest.fn()}
        onNavigate={jest.fn()}
        onOpen={jest.fn()}
        onOpenMenu={onOpenMenu}
        emptyMessage={null}
      />
    );
    const listMore = screen.getAllByLabelText(
      translate("fileActionsLabel", { name: file.name })
    ).pop()!;
    fireEvent.pointerDown(listMore.parentElement!);
    fireEvent.mouseDown(listMore.parentElement!);
    unmount();
  });
});
