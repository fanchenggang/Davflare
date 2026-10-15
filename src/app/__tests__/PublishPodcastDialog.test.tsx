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

const folder = {
  key: "shows",
  name: "shows",
  isDir: true,
  size: 0,
  uploaded: "2026-01-01T00:00:00.000Z",
  contentType: "application/x-directory",
};

describe("PublishPodcastDialog", () => {
  beforeEach(() => {
    setLang("en");
    mockFetch.mockReset();
    mockPublish.mockReset();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  test("loads media, publishes, shows feed URL and copies again", async () => {
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
      <PublishPodcastDialog open folder={folder} onClose={vi.fn()} onNotify={onNotify} />
    );
    const submit = await screen.findByRole("button", { name: /Publish|发布/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(mockPublish).toHaveBeenCalled());
    expect(mockPublish.mock.calls[0][1]).toEqual(["shows/ep1.mp3"]);
    expect(await screen.findByTestId("podcast-feed-url")).toHaveValue(
      "https://sites.example.com/show/feed.xml"
    );
    fireEvent.click(screen.getByRole("button", { name: /Copy feed|复制 feed/i }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/copied|已复制/i), "success")
    );
  });

  test("blocks when folder has no media", async () => {
    mockFetch.mockResolvedValue([
      {
        key: "shows/note.txt",
        name: "note.txt",
        isDir: false,
        size: 1,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "text/plain",
      },
    ]);
    render(
      <PublishPodcastDialog open folder={folder} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    await waitFor(() =>
      expect(screen.getByText(/no top-level audio|没有音视频/i)).toBeTruthy()
    );
    expect(screen.getByRole("button", { name: /Publish|发布/i })).toBeDisabled();
  });

  test("shows error when publish fails", async () => {
    mockFetch.mockResolvedValue([
      {
        key: "shows/ep1.mp3",
        name: "ep1.mp3",
        isDir: false,
        size: 10,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "audio/mpeg",
      },
    ]);
    mockPublish.mockRejectedValue(new Error("nope"));
    render(
      <PublishPodcastDialog open folder={folder} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    const submit = await screen.findByRole("button", { name: /Publish|发布/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    expect(await screen.findByText("nope")).toBeTruthy();
  });

  test("shows load failure", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    render(
      <PublishPodcastDialog open folder={folder} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    expect(await screen.findByText(/Failed to read|读取文件夹失败/i)).toBeTruthy();
  });

  test("editing slug clears error state", async () => {
    mockFetch.mockResolvedValue([
      {
        key: "shows/ep1.mp3",
        name: "ep1.mp3",
        isDir: false,
        size: 10,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "audio/mpeg",
      },
    ]);
    render(
      <PublishPodcastDialog open folder={folder} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    const input = await screen.findByLabelText(/Site address|站点地址|地址/i);
    fireEvent.change(input, { target: { value: "my-show" } });
    expect((input as HTMLInputElement).value).toBe("my-show");
  });
});
