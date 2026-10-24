import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import {
  FolderShortcutsProvider,
  loadShortcuts,
  normalizeFolderPath,
  relocateShortcuts,
  saveShortcuts,
  shortcutScope,
  useFolderShortcuts,
} from "../shortcuts";
import WorkspaceNavigation from "../../WorkspaceNavigation";
import QuickAccessMenu from "../../QuickAccessMenu";
import PathBar from "../../PathBar";
import FileActionSheet from "../../FileActionSheet";
import { setLang, strings } from "../strings";
import { DEFAULT_FEATURE_FLAGS } from "../features";

let user: string | null = "alice";
let instance = "https://one.example";
let flags = { ...DEFAULT_FEATURE_FLAGS };
vi.mock("../auth", () => ({
  useAuth: () => ({ username: user }),
  getApiBase: () => instance,
  authFetch: vi.fn(),
}));
vi.mock("../features", async () => ({
  ...(await vi.importActual("../features")),
  useFeatures: () => ({ flags }),
}));
function Probe() {
  const { items, toggle, remove } = useFolderShortcuts();
  return (
    <>
      <output>{JSON.stringify(items)}</output>
      <button onClick={() => toggle("/docs//", "Docs")}>pin</button>
      <button onClick={() => remove("docs/")}>remove</button>
    </>
  );
}
const scope = () => shortcutScope(instance, user ?? "");
beforeEach(() => {
  localStorage.clear();
  user = "alice";
  instance = "https://one.example";
  flags = { ...DEFAULT_FEATURE_FLAGS };
  setLang("zh");
});

