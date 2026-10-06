import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import PublishDocsDialog from "../../PublishDocsDialog";
import {
  DOCS_MAX_FILES,
  DocsPrepared,
  SitePublishInterruptedError,
  prepareDocsPublish,
  publishDocsSite,
  siteUrl,
} from "../sites";
import { getLang, strings, translate } from "../strings";
import { fetchPath } from "../transfer";
import { FileItem } from "../types";

vi.mock("../sites", async () => {
  const actual = await vi.importActual<typeof import("../sites")>("../sites");
  return { ...actual, prepareDocsPublish: vi.fn(), publishDocsSite: vi.fn() };
});
vi.mock("../transfer", async () => {
  const actual = await vi.importActual<typeof import("../transfer")>("../transfer");
  return { ...actual, fetchPath: vi.fn() };
});

function file(key: string, size = 100, isDir = false): FileItem {
  return { key, name: key.split("/").pop()!, isDir, size, uploaded: "", contentType: "" };
}

function fakePrepared(docs: number, images: number, missing = 0, bytes = 4096, outOfScope = 0, shortened = 0, shortenedImages = 0): DocsPrepared {
  return {
    md: {} as DocsPrepared["md"],
    docs: Array.from({ length: docs }, (_, i) => ({ name: `${i}.md` }) as DocsPrepared["docs"][number]),
    images: Array.from({ length: images }, (_, i) => file(`img/${i}.png`)),
    byRef: new Map(),
    missing,
    outOfScope,
    shortened,
    shortenedImages,
    bytes,
  };
}

