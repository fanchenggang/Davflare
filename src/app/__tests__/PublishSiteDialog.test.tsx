import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import PublishSiteDialog from "../../PublishSiteDialog";
import { publishSite, siteUrl } from "../sites";
import { strings } from "../strings";
import { FileItem } from "../types";

vi.mock("../sites", async () => {
  const actual = await vi.importActual<typeof import("../sites")>("../sites");
  return {
    ...actual,
    publishSite: vi.fn(),
  };
});

const folder: FileItem = {
  key: "My Blog",
  name: "My Blog",
  isDir: true,
  size: 0,
  uploaded: "",
  contentType: "application/x-directory",
};

describe("PublishSiteDialog", () => {
  beforeEach(() => {
    vi.mocked(publishSite).mockReset();
  });

  test("defaults slug from folder name and publishes", async () => {
    vi.mocked(publishSite).mockResolvedValue({
      slug: "my-blog",
      source: "My Blog",
      copied: 3,
      sitesHost: "sites.example.com",
    });
    const onNotify = vi.fn();
    render(
      <PublishSiteDialog open folder={folder} onClose={vi.fn()} onNotify={onNotify} />
    );
    const slugInput = screen.getByLabelText(strings.publishSiteSlug) as HTMLInputElement;
    expect(slugInput.value).toBe("my-blog");
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    await waitFor(() =>
      expect(publishSite).toHaveBeenCalledWith("My Blog", "my-blog")
    );
    const expected = siteUrl("sites.example.com", "my-blog")!;
    await waitFor(() =>
      expect(screen.getByDisplayValue(expected)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: strings.publishSiteCopyUrl })).toBeInTheDocument();
  });

  test("shows host-missing message when sitesHost is null", async () => {
    vi.mocked(publishSite).mockResolvedValue({
      slug: "my-blog",
      source: "My Blog",
      copied: 1,
      sitesHost: null,
    });
    const onNotify = vi.fn();
    render(
      <PublishSiteDialog open folder={folder} onClose={vi.fn()} onNotify={onNotify} />
    );
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(expect.stringContaining("my-blog"), "info")
    );
  });

  test("rejects bad slug and surfaces publish errors", async () => {
    const onNotify = vi.fn();
    render(
      <PublishSiteDialog open folder={folder} onClose={vi.fn()} onNotify={onNotify} />
    );
    fireEvent.change(screen.getByLabelText(strings.publishSiteSlug), {
      target: { value: "has_underscore" },
    });
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    expect(publishSite).not.toHaveBeenCalled();
    expect(screen.getByText(strings.publishSiteBadSlug)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(strings.publishSiteSlug), {
      target: { value: "ok-slug" },
    });
    vi.mocked(publishSite).mockRejectedValue(new Error("boom"));
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
  });

  test("copy URL notifies success", async () => {
    vi.mocked(publishSite).mockResolvedValue({
      slug: "my-blog",
      source: "My Blog",
      copied: 1,
      sitesHost: "sites.example.com",
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onNotify = vi.fn();
    render(
      <PublishSiteDialog open folder={folder} onClose={vi.fn()} onNotify={onNotify} />
    );
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: strings.publishSiteCopyUrl })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteCopyUrl }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(onNotify).toHaveBeenCalledWith(strings.linkCopied, "success");
  });
});
