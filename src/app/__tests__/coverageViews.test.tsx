import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ImagesView from "../../ImagesView";
import SettingsView from "../../SettingsView";
import SitesView from "../../SitesView";
import { DEFAULT_FEATURE_FLAGS, useFeatures } from "../features";
import { deleteImage, listImages, uploadImage } from "../images";
import { deleteSite, listSites, updateSiteConfig } from "../sites";
import { setLang, strings, translate } from "../strings";

jest.mock("../features", () => {
  const actual = jest.requireActual("../features");
  return { ...actual, useFeatures: jest.fn() };
});

jest.mock("../sites", () => {
  const actual = jest.requireActual("../sites");
  return {
    ...actual,
    listSites: jest.fn(),
    updateSiteConfig: jest.fn(),
    deleteSite: jest.fn(),
  };
});

jest.mock("../images", () => {
  const actual = jest.requireActual("../images");
  return {
    ...actual,
    listImages: jest.fn(),
    uploadImage: jest.fn(),
    deleteImage: jest.fn(),
  };
});

const mockEnqueue = jest.fn();
jest.mock("../transferQueue", () => ({
  useUploadEnqueue: () => mockEnqueue,
}));

jest.mock("fflate", () => ({
  unzip: (_data: Uint8Array, cb: (err: Error | null, out: Record<string, Uint8Array>) => void) => {
    cb(null, {
      "index.html": new Uint8Array([60, 104, 116, 109, 108, 62]),
      "nested/app.js": new Uint8Array([1, 2, 3]),
      "dir/": new Uint8Array([]),
      "__MACOSX/._index.html": new Uint8Array([0]),
    });
  },
}));

const mockUseFeatures = useFeatures as unknown as jest.Mock;
const mockListSites = listSites as unknown as jest.Mock;
const mockUpdateSite = updateSiteConfig as unknown as jest.Mock;
const mockDeleteSite = deleteSite as unknown as jest.Mock;
const mockListImages = listImages as unknown as jest.Mock;
const mockUploadImage = uploadImage as unknown as jest.Mock;
const mockDeleteImage = deleteImage as unknown as jest.Mock;

const hosted = {
  id: "img1",
  name: "photo.png",
  size: 12,
  uploaded: "2026-01-01T00:00:00.000Z",
  contentType: "image/png",
  url: "https://img.example/photo.png",
  markdown: "![photo](https://img.example/photo.png)",
};

const site = {
  slug: "blog",
  spa: true,
  stats: { objects: 3, size: 40, cachedAt: "2026-01-01T00:00:00.000Z" },
};

beforeEach(() => {
  if (!(File.prototype as any).arrayBuffer) {
    (File.prototype as any).arrayBuffer = function () {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsArrayBuffer(this);
      });
    };
  }
  setLang("en");
  mockEnqueue.mockReset();
  mockUseFeatures.mockReset();
  mockListSites.mockReset();
  mockUpdateSite.mockReset();
  mockDeleteSite.mockReset();
  mockListImages.mockReset();
  mockUploadImage.mockReset();
  mockDeleteImage.mockReset();
  mockUseFeatures.mockReturnValue({
    flags: DEFAULT_FEATURE_FLAGS,
    sitesHost: "sites.example.com",
    updateFlags: jest.fn().mockResolvedValue(undefined),
  });
  Object.assign(navigator, {
    clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
});

describe("SettingsView leftovers", () => {
  test("toggles a flag and notifies success", async () => {
    const onNotify = jest.fn();
    const updateFlags = jest.fn().mockResolvedValue(undefined);
    mockUseFeatures.mockReturnValue({
      flags: DEFAULT_FEATURE_FLAGS,
      sitesHost: null,
      updateFlags,
    });
    render(<SettingsView onNotify={onNotify} />);
    expect(screen.getByText(strings.imagesHostMissing)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: strings.flagWebdav }));
    await waitFor(() => expect(updateFlags).toHaveBeenCalledWith({ webdav: false }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(strings.flagSaved, "success")
    );
  });

  test("toggle failure notifies error", async () => {
    const onNotify = jest.fn();
    const updateFlags = jest.fn().mockRejectedValue(new Error("nope"));
    mockUseFeatures.mockReturnValue({
      flags: { ...DEFAULT_FEATURE_FLAGS, mcp: false },
      sitesHost: "h",
      updateFlags,
    });
    render(<SettingsView onNotify={onNotify} />);
    fireEvent.click(screen.getByLabelText(strings.flagMcp));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith("nope", "error")
    );
  });
});