describe("PublishDocsDialog", () => {
  beforeEach(() => {
    vi.mocked(prepareDocsPublish).mockReset();
    vi.mocked(publishDocsSite).mockReset();
    vi.mocked(fetchPath).mockReset();
  });

  test("folder entry takes current-level .md, shows notes and publishes", async () => {
    vi.mocked(fetchPath).mockResolvedValue([file("Vault/a.md"), file("Vault/b.txt"), file("Vault/sub", 0, true)]);
    const ready = fakePrepared(1, 2, 1);
    vi.mocked(prepareDocsPublish).mockResolvedValue(ready);
    vi.mocked(publishDocsSite).mockImplementation(async (_slug, _prepared, options) => {
      options?.onProgress?.({ phase: "upload", done: 1, total: 4 });
      return { slug: "vault", kind: "docs", copied: 3, bytes: 1, sitesHost: "sites.example.com" };
    });
    const onNotify = vi.fn();
    render(
      <PublishDocsDialog
        open
        source={{ kind: "folder", folder: file("Vault", 0, true) }}
        onClose={vi.fn()}
        onNotify={onNotify}
      />
    );
    await waitFor(() => expect(prepareDocsPublish).toHaveBeenCalledWith([file("Vault/a.md")]));
    expect(fetchPath).toHaveBeenCalledWith("Vault/");
    expect(await screen.findByText(strings.publishDocsFolderNote)).toBeInTheDocument();
    expect(screen.getByText(translate("publishDocsMissingImages", { count: 1 }))).toBeInTheDocument();
    expect(screen.getByText(strings.publishDocsCopyNote)).toBeInTheDocument();
    expect(screen.getByLabelText(strings.publishSiteSlug)).toHaveValue("vault");
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    await waitFor(() =>
      expect(publishDocsSite).toHaveBeenCalledWith(
        "vault",
        ready,
        expect.objectContaining({ lang: getLang(), title: "Vault" })
      )
    );
    const expected = siteUrl("sites.example.com", "vault")!;
    await waitFor(() => expect(screen.getByDisplayValue(expected)).toBeInTheDocument());
    expect(onNotify).toHaveBeenCalledWith(translate("publishDocsDone", { count: 1 }), "success");
  });

  test("multi-select entry shows ignored count", async () => {
    vi.mocked(prepareDocsPublish).mockResolvedValue(fakePrepared(2, 0));
    render(
      <PublishDocsDialog
        open
        source={{ kind: "files", files: [file("n/a.md"), file("n/b.md")], ignored: 3, title: "n" }}
        onClose={vi.fn()}
        onNotify={vi.fn()}
      />
    );
    expect(await screen.findByText(translate("publishDocsIgnored", { count: 3 }))).toBeInTheDocument();
    expect(fetchPath).not.toHaveBeenCalled();
  });

  test("#153: out-of-scope images, missing images and shortened names are reported", async () => {
    vi.mocked(prepareDocsPublish).mockResolvedValue(fakePrepared(2, 1, 3, 4096, 2, 1, 1));
    render(
      <PublishDocsDialog
        open
        source={{ kind: "files", files: [file("n/a.md"), file("n/b.md")], ignored: 0, title: "n" }}
        onClose={vi.fn()}
        onNotify={vi.fn()}
      />
    );
    expect(await screen.findByText(translate("publishDocsOutOfScope", { count: 2 }))).toBeInTheDocument();
    expect(screen.getByText(translate("publishDocsMissingImages", { count: 3 }))).toBeInTheDocument();
    expect(screen.getByText(translate("publishDocsNamesShortened", { count: 1 }))).toBeInTheDocument();
    // 图片名被截短也要提示（#158）
    expect(screen.getByText(translate("publishDocsImageNamesShortened", { count: 1 }))).toBeInTheDocument();
  });

  test("too many files after resolving images blocks publishing", async () => {
    vi.mocked(prepareDocsPublish).mockResolvedValue(fakePrepared(150, 60));
    render(
      <PublishDocsDialog
        open
        source={{ kind: "files", files: [file("a.md")], ignored: 0, title: "x" }}
        onClose={vi.fn()}
        onNotify={vi.fn()}
      />
    );
    expect(
      await screen.findByText(translate("publishDocsTooMany", { count: 210, docs: 150, images: 60, max: DOCS_MAX_FILES }))
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: strings.publishSiteSubmit })).toBeDisabled();
  });

  test("too many .md is blocked before reading anything", async () => {
    const files = Array.from({ length: DOCS_MAX_FILES + 1 }, (_, i) => file(`${i}.md`, 1));
    render(
      <PublishDocsDialog open source={{ kind: "files", files, ignored: 0, title: "x" }} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(String(DOCS_MAX_FILES + 1));
    expect(prepareDocsPublish).not.toHaveBeenCalled();
  });

  test("read failure and interrupted publish show clear messages", async () => {
    vi.mocked(prepareDocsPublish).mockRejectedValueOnce(new Error("a.md"));
    const { unmount } = render(
      <PublishDocsDialog open source={{ kind: "files", files: [file("a.md")], ignored: 0, title: "x" }} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    expect(await screen.findByText(translate("publishDocsLoadFailed", { reason: "a.md" }))).toBeInTheDocument();
    unmount();

    vi.mocked(prepareDocsPublish).mockResolvedValue(fakePrepared(1, 0));
    vi.mocked(publishDocsSite).mockRejectedValue(new SitePublishInterruptedError("boom", "docs"));
    render(
      <PublishDocsDialog open source={{ kind: "files", files: [file("a.md")], ignored: 0, title: "x" }} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByRole("button", { name: strings.publishSiteSubmit })).toBeEnabled());
    fireEvent.change(screen.getByLabelText(strings.publishSiteSlug), { target: { value: "Bad!" } });
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    expect(await screen.findByText(translate("publishSiteBadSlug"))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(strings.publishSiteSlug), { target: { value: "ok" } });
    fireEvent.click(screen.getByRole("button", { name: strings.publishSiteSubmit }));
    expect(await screen.findByText(translate("publishDocsInterrupted", { reason: "boom" }))).toBeInTheDocument();
  });

  test("folder listing failure", async () => {
    vi.mocked(fetchPath).mockRejectedValue(new Error("net"));
    render(
      <PublishDocsDialog open source={{ kind: "folder", folder: file("V", 0, true) }} onClose={vi.fn()} onNotify={vi.fn()} />
    );
    expect(await screen.findByText(translate("publishDirLoadFailed"))).toBeInTheDocument();
  });
});
