import { afterEach, describe, expect, test, vi } from "vitest";

import {
  MOBILE_UPLOAD_API_KEY_PLACEHOLDER,
  MOBILE_UPLOAD_DEFAULT_PATH,
  androidRecipeFilename,
  buildAndroidHttpShortcutRecipe,
  buildAndroidHttpShortcutRecipeJson,
  buildMobileImagesCurl,
  buildMobileUploadCurl,
  buildMobileUploadValuesBlock,
  downloadTextFile,
  mobileUploadContainsRawKey,
  normalizeUploadFolderPath,
  uploadApiUrl,
} from "../mobileUpload";

describe("mobileUpload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("normalizes folder path and builds /api/upload", () => {
    expect(normalizeUploadFolderPath("mobile")).toBe("mobile/");
    expect(normalizeUploadFolderPath("/photos/inbox/")).toBe("photos/inbox/");
    expect(normalizeUploadFolderPath("")).toBe("");
    expect(normalizeUploadFolderPath("_$flaredrive$/x")).toBe("");
    expect(uploadApiUrl("https://drive.example.com/", "mobile")).toBe(
      "https://drive.example.com/api/upload?path=mobile%2F"
    );
    expect(uploadApiUrl("https://drive.example.com/", "")).toBe(
      "https://drive.example.com/api/upload"
    );
    expect(MOBILE_UPLOAD_DEFAULT_PATH).toBe("mobile/");
  });

  test("upload curl uses placeholders and never a live key", () => {
    const line = buildMobileUploadCurl("https://drive.example.com", "mobile/");
    expect(line).toContain(
      "https://drive.example.com/api/upload?path=mobile%2F"
    );
    expect(line).toContain(MOBILE_UPLOAD_API_KEY_PLACEHOLDER);
    expect(line).toContain("--data-binary");
    expect(line).toContain("X-File-Name");
    expect(mobileUploadContainsRawKey(line)).toBe(false);
  });

  test("images curl hits /api/images", () => {
    const line = buildMobileImagesCurl("https://drive.example.com");
    expect(line).toContain("https://drive.example.com/api/images");
    expect(line).toContain(MOBILE_UPLOAD_API_KEY_PLACEHOLDER);
    expect(mobileUploadContainsRawKey(line)).toBe(false);
  });

  test("Android recipe JSON is documented fields with placeholders", () => {
    const recipe = buildAndroidHttpShortcutRecipe(
      "https://drive.example.com",
      "mobile/",
      "upload"
    );
    expect(recipe.method).toBe("POST");
    expect(recipe.url).toContain("/api/upload?path=mobile%2F");
    expect(recipe.headers.Authorization).toBe(
      `Bearer ${MOBILE_UPLOAD_API_KEY_PLACEHOLDER}`
    );
    const json = buildAndroidHttpShortcutRecipeJson(
      "https://drive.example.com",
      "mobile/",
      "images"
    );
    expect(json).toContain("/api/images");
    expect(mobileUploadContainsRawKey(json)).toBe(false);
    expect(androidRecipeFilename("upload")).toBe(
      "davflare-android-upload.json"
    );
    expect(androidRecipeFilename("images")).toBe(
      "davflare-android-images.json"
    );
  });

  test("values block lists origin, URLs, and auth headers", () => {
    const block = buildMobileUploadValuesBlock(
      "https://drive.example.com/",
      "mobile/"
    );
    expect(block).toContain("https://drive.example.com");
    expect(block).toContain("/api/upload?path=mobile%2F");
    expect(block).toContain("/api/images");
    expect(block).toContain(MOBILE_UPLOAD_API_KEY_PLACEHOLDER);
    expect(mobileUploadContainsRawKey(block)).toBe(false);
  });


  test("mobileUploadContainsRawKey detects non-placeholder Bearer tokens", () => {
    expect(
      mobileUploadContainsRawKey("Authorization: Bearer not-a-placeholder-key")
    ).toBe(true);
    expect(mobileUploadContainsRawKey("Authorization: Bearer ${ENV}")).toBe(
      false
    );
  });

  test("mobileUploadContainsRawKey detects fd_ keys", () => {
    expect(
      mobileUploadContainsRawKey(`Bearer ${MOBILE_UPLOAD_API_KEY_PLACEHOLDER}`)
    ).toBe(false);
    expect(
      mobileUploadContainsRawKey("Bearer fd_abcdefghijklmnop")
    ).toBe(true);
  });

  test("downloadTextFile creates an object URL and clicks a download anchor", () => {
    const createObjectURL = vi.fn(() => "blob:mobile");
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    const click = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      rel: "",
      click,
    } as unknown as HTMLAnchorElement);

    downloadTextFile("davflare-android-upload.json", '{"name":"Davflare"}\n');
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mobile");
  });
});
