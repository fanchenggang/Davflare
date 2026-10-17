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

  test("blocks when folder has no assets", async () => {
    mockFetch.mockResolvedValue([
      {
        key: "rel/README.md",
        name: "README.md",
        isDir: false,
        size: 1,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "text/markdown",
      },
    ]);
    render(
      <PublishDownloadsDialog open folder={folder} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    await waitFor(() =>
      expect(screen.getByText(/no top-level|没有可发布/i)).toBeTruthy()
    );
    expect(screen.getByRole("button", { name: /Publish|发布/i })).toBeDisabled();
  });

  test("shows error when publish fails", async () => {
    mockFetch.mockResolvedValue([
      {
        key: "rel/app.zip",
        name: "app.zip",
        isDir: false,
        size: 10,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "application/zip",
      },
    ]);
    mockPublish.mockRejectedValue(new Error("nope"));
    render(
      <PublishDownloadsDialog open folder={folder} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    const submit = await screen.findByRole("button", { name: /Publish|发布/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    expect(await screen.findByText("nope")).toBeTruthy();
  });

  test("shows load failure", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    render(
      <PublishDownloadsDialog open folder={folder} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    expect(await screen.findByText(/Failed to read|读取文件夹失败/i)).toBeTruthy();
  });

  test("editing slug clears error state", async () => {
    mockFetch.mockResolvedValue([
      {
        key: "rel/app.zip",
        name: "app.zip",
        isDir: false,
        size: 10,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "application/zip",
      },
    ]);
    render(
      <PublishDownloadsDialog open folder={folder} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    const input = await screen.findByLabelText(/Site address|站点地址|地址/i);
    fireEvent.change(input, { target: { value: "my-rel" } });
    expect((input as HTMLInputElement).value).toBe("my-rel");
  });

  test("copies page URL again from success view", async () => {
    mockFetch.mockResolvedValue([
      {
        key: "rel/app.zip",
        name: "app.zip",
        isDir: false,
        size: 10,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "application/zip",
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
    await screen.findByTestId("downloads-page-url");
    fireEvent.click(screen.getByRole("button", { name: /Copy|复制/i }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/copied|已复制/i), "success")
    );
  });

  test("shows no-host info when sitesHost is null", async () => {
    mockFetch.mockResolvedValue([
      {
        key: "rel/app.zip",
        name: "app.zip",
        isDir: false,
        size: 10,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "application/zip",
      },
    ]);
    mockPublish.mockResolvedValue({
      slug: "rel",
      kind: "downloads",
      copied: 1,
      sitesHost: null,
    });
    const onNotify = vi.fn();
    render(
      <PublishDownloadsDialog open folder={folder} onClose={vi.fn()} onNotify={onNotify} />
    );
    const submit = await screen.findByRole("button", { name: /Publish|发布/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/SITES_HOST|未配置/i), "info")
    );
    expect(screen.queryByTestId("downloads-page-url")).toBeNull();
  });
});
