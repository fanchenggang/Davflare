import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import ImageHostExportCard from "../../ImageHostExportCard";
import { IMAGE_HOST_API_KEY_PLACEHOLDER } from "../imageHostExport";
import { setLang, strings } from "../strings";

describe("ImageHostExportCard", () => {
  beforeEach(() => {
    setLang("en");
    vi.restoreAllMocks();
  });

  test("renders ShareX and Typora previews with placeholders", () => {
    render(
      <ImageHostExportCard
        origin="https://drive.example.com"
        onNotify={vi.fn()}
      />
    );
    expect(screen.getByTestId("image-host-export-card")).toBeInTheDocument();
    expect(screen.getByText(strings.imageHostExportTitle)).toBeInTheDocument();

    const sharex =
      screen.getByTestId("image-host-export-sharex-preview").textContent || "";
    expect(sharex).toContain("https://drive.example.com/api/images");
    expect(sharex).toContain(IMAGE_HOST_API_KEY_PLACEHOLDER);
    expect(sharex).not.toMatch(/\bfd_/);

    const typora =
      screen.getByTestId("image-host-export-typora-preview").textContent || "";
    expect(typora).toContain("curl");
    expect(typora).toContain(IMAGE_HOST_API_KEY_PLACEHOLDER);
    expect(typora).not.toMatch(/\bfd_/);
  });

  test("copy ShareX config writes clipboard and notifies", async () => {
    const onNotify = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <ImageHostExportCard
        origin="https://drive.example.com"
        onNotify={onNotify}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: strings.imageHostExportCopyShareX })
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    const pasted = writeText.mock.calls[0][0] as string;
    expect(pasted).toContain(IMAGE_HOST_API_KEY_PLACEHOLDER);
    expect(onNotify).toHaveBeenCalledWith(
      strings.imageHostExportShareXCopied,
      "success"
    );
  });
});
