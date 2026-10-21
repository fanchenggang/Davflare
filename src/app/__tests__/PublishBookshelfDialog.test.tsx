import { vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import PublishBookshelfDialog from "../../PublishBookshelfDialog";
import { fetchPath } from "../transfer";
import { publishBookshelfSite } from "../sites";
import { setLang } from "../strings";

vi.mock("../transfer", () => ({
  fetchPath: vi.fn(),
}));

vi.mock("../sites", async () => {
  const actual = await vi.importActual<typeof import("../sites")>("../sites");
  return {
    ...actual,
    publishBookshelfSite: vi.fn(),
    checkSiteSlug: vi.fn().mockResolvedValue({
      slug: "lib",
      exists: false,
      kind: null,
      source: null,
    }),
  };
});

const mockFetch = fetchPath as unknown as ReturnType<typeof vi.fn>;
const mockPublish = publishBookshelfSite as unknown as ReturnType<typeof vi.fn>;

const folder = {
  key: "lib",
  name: "lib",
  isDir: true,
  size: 0,
  uploaded: "2026-01-01T00:00:00.000Z",
  contentType: "application/x-directory",
};

const pdf = {
  key: "lib/guide.pdf",
  name: "guide.pdf",
  isDir: false,
  size: 10,
  uploaded: "2026-01-01T00:00:00.000Z",
  contentType: "application/pdf",
};

describe("PublishBookshelfDialog", () => {
  beforeEach(() => {
    setLang("en");
    mockFetch.mockReset();
    mockPublish.mockReset();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  test("loads books, publishes, shows page URL", async () => {
    mockFetch.mockResolvedValue([
      pdf,
      {
        key: "lib/notes.txt",
        name: "notes.txt",
        isDir: false,
        size: 2,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "text/plain",
      },
    ]);
    mockPublish.mockResolvedValue({
      slug: "lib",
      kind: "bookshelf",
      copied: 1,
      sitesHost: "sites.example.com",
    });
    const onNotify = vi.fn();
    render(
      <PublishBookshelfDialog open folder={folder} onClose={vi.fn()} onNotify={onNotify} />
    );
    const submit = await screen.findByRole("button", { name: /Publish|发布/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(mockPublish).toHaveBeenCalled());
    expect(mockPublish.mock.calls[0][0]).toBe("lib");
    expect(mockPublish.mock.calls[0][1]).toEqual(["lib/guide.pdf"]);
    const urlField = await screen.findByTestId("bookshelf-page-url");
    expect(urlField).toHaveValue(`${window.location.protocol}//sites.example.com/lib/`);
  });

  test("blocks when folder has no pdf/epub", async () => {
    mockFetch.mockResolvedValue([
      {
        key: "lib/notes.txt",
        name: "notes.txt",
        isDir: false,
        size: 1,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "text/plain",
      },
    ]);
    render(
      <PublishBookshelfDialog open folder={folder} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    await waitFor(() =>
      expect(screen.getByText(/no top-level|没有可发布/i)).toBeTruthy()
    );
    expect(screen.getByRole("button", { name: /Publish|发布/i })).toBeDisabled();
  });

  test("shows error when publish fails", async () => {
    mockFetch.mockResolvedValue([pdf]);
    mockPublish.mockRejectedValue(new Error("nope"));
    render(
      <PublishBookshelfDialog open folder={folder} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    const submit = await screen.findByRole("button", { name: /Publish|发布/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    expect(await screen.findByText("nope")).toBeTruthy();
  });

  test("shows load failure", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    render(
      <PublishBookshelfDialog open folder={folder} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    expect(await screen.findByText(/Failed to read|读取文件夹失败/i)).toBeTruthy();
  });

  test("editing slug clears error state", async () => {
    mockFetch.mockResolvedValue([pdf]);
    render(
      <PublishBookshelfDialog open folder={folder} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    const input = await screen.findByLabelText(/Site address|站点地址|地址/i);
    fireEvent.change(input, { target: { value: "my-lib" } });
    expect((input as HTMLInputElement).value).toBe("my-lib");
  });

  test("copies page URL again from success view", async () => {
    mockFetch.mockResolvedValue([pdf]);
    mockPublish.mockResolvedValue({
      slug: "lib",
      kind: "bookshelf",
      copied: 1,
      sitesHost: "sites.example.com",
    });
    const onNotify = vi.fn();
    render(
      <PublishBookshelfDialog open folder={folder} onClose={vi.fn()} onNotify={onNotify} />
    );
    const submit = await screen.findByRole("button", { name: /Publish|发布/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await screen.findByTestId("bookshelf-page-url");
    fireEvent.click(screen.getByRole("button", { name: /Copy|复制/i }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/copied|已复制/i), "success")
    );
  });

  test("shows no-host info when sitesHost is null", async () => {
    mockFetch.mockResolvedValue([pdf]);
    mockPublish.mockResolvedValue({
      slug: "lib",
      kind: "bookshelf",
      copied: 1,
      sitesHost: null,
    });
    const onNotify = vi.fn();
    render(
      <PublishBookshelfDialog open folder={folder} onClose={vi.fn()} onNotify={onNotify} />
    );
    const submit = await screen.findByRole("button", { name: /Publish|发布/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/SITES_HOST|未配置/i), "info")
    );
    expect(screen.queryByTestId("bookshelf-page-url")).toBeNull();
  });

  test("shows ignored and subdir hints", async () => {
    mockFetch.mockResolvedValue([
      pdf,
      {
        key: "lib/notes.txt",
        name: "notes.txt",
        isDir: false,
        size: 2,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "text/plain",
      },
      {
        key: "lib/more",
        name: "more",
        isDir: true,
        size: 0,
        uploaded: "2026-01-01T00:00:00.000Z",
        contentType: "application/x-directory",
      },
    ]);
    render(
      <PublishBookshelfDialog open folder={folder} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    expect(await screen.findByText(/Ignored|已忽略/i)).toBeTruthy();
    expect(screen.getByText(/Skipped|已跳过/i)).toBeTruthy();
  });
});
