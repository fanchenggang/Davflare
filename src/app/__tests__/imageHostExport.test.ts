import { afterEach, describe, expect, test, vi } from "vitest";

import {
  IMAGE_HOST_API_KEY_PLACEHOLDER,
  buildShareXSxcu,
  buildShareXSxcuJson,
  buildTyporaCurl,
  downloadTextFile,
  imageHostExportContainsRawKey,
  imagesApiUrl,
  normalizeDriveOrigin,
  shareXFilename,
} from "../imageHostExport";

describe("imageHostExport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("normalizes origin and builds /api/images", () => {
    expect(normalizeDriveOrigin("https://drive.example.com/")).toBe(
      "https://drive.example.com"
    );
    expect(normalizeDriveOrigin("drive.example.com")).toBe(
      "https://drive.example.com"
    );
    expect(imagesApiUrl("https://drive.example.com/")).toBe(
      "https://drive.example.com/api/images"
    );
  });

  test("ShareX sxcu uses Binary body, placeholders, never a live key", () => {
    const sxcu = buildShareXSxcu("https://drive.example.com/");
    expect(sxcu.RequestURL).toBe("https://drive.example.com/api/images");
    expect(sxcu.Body).toBe("Binary");
    expect(sxcu.URL).toBe("{json:url}");
    expect(sxcu.Headers.Authorization).toBe(
      `Bearer ${IMAGE_HOST_API_KEY_PLACEHOLDER}`
    );
    expect(sxcu.Headers["X-Api-Key"]).toBe(IMAGE_HOST_API_KEY_PLACEHOLDER);
    expect(sxcu.Headers["X-File-Name"]).toBe("{filename}");
    const json = buildShareXSxcuJson("https://drive.example.com");
    expect(imageHostExportContainsRawKey(json)).toBe(false);
    expect(json).not.toMatch(/\bfd_/);
    expect(shareXFilename()).toBe("davflare.sxcu");
  });

  test("Typora curl is one line with $1 and sed url extract", () => {
    const line = buildTyporaCurl("https://drive.example.com");
    expect(line).toContain("https://drive.example.com/api/images");
    expect(line).toContain(IMAGE_HOST_API_KEY_PLACEHOLDER);
    expect(line).toContain("--data-binary");
    expect(line).toContain("$1");
    expect(line).toContain("sed");
    expect(imageHostExportContainsRawKey(line)).toBe(false);
  });

  test("imageHostExportContainsRawKey detects fd_ keys", () => {
    expect(
      imageHostExportContainsRawKey(`Bearer ${IMAGE_HOST_API_KEY_PLACEHOLDER}`)
    ).toBe(false);
    expect(
      imageHostExportContainsRawKey("Bearer fd_abcdefghijklmnop")
    ).toBe(true);
  });

  test("downloadTextFile creates an object URL and clicks a download anchor", () => {
    const createObjectURL = vi.fn(() => "blob:sxcu");
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    const click = vi.fn();
    const createElement = vi
      .spyOn(document, "createElement")
      .mockReturnValue({
        href: "",
        download: "",
        rel: "",
        click,
      } as unknown as HTMLAnchorElement);

    downloadTextFile("davflare.sxcu", '{"Name":"Davflare"}\n');
    expect(createObjectURL).toHaveBeenCalled();
    expect(createElement).toHaveBeenCalledWith("a");
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sxcu");
  });
});
