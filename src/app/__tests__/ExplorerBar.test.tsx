import { vi, type Mock } from "vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import ExplorerBar from "../../ExplorerBar";
import { DEFAULT_FEATURE_FLAGS, useFeatures } from "../features";
import { setLang, strings } from "../strings";

vi.mock("../features", async () => {
  const actual = await vi.importActual("../features");
  return { ...actual, useFeatures: vi.fn() };
});

const mockUseFeatures = useFeatures as unknown as Mock;

function renderBar(overrides: Partial<React.ComponentProps<typeof ExplorerBar>> = {}) {
  const props = {
    section: "folder" as const,
    onSectionChange: vi.fn(),
    onUploadFile: vi.fn(),
    onUploadFolder: vi.fn(),
    onCreateFolder: vi.fn(),
    onOpenTextPad: vi.fn(),
    onPaste: vi.fn(),
    canPaste: false,
    clipboardCount: 0,
    clipboardMode: null as "copy" | "cut" | null,
    view: "grid" as const,
    onViewChange: vi.fn(),
    sort: { field: "name" as const, order: "asc" as const },
    onSortChange: vi.fn(),
    onOpenWebDav: vi.fn(),
    onOpenApi: vi.fn(),
    typeFilter: "all" as const,
    onTypeFilterChange: vi.fn(),
    showHidden: false,
    onShowHiddenChange: vi.fn(),
    density: "standard" as const,
    onDensityChange: vi.fn(),
    recents: [] as { key: string; name: string; isDir: boolean; at: number }[],
    onOpenRecent: vi.fn(),
    ...overrides,
  };
  const result = render(<ExplorerBar {...props} />);
  return { ...result, props };
}

beforeEach(() => {
  setLang("zh");
  mockUseFeatures.mockReset();
  mockUseFeatures.mockReturnValue({
    flags: DEFAULT_FEATURE_FLAGS,
    sitesHost: null,
    updateFlags: vi.fn(),
  });
});

describe("ExplorerBar", () => {
  test("renders folder tools and switches section", () => {
    const { props } = renderBar();
    expect(screen.getByLabelText(strings.uploadFile)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(strings.shares));
    expect(props.onSectionChange).toHaveBeenCalledWith("shares");
  });

  test("upload file click", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByLabelText(strings.uploadFile));
    expect(props.onUploadFile).toHaveBeenCalled();
  });

  test("create folder click", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByText(strings.createFolder));
    expect(props.onCreateFolder).toHaveBeenCalled();
  });

  test("type filter chip", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByText(strings.typeImage));
    expect(props.onTypeFilterChange).toHaveBeenCalledWith("image");
  });

  test("upload folder from upload dropdown", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByLabelText(strings.moreUploadWays));
    fireEvent.click(screen.getByText(strings.uploadFolder));
    expect(props.onUploadFolder).toHaveBeenCalled();
  });

  test("open notepad and webdav/api/recent actions", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByText(strings.openTextPad));
    expect(props.onOpenTextPad).toHaveBeenCalled();
    fireEvent.click(screen.getByText(strings.webdav));
    expect(props.onOpenWebDav).toHaveBeenCalled();
    fireEvent.click(screen.getByText(strings.api));
    expect(props.onOpenApi).toHaveBeenCalled();
    fireEvent.click(screen.getByText(strings.recent));
    expect(screen.getByText(strings.noRecent)).toBeInTheDocument();
  });

  test("recent menu opens an entry", () => {
    const { props } = renderBar({
      recents: [
        { key: "docs/", name: "docs", isDir: true, at: 1 },
        { key: "a.txt", name: "a.txt", isDir: false, at: 2 },
      ],
      onOpenRecent: vi.fn(),
    });
    fireEvent.click(screen.getByText(strings.recent));
    fireEvent.click(screen.getByText(/^docs/));
    expect(props.onOpenRecent).toHaveBeenCalledWith(
      expect.objectContaining({ key: "docs/", name: "docs", isDir: true })
    );
  });

  test("paste button and clipboard caption", () => {
    const { props } = renderBar({ canPaste: true, clipboardCount: 2 });
    fireEvent.click(screen.getByText(/^粘贴/));
    expect(props.onPaste).toHaveBeenCalled();
  });

  test("clipboard caption shown when clipboard is active but paste disabled", () => {
    renderBar({
      canPaste: false,
      clipboardCount: 3,
      clipboardMode: "copy",
    });
    expect(screen.getByText(/已复制/)).toBeInTheDocument();
  });

  test("view, density and sort controls", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByLabelText(strings.switchView));
    expect(props.onViewChange).toHaveBeenCalledWith("list");
    fireEvent.click(screen.getByLabelText(strings.density));
    expect(props.onDensityChange).toHaveBeenCalledWith("compact");

    fireEvent.click(screen.getByLabelText(strings.sort));
    fireEvent.click(screen.getByText(/按名称排序/));
    expect(props.onSortChange).toHaveBeenCalledWith({
      field: "name",
      order: "desc",
    });

    fireEvent.click(screen.getByLabelText(strings.sort));
    fireEvent.click(screen.getByText(strings.toggleAscDesc));
    expect(props.onSortChange).toHaveBeenCalledWith(expect.objectContaining({ field: "name" }));
  });

  test("hidden files switch", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByLabelText(strings.showHidden));
    expect(props.onShowHiddenChange).toHaveBeenCalledWith(true);
  });

  test("hides folder controls outside folder", () => {
    renderBar({ section: "trash" });
    expect(screen.queryByText(strings.createFolder)).not.toBeInTheDocument();
  });

  test("switches to trash, sites and images sections", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByLabelText(strings.trash));
    expect(props.onSectionChange).toHaveBeenCalledWith("trash");
    fireEvent.click(screen.getByLabelText(strings.sitesSection));
    expect(props.onSectionChange).toHaveBeenCalledWith("sites");
    fireEvent.click(screen.getByLabelText(strings.imagesSection));
    expect(props.onSectionChange).toHaveBeenCalledWith("images");
  });

  test("upload menu file and sort by size/date", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByLabelText(strings.moreUploadWays));
    fireEvent.click(screen.getAllByText(strings.uploadFile).pop()!);
    expect(props.onUploadFile).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(strings.sort));
    fireEvent.click(screen.getByText(/按大小排序/));
    expect(props.onSortChange).toHaveBeenCalledWith({ field: "size", order: "asc" });

    fireEvent.click(screen.getByLabelText(strings.sort));
    fireEvent.click(screen.getByText(/按日期排序/));
    expect(props.onSortChange).toHaveBeenCalledWith({ field: "date", order: "asc" });
  });
});