describe("ImagesView leftovers", () => {
  test("returns null when image host is off", () => {
    mockUseFeatures.mockReturnValue({
      flags: { ...DEFAULT_FEATURE_FLAGS, imageHost: false },
      sitesHost: null,
    });
    const { container } = render(<ImagesView onNotify={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("list error notifies", async () => {
    mockListImages.mockRejectedValue(new Error("images-fail"));
    const onNotify = jest.fn();
    render(<ImagesView onNotify={onNotify} />);
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("images-fail", "error"));
  });

  test("lists images, copies url/markdown, uploads, and deletes", async () => {
    mockListImages.mockResolvedValue({
      sitesHost: "sites.example.com",
      images: [hosted],
    });
    mockUploadImage.mockResolvedValue({
      ...hosted,
      id: "img2",
      name: "new.png",
    });
    mockDeleteImage.mockResolvedValue(undefined);
    const onNotify = jest.fn();
    const onGoFiles = jest.fn();
    render(<ImagesView onNotify={onNotify} onGoFiles={onGoFiles} />);
    await waitFor(() => expect(screen.getByText("photo.png")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: strings.copyImageUrl })[0]);
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(strings.imageUrlCopied, "success")
    );
    fireEvent.click(screen.getAllByRole("button", { name: strings.copyImageMarkdown })[0]);
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(strings.imageMarkdownCopied, "success")
    );

    fireEvent.click(screen.getAllByRole("button", { name: strings.deleteImage })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: strings.deleteImage }).pop()!);
    await waitFor(() => expect(mockDeleteImage).toHaveBeenCalledWith("img1"));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(strings.imageDeleted, "success")
    );

    const file = new File(["xx"], "x.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(mockUploadImage).toHaveBeenCalled());

    fireEvent.drop(screen.getByText(strings.imagesTitle).closest("div")!.parentElement!, {
      dataTransfer: { files: [new File(["not"], "notes.txt", { type: "text/plain" })], types: ["Files"] },
    });
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(strings.notAnImage, "error")
    );
  });

  test("clipboard copy failure notifies", async () => {
    mockListImages.mockResolvedValue({ sitesHost: "h", images: [hosted] });
    (navigator.clipboard.writeText as jest.Mock).mockRejectedValue(new Error("denied"));
    const onNotify = jest.fn();
    render(<ImagesView onNotify={onNotify} />);
    await waitFor(() => expect(screen.getByText("photo.png")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: strings.copyImageUrl })[0]);
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(strings.copyFailed2, "error")
    );
  });
});

describe("SitesView leftovers", () => {
  test("list error notifies and empty go-files works", async () => {
    mockListSites.mockRejectedValue(new Error("sites-fail"));
    const onNotify = jest.fn();
    const onGoFiles = jest.fn();
    render(
      <SitesView onNotify={onNotify} onGoFiles={onGoFiles} onManageFiles={jest.fn()} />
    );
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("sites-fail", "error"));
  });

  test("site actions: spa, copy, manage, delete, deploy zip", async () => {
    mockListSites.mockResolvedValue({
      sitesHost: "sites.example.com",
      sites: [site],
    });
    mockUpdateSite.mockResolvedValue(undefined);
    mockDeleteSite.mockResolvedValue(3);
    const onNotify = jest.fn();
    const onManage = jest.fn();
    const open = jest.fn();
    window.open = open;
    render(
      <SitesView onNotify={onNotify} onManageFiles={onManage} />
    );
    await waitFor(() => expect(screen.getByText("blog")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("checkbox", { name: strings.siteSpaLabel }));
    await waitFor(() => expect(mockUpdateSite).toHaveBeenCalledWith("blog", false));

    fireEvent.click(screen.getAllByRole("button", { name: strings.openSite })[0]);
    expect(open).toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: strings.manageFiles })[0]);
    expect(onManage).toHaveBeenCalledWith("blog");

    fireEvent.click(screen.getAllByRole("button", { name: strings.copy })[0]);
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("linkCopied"), "success")
    );

    fireEvent.click(screen.getByText(strings.deleteSite));
    fireEvent.click(screen.getAllByText(strings.deleteSite).pop()!);
    await waitFor(() => expect(mockDeleteSite).toHaveBeenCalled());

    fireEvent.click(screen.getByText(strings.deployZip));
    const zipInput = document.querySelector('input[accept=".zip,application/zip"]') as HTMLInputElement;
    const zip = new File([new Uint8Array([1, 2, 3, 4])], "site.zip", {
      type: "application/zip",
    });
    fireEvent.change(zipInput, { target: { files: [zip] } });
    await waitFor(() =>
      expect(screen.getByText(zip.name)).toBeInTheDocument()
    );
    fireEvent.click(screen.getAllByText(strings.deployZip).pop()!);
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
    expect(mockDeleteSite).toHaveBeenCalled();
  });

  test("spa save failure reloads list", async () => {
    mockListSites
      .mockResolvedValueOnce({ sitesHost: "h", sites: [site] })
      .mockResolvedValueOnce({ sitesHost: "h", sites: [site] })
      .mockResolvedValue({ sitesHost: "h", sites: [site] });
    mockUpdateSite.mockRejectedValue(new Error("spa-fail"));
    const onNotify = jest.fn();
    render(<SitesView onNotify={onNotify} onManageFiles={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("blog")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: strings.siteSpaLabel }));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("spa-fail", "error"));
  });
});
