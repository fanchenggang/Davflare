import { vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import PublishDownloadsDialog from "../../PublishDownloadsDialog";
import { fetchPath } from "../transfer";
import { publishDownloadsSite } from "../sites";
import { setLang } from "../strings";

vi.mock("../transfer", () => ({
  fetchPath: vi.fn(),
}));

vi.mock("../sites", async () => {
  const actual = await vi.importActual<typeof import("../sites")>("../sites");
  return {
    ...actual,
    publishDownloadsSite: vi.fn(),
    checkSiteSlug: vi.fn().mockResolvedValue({
      slug: "rel",
      exists: false,
      kind: null,
      source: null,
    }),
  };
});

const mockFetch = fetchPath as unknown as ReturnType<typeof vi.fn>;
const mockPublish = publishDownloadsSite as unknown as ReturnType<typeof vi.fn>;

const folder = {
  key: "rel",
  name: "rel",
  isDir: true,
  size: 0,
  uploaded: "2026-01-01T00:00:00.000Z",
  contentType: "application/x-directory",
};

describe("PublishDownloadsDialog", () => {
  beforeEach(() => {
    setLang("en");
    mockFetch.mockReset();
    mockPublish.mockReset();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  test("loads assets, publishes, shows page URL and copies", async () => {
    mockFetch.mockResolvedValue([
      {
        key: "rel/app.zip",
        name: "app.zip",
        isDir: false,
        size: 10,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "application/zip",
      },
      {
        key: "rel/README.md",
        name: "README.md",
        isDir: false,
        size: 20,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "text/markdown",
      },
    ]);
    mockPublish.mockResolvedValue({
      slug: "rel",
      kind: "downloads",
      copied: 1,
      sitesHost: "sites.example.com",
    });
    const onNotify = vi.fn();
    render(
      <PublishDownloadsDialog open folder={folder} onClose={vi.fn()} onNotify={onNotify} />
    );
    const submit = await screen.findByRole("button", { name: /Publish|发布/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(mockPublish).toHaveBeenCalled());
    expect(mockPublish.mock.calls[0][0]).toBe("rel");
    expect(mockPublish.mock.calls[0][1]).toEqual(["rel/app.zip"]);
    expect(mockPublish.mock.calls[0][2]).toMatchObject({
      readmeKey: "rel/README.md",
    });
    const urlField = await screen.findByTestId("downloads-page-url");
    expect(urlField).toHaveValue(`${window.location.protocol}//sites.example.com/rel/`);
  });
});
