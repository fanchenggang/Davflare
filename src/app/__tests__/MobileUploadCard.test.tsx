import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import MobileUploadCard from "../../MobileUploadCard";
import { MOBILE_UPLOAD_API_KEY_PLACEHOLDER } from "../mobileUpload";
import { setLang, strings } from "../strings";

describe("MobileUploadCard", () => {
  beforeEach(() => {
    setLang("en");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders values, iOS steps, and Android recipe with placeholders", () => {
    render(
      <MobileUploadCard
        origin="https://drive.example.com"
        onNotify={vi.fn()}
      />
    );
    expect(screen.getByTestId("mobile-upload-card")).toBeInTheDocument();
    expect(screen.getByText(strings.mobileUploadTitle)).toBeInTheDocument();

    const values =
      screen.getByTestId("mobile-upload-values-preview").textContent || "";
    expect(values).toContain("https://drive.example.com/api/upload");
    expect(values).toContain(MOBILE_UPLOAD_API_KEY_PLACEHOLDER);
    expect(values).not.toMatch(/\bfd_/);

    const ios =
      screen.getByTestId("mobile-upload-ios-preview").textContent || "";
    expect(ios).toContain("https://drive.example.com/api/upload");
    expect(ios).toContain(MOBILE_UPLOAD_API_KEY_PLACEHOLDER);

    const android =
      screen.getByTestId("mobile-upload-android-preview").textContent || "";
    expect(android).toContain("HTTP Shortcuts");
    expect(android).toContain(MOBILE_UPLOAD_API_KEY_PLACEHOLDER);
    expect(android).not.toMatch(/\bfd_/);
  });

  test("path field updates upload URL preview", () => {
    render(
      <MobileUploadCard
        origin="https://drive.example.com"
        onNotify={vi.fn()}
      />
    );
    const input = screen.getByTestId("mobile-upload-path") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "inbox/photos" } });
    const values =
      screen.getByTestId("mobile-upload-values-preview").textContent || "";
    expect(values).toContain("path=inbox%2Fphotos%2F");
  });

  test("copy values writes clipboard and notifies", async () => {
    const onNotify = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <MobileUploadCard
        origin="https://drive.example.com"
        onNotify={onNotify}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: strings.mobileUploadCopyValues })
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    const pasted = writeText.mock.calls[0][0] as string;
    expect(pasted).toContain(MOBILE_UPLOAD_API_KEY_PLACEHOLDER);
    expect(onNotify).toHaveBeenCalledWith(
      strings.mobileUploadValuesCopied,
      "success"
    );
  });

  test("copy iOS steps notifies success", async () => {
    const onNotify = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <MobileUploadCard
        origin="https://drive.example.com"
        onNotify={onNotify}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: strings.mobileUploadCopyIos })
    );
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(onNotify).toHaveBeenCalledWith(
      strings.mobileUploadIosCopied,
      "success"
    );
  });

  test("copy upload URL, images URL, Android recipe, curls notify success", async () => {
    const onNotify = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <MobileUploadCard
        origin="https://drive.example.com"
        onNotify={onNotify}
      />
    );

    const clicks: Array<[string, string]> = [
      [strings.mobileUploadCopyUploadUrl, strings.mobileUploadUploadUrlCopied],
      [strings.mobileUploadCopyImagesUrl, strings.mobileUploadImagesUrlCopied],
      [strings.mobileUploadCopyAndroid, strings.mobileUploadAndroidCopied],
      [strings.mobileUploadCopyCurl, strings.mobileUploadCurlCopied],
      [strings.mobileUploadCopyImagesCurl, strings.mobileUploadImagesCurlCopied],
    ];
    for (const [label, ok] of clicks) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() => expect(onNotify).toHaveBeenCalledWith(ok, "success"));
    }
  });

  test("copy failure notifies error", async () => {
    const onNotify = vi.fn();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <MobileUploadCard
        origin="https://drive.example.com"
        onNotify={onNotify}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: strings.mobileUploadCopyCurl })
    );
    await waitFor(() => {
      expect(onNotify).toHaveBeenCalledWith(
        strings.mobileUploadCopyFailed,
        "error"
      );
    });
  });

  test("download Android JSON notifies success", () => {
    const onNotify = vi.fn();
    const createObjectURL = vi.fn(() => "blob:android");
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    const click = vi.fn();
    // Render first (needs real createElement), then stub only for the download click.
    render(
      <MobileUploadCard
        origin="https://drive.example.com"
        onNotify={onNotify}
      />
    );
    vi.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      rel: "",
      click,
    } as unknown as HTMLAnchorElement);
    fireEvent.click(
      screen.getByRole("button", { name: strings.mobileUploadDownloadAndroid })
    );
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith(
      strings.mobileUploadDownloaded,
      "success"
    );
  });
});
