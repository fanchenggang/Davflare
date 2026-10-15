import { vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import PublishPodcastDialog from "../../PublishPodcastDialog";
import { fetchPath } from "../transfer";
import { publishPodcastSite } from "../sites";
import { setLang } from "../strings";

vi.mock("../transfer", () => ({
  fetchPath: vi.fn(),
}));

vi.mock("../sites", async () => {
  const actual = await vi.importActual<typeof import("../sites")>("../sites");
  return {
    ...actual,
    publishPodcastSite: vi.fn(),
    checkSiteSlug: vi.fn().mockResolvedValue({
      slug: "show",
      exists: false,
      kind: null,
      source: null,
    }),
  };
});

const mockFetch = fetchPath as unknown as ReturnType<typeof vi.fn>;
const mockPublish = publishPodcastSite as unknown as ReturnType<typeof vi.fn>;

describe("PublishPodcastDialog", () => {
  beforeEach(() => {
    setLang("en");
    mockFetch.mockReset();
    mockPublish.mockReset();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  test("loads media, publishes, shows feed URL", async () => {
    mockFetch.mockResolvedValue([
      {
        key: "shows/ep1.mp3",
        name: "ep1.mp3",
        isDir: false,
        size: 10,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "audio/mpeg",
      },
      {
        key: "shows/note.txt",
        name: "note.txt",
        isDir: false,
        size: 1,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "text/plain",
      },
    ]);
    mockPublish.mockResolvedValue({
      slug: "show",
      kind: "podcast",
      copied: 1,
      sitesHost: "sites.example.com",
      feed: "feed.xml",
    });
    const onNotify = vi.fn();
    render(
      <PublishPodcastDialog
        open
        folder={{
          key: "shows",
          name: "shows",
          isDir: true,
          size: 0,
          uploaded: "2026-01-01T00:00:00.000Z",
          contentType: "application/x-directory",
        }}
        onClose={vi.fn()}
        onNotify={onNotify}
      />
    );
    const submit = await screen.findByRole("button", { name: /Publish|发布/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(mockPublish).toHaveBeenCalled());
    const args = mockPublish.mock.calls[0];
    expect(args[1]).toEqual(["shows/ep1.mp3"]);
    expect(await screen.findByTestId("podcast-feed-url")).toHaveValue(
      "https://sites.example.com/show/feed.xml"
    );
  });
});
