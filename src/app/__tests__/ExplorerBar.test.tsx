import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import ExplorerBar from "../../ExplorerBar";
import { DEFAULT_FEATURE_FLAGS, useFeatures } from "../features";
import { setLang, strings } from "../strings";

jest.mock("../features", () => {
  const actual = jest.requireActual("../features");
  return { ...actual, useFeatures: jest.fn() };
});

const mockUseFeatures = useFeatures as unknown as jest.Mock;

function renderBar(overrides: Partial<React.ComponentProps<typeof ExplorerBar>> = {}) {
  const props = {
    section: "folder" as const,
    onSectionChange: jest.fn(),
    onUploadFile: jest.fn(),
    onUploadFolder: jest.fn(),
    onCreateFolder: jest.fn(),
    onOpenTextPad: jest.fn(),
    onPaste: jest.fn(),
    canPaste: false,
    clipboardCount: 0,
    clipboardMode: null as "copy" | "cut" | null,
    view: "grid" as const,
    onViewChange: jest.fn(),
    sort: { field: "name" as const, order: "asc" as const },
    onSortChange: jest.fn(),
    onOpenWebDav: jest.fn(),
    onOpenApi: jest.fn(),
    typeFilter: "all" as const,
    onTypeFilterChange: jest.fn(),
    showHidden: false,
    onShowHiddenChange: jest.fn(),
    density: "standard" as const,
    onDensityChange: jest.fn(),
    recents: [] as { key: string; name: string; isDir: boolean }[],
    onOpenRecent: jest.fn(),
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
    updateFlags: jest.fn(),
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
});
