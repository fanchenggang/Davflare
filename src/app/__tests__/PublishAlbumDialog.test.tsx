import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import PublishAlbumDialog from "../../PublishAlbumDialog";
import { ALBUM_MAX_IMAGES, publishAlbumSite, siteUrl } from "../sites";
import { getLang, strings, translate } from "../strings";
import { FileItem } from "../types";

vi.mock("../sites", async () => {
  const actual = await vi.importActual<typeof import("../sites")>("../sites");
  return {
    ...actual,
    publishAlbumSite: vi.fn(),
  };
});

function image(name: string, size = 1024): FileItem {
  return {
    key: `pics/${name}`,
    name,
    isDir: false,
    size,
    uploaded: "",
    contentType: "image/jpeg",
  };
}

describe("PublishAlbumDialog", () => {
  beforeEach(() => {
    vi.mocked(publishAlbumSite).mockReset();
  });

  test("shows copy count and size, then copies the site link", async () => {
    vi.mocked(publishAlbumSite).mockResolvedValue({
      slug: "cover",
      kind: "album",
      copied: 2,
      bytes: 2048,
      sitesHost: "sites.example.com",
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onNotify = vi.fn();
    render(
      <PublishAlbumDialog
        open
        images={[image("cover.jpg", 1500), image("b.png", 500)]}
        ignoredCount={1}
        onClose={vi.fn()}
        onNotify={onNotify}
      />
    );
    expect(screen.getByLabelText(strings.publishSiteSlug)).toHaveValue("cover");
    expect(screen.getByText(/2/)).toBeInTheDocument();
    expect(screen.getByText(strings.publishAlbumIgnored.replace("{count}", "1"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    await waitFor(() =>
      expect(publishAlbumSite).toHaveBeenCalledWith("cover", ["pics/cover.jpg", "pics/b.png"], {
        lang: getLang(),
        title: strings.siteAlbumHeading,
      })
    );
    const expected = siteUrl("sites.example.com", "cover")!;
    await waitFor(() => expect(screen.getByDisplayValue(expected)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteCopyUrl }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expected));
    expect(onNotify).toHaveBeenCalledWith(strings.linkCopied, "success");
  });

  test("does not publish when the selection exceeds the image cap", () => {
    const images = Array.from({ length: ALBUM_MAX_IMAGES + 1 }, (_, i) => image(`${i}.jpg`, 10));
    render(
      <PublishAlbumDialog open images={images} ignoredCount={0} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: strings.publishSiteSubmit })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      translate("publishAlbumTooMany", {
        count: ALBUM_MAX_IMAGES + 1,
        max: ALBUM_MAX_IMAGES,
      })
    );
    expect(publishAlbumSite).not.toHaveBeenCalled();
  });

  test("rejects a bad slug and surfaces publish errors", async () => {
    const onNotify = vi.fn();
    render(
      <PublishAlbumDialog
        open
        images={[image("a.jpg")]}
        ignoredCount={0}
        onClose={vi.fn()}
        onNotify={onNotify}
      />
    );
    fireEvent.change(screen.getByLabelText(strings.publishSiteSlug), {
      target: { value: "has_underscore" },
    });
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    expect(publishAlbumSite).not.toHaveBeenCalled();
    expect(screen.getByText(strings.publishSiteBadSlug)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(strings.publishSiteSlug), {
      target: { value: "ok-slug" },
    });
    vi.mocked(publishAlbumSite).mockRejectedValue(new Error("boom"));
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
  });
});

  test("shows no-host tip when SITES_HOST is missing", async () => {
    vi.mocked(publishAlbumSite).mockResolvedValue({
      slug: "cover",
      kind: "album",
      copied: 1,
      bytes: 10,
      sitesHost: null,
    });
    const onNotify = vi.fn();
    render(
      <PublishAlbumDialog
        open
        images={[image("cover.jpg")]}
        ignoredCount={0}
        onClose={vi.fn()}
        onNotify={onNotify}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    await waitFor(() =>
      expect(screen.getByText(translate("publishSiteNoHost", { slug: "cover" }))).toBeInTheDocument()
    );
    expect(onNotify).toHaveBeenCalledWith(translate("publishSiteNoHost", { slug: "cover" }), "info");
  });

  test("clipboard failure uses publishAlbumFailed notify", async () => {
    vi.mocked(publishAlbumSite).mockResolvedValue({
      slug: "cover",
      kind: "album",
      copied: 1,
      bytes: 10,
      sitesHost: "sites.example.com",
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const onNotify = vi.fn();
    render(
      <PublishAlbumDialog
        open
        images={[image("cover.jpg")]}
        ignoredCount={0}
        onClose={vi.fn()}
        onNotify={onNotify}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: strings.publishSiteCopyUrl })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteCopyUrl }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("publishAlbumFailed"), "error")
    );
  });