test("normalizes paths without decoding meaningful characters and isolates instance/user keys", () => {
  expect(normalizeFolderPath("//a///空 格/%23/")).toBe("a/空 格/%23/");
  expect(normalizeFolderPath("/")).toBe("");
  expect(shortcutScope("https://one.example/", "a")).toBe(
    shortcutScope("https://one.example", "a"),
  );
  expect(shortcutScope(instance, "a")).not.toBe(shortcutScope(instance, "b"));
  expect(shortcutScope(instance, "a")).not.toBe(
    shortcutScope("https://two.example", "a"),
  );
});
test("validates persisted data and keeps first occurrence in insertion order", () => {
  localStorage.setItem(scope(), "{}");
  expect(loadShortcuts(scope())).toEqual([]);
  localStorage.setItem(scope(), "invalid");
  expect(loadShortcuts(scope())).toEqual([]);
  localStorage.setItem(
    scope(),
    JSON.stringify([
      null,
      {},
      { path: "docs", name: "first" },
      { path: "/docs/", name: "duplicate" },
      { path: "b", name: "second" },
    ]),
  );
  expect(loadShortcuts(scope()).map((x) => x.name)).toEqual([
    "first",
    "second",
  ]);
});
test("relocates exact folders and descendants using actual destination, preserving siblings and order", () => {
  saveShortcuts(scope(), [
    { path: "a/", name: "A" },
    { path: "a/b/", name: "B" },
    { path: "ab/", name: "AB" },
  ]);
  relocateShortcuts(scope(), "a", "c/a (1)");
  expect(loadShortcuts(scope())).toEqual([
    { path: "c/a (1)/", name: "a (1)" },
    { path: "c/a (1)/b/", name: "B" },
    { path: "ab/", name: "AB" },
  ]);
  relocateShortcuts(scope(), "", "x");
  relocateShortcuts(scope(), "absent", "x");
  relocateShortcuts(scope(), "ab", "ab");
  saveShortcuts(scope(), [
    { path: "a/", name: "A" },
    { path: "b/", name: "B" },
  ]);
  relocateShortcuts(scope(), "a", "b");
  expect(loadShortcuts(scope())).toEqual([{ path: "b/", name: "b" }]);
});
test("provider toggles, persists, remounts, and switches accounts and instances without leaking shortcuts", () => {
  const view = render(
    <FolderShortcutsProvider>
      <Probe />
    </FolderShortcutsProvider>,
  );
  fireEvent.click(screen.getByText("pin"));
  expect(screen.getByRole("status")).toHaveTextContent("Docs");
  fireEvent.click(screen.getByText("pin"));
  expect(screen.getByRole("status")).toHaveTextContent("[]");
  fireEvent.click(screen.getByText("pin"));
  user = "bob";
  view.rerender(
    <FolderShortcutsProvider>
      <Probe />
    </FolderShortcutsProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("[]");
  instance = "https://two.example";
  view.rerender(
    <FolderShortcutsProvider>
      <Probe />
    </FolderShortcutsProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("[]");
  instance = "https://one.example";
  user = "alice";
  view.rerender(
    <FolderShortcutsProvider>
      <Probe />
    </FolderShortcutsProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Docs");
  fireEvent.click(screen.getByText("remove"));
  expect(loadShortcuts(scope())).toEqual([]);
  user = null;
  view.rerender(
    <FolderShortcutsProvider>
      <Probe />
    </FolderShortcutsProvider>,
  );
  fireEvent.click(screen.getByText("pin"));
  expect(screen.getByRole("status")).toHaveTextContent("[]");
});
test("provider receives move updates and changes from other tabs", () => {
  saveShortcuts(scope(), [{ path: "a/", name: "A" }]);
  render(
    <FolderShortcutsProvider>
      <Probe />
    </FolderShortcutsProvider>,
  );
  act(() => relocateShortcuts(scope(), "a", "b"));
  expect(screen.getByRole("status")).toHaveTextContent('"path":"b/"');
  act(() => saveShortcuts("another-user", []));
  expect(screen.getByRole("status")).toHaveTextContent('"path":"b/"');
  localStorage.setItem(scope(), "[]");
  act(() =>
    window.dispatchEvent(new StorageEvent("storage", { key: scope() })),
  );
  expect(screen.getByRole("status")).toHaveTextContent("[]");
});
test("unavailable storage retains a usable session preference", () => {
  instance = "https://storage-unavailable.example";
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  const view = render(
    <FolderShortcutsProvider>
      <Probe />
    </FolderShortcutsProvider>,
  );
  fireEvent.click(screen.getByText("pin"));
  expect(screen.getByRole("status")).toHaveTextContent("Docs");
  view.unmount();
  spy.mockRestore();
  render(
    <FolderShortcutsProvider>
      <Probe />
    </FolderShortcutsProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Docs");
  fireEvent.click(screen.getByText("remove"));
  expect(loadShortcuts(scope())).toEqual([]);
});
test("workspace navigation follows flags, routes, and quick access removal", () => {
  const navigate = vi.fn(),
    open = vi.fn();
  saveShortcuts(scope(), [{ path: "docs/", name: "Docs" }]);
  flags.sites = false;
  flags.imageHost = false;
  flags.mcp = false;
  render(
    <FolderShortcutsProvider>
      <WorkspaceNavigation
        route={{ kind: "shares" }}
        navigate={navigate}
        onOpenShortcut={open}
      />
    </FolderShortcutsProvider>,
  );
  expect(screen.queryByText(strings.sitesSection)).not.toBeInTheDocument();
  expect(screen.queryByText(strings.imagesSection)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText(strings.files));
  expect(navigate).toHaveBeenLastCalledWith({ kind: "folder", path: "" });
  fireEvent.click(screen.getByText(strings.trash));
  expect(navigate).toHaveBeenLastCalledWith({ kind: "trash" });
  fireEvent.click(screen.getByText(strings.settings));
  expect(navigate).toHaveBeenLastCalledWith({ kind: "settings" });
  fireEvent.click(screen.getByText("Docs"));
  expect(open).toHaveBeenCalledWith({ path: "docs/", name: "Docs" });
  fireEvent.click(screen.getByLabelText(`${strings.removeShortcut}: Docs`));
  expect(screen.getByText(strings.shortcutsHint)).toBeInTheDocument();
});
test("embedded quick access menu opens, selects and removes entries", () => {
  saveShortcuts(scope(), [{ path: "docs/", name: "Docs" }]);
  const open = vi.fn();
  render(
    <FolderShortcutsProvider>
      <QuickAccessMenu onOpen={open} />
    </FolderShortcutsProvider>,
  );
  fireEvent.click(screen.getByText(strings.shortcuts));
  fireEvent.click(screen.getByText("Docs"));
  expect(open).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText(strings.shortcuts));
  fireEvent.click(screen.getByLabelText(`${strings.removeShortcut}: Docs`));
  expect(screen.getByText(strings.shortcutsHint)).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
});
test("breadcrumb and folder menu expose a working pin/unpin action", () => {
  const action = vi.fn();
  render(
    <FolderShortcutsProvider>
      <PathBar
        cwd="docs/"
        onNavigate={vi.fn()}
        stats=""
        searchScope="folder"
        onSearchScopeChange={vi.fn()}
        searchQuery=""
        onNotify={vi.fn()}
      />
      <FileActionSheet
        file={{
          key: "docs",
          name: "docs",
          isDir: true,
          size: 0,
          uploaded: "",
          contentType: "application/x-directory",
        }}
        anchorPosition={{ top: 10, left: 10 }}
        onAction={action}
        onClose={vi.fn()}
        shortcutPinned
      />
    </FolderShortcutsProvider>,
  );
  fireEvent.click(screen.getByLabelText(strings.addShortcut));
  expect(loadShortcuts(scope())).toEqual([{ path: "docs/", name: "docs" }]);
  fireEvent.click(
    screen.getByRole("menuitem", { name: strings.removeShortcut }),
  );
  expect(action).toHaveBeenCalledWith(
    "shortcut",
    expect.objectContaining({ key: "docs" }),
  );
});
