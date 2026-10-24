import { vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import App from "../../App";
import { clearCredentials, setApiBase, setCredentials } from "../auth";
import { saveShortcuts, loadShortcuts, shortcutScope } from "../shortcuts";
import { fetchPath } from "../transfer";
import { setLang, strings } from "../strings";
vi.mock("../transfer", () => ({ fetchPath: vi.fn() }));
vi.mock("../features", async () => ({
  ...(await vi.importActual("../features")),
  FeaturesProvider: ({ children }: { children: JSX.Element }) => children,
}));
vi.mock("../transferQueue", () => ({
  TransferQueueProvider: ({ children }: { children: JSX.Element }) => children,
  useTransferQueue: () => [],
}));
vi.mock("../../Main", () => ({
  default: ({
    route,
    compactNavigation,
  }: {
    route: { kind: string; path?: string };
    compactNavigation: boolean;
  }) => (
    <div data-testid="route">
      {route.kind}:{route.path}:{String(compactNavigation)}
    </div>
  ),
}));
vi.mock("../../CommandPalette", () => ({ default: () => null }));
vi.mock("../../TransferManager", () => ({ default: () => null }));
vi.mock("../../ApiKeysPanel", () => ({ default: () => null }));
vi.mock("../../LoginDialog", () => ({ default: () => null }));
const scope = () => shortcutScope(window.location.origin, "alice");
beforeEach(() => {
  localStorage.clear();
  setLang("zh");
  setApiBase("");
  setCredentials({ username: "alice", password: "demo" });
  window.location.hash = "";
  vi.mocked(fetchPath).mockResolvedValue([]);
});
afterEach(() => {
  clearCredentials();
});
test("drawer navigates, clears search, and opens a validated shortcut", async () => {
  saveShortcuts(scope(), [{ path: "docs/", name: "Docs" }]);
  render(<App />);
  fireEvent.change(screen.getByLabelText(strings.searchShortcutHint), {
    target: { value: "query" },
  });
  fireEvent.click(
    await screen.findByRole("button", {
      name: strings.navigation,
      exact: true,
    }),
  );
  fireEvent.click(
    within(screen.getByRole("navigation")).getByText(strings.shares),
  );
  await waitFor(() =>
    expect(screen.getByTestId("route")).toHaveTextContent("shares:"),
  );
  expect(screen.getByLabelText(strings.searchShortcutHint)).toHaveValue("");
  fireEvent.click(
    await screen.findByRole("button", {
      name: strings.navigation,
      exact: true,
    }),
  );
  fireEvent.click(within(screen.getByRole("navigation")).getByText("Docs"));
  await waitFor(() =>
    expect(screen.getByTestId("route")).toHaveTextContent("folder:docs/"),
  );
  expect(fetchPath).toHaveBeenCalledWith("docs/");
});
test("failed shortcut keeps the current route and offers removal", async () => {
  saveShortcuts(scope(), [{ path: "missing/", name: "Missing" }]);
  vi.mocked(fetchPath).mockRejectedValue(new Error("missing"));
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: strings.navigation,
      exact: true,
    }),
  );
  fireEvent.click(within(screen.getByRole("navigation")).getByText("Missing"));
  expect(
    await screen.findByText(strings.shortcutUnavailable),
  ).toBeInTheDocument();
  fireEvent.click(
    await screen.findByRole("button", {
      name: strings.removeShortcut,
      exact: true,
    }),
  );
  expect(loadShortcuts(scope())).toEqual([]);
  expect(screen.getByTestId("route")).toHaveTextContent("folder:");
});
test("embedded app omits the desktop shell and uses the supplied theme callback", () => {
  render(
    <App layout="embedded" themeMode="light" onThemeModeChange={vi.fn()} />,
  );
  expect(screen.queryByLabelText(strings.navigation)).not.toBeInTheDocument();
  expect(screen.getByTestId("route")).toHaveTextContent("true");
});
