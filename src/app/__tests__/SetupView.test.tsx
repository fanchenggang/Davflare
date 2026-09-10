import { vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SetupView from "../../SetupView";
import SettingsView from "../../SettingsView";
import { authFetch } from "../auth";
import { DEFAULT_FEATURE_FLAGS, useFeatures } from "../features";
import { fetchSetup, setupDocsUrl, type SetupResult } from "../setup";
import { setLang, strings } from "../strings";

vi.mock("../setup", async () => {
  const actual = await vi.importActual<typeof import("../setup")>("../setup");
  return { ...actual, fetchSetup: vi.fn() };
});

vi.mock("../features", async () => {
  const actual = await vi.importActual("../features");
  return { ...actual, useFeatures: vi.fn() };
});

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
}));

const mockFetchSetup = fetchSetup as unknown as Mock;
const mockUseFeatures = useFeatures as unknown as Mock;
const mockAuthFetch = authFetch as unknown as Mock;

function greenResult(overrides: Partial<SetupResult> = {}): SetupResult {
  return {
    allApplicableGreen: true,
    origin: "http://localhost",
    mcpUrl: "http://localhost/mcp",
    mcpJson:
      '{\n  "mcpServers": {\n    "davflare": {\n      "url": "http://localhost/mcp",\n      "headers": {\n        "Authorization": "Bearer <apiKey>"\n      }\n    }\n  }\n}',
    checks: [
      {
        id: "r2",
        status: "green",
        title: { zh: "R2 读写", en: "R2 read/write" },
        message: { zh: "", en: "" },
      },
      {
        id: "webdav",
        status: "skipped",
        title: { zh: "WebDAV PROPFIND", en: "WebDAV PROPFIND" },
        message: {
          zh: "未配置",
          en: "Not configured — skipped.",
        },
        docs: "webdav",
      },
      {
        id: "flags",
        status: "green",
        title: { zh: "功能开关", en: "Feature switches" },
        message: { zh: "", en: "" },
        flags: DEFAULT_FEATURE_FLAGS,
      },
      {
        id: "sitesHost",
        status: "green",
        title: { zh: "SITES_HOST", en: "SITES_HOST" },
        message: {
          zh: "已配置",
          en: "Configured as sites.example.com",
        },
      },
      {
        id: "mcp",
        status: "green",
        title: { zh: "MCP tools/list", en: "MCP tools/list" },
        message: { zh: "", en: "API key works" },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  setLang("en");
  mockFetchSetup.mockReset();
  mockUseFeatures.mockReset();
  mockAuthFetch.mockReset();
  mockUseFeatures.mockReturnValue({
    flags: DEFAULT_FEATURE_FLAGS,
    sitesHost: "sites.example.com",
    updateFlags: vi.fn(),
  });
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("setupDocsUrl", () => {
  test("points at bilingual docs paths", () => {
    expect(setupDocsUrl("deploy", "en")).toContain("/docs/deploy.md");
    expect(setupDocsUrl("deploy", "zh")).toContain("/docs/deploy.zh-CN.md");
    expect(setupDocsUrl("API", "en")).toContain("/docs/API.md");
    expect(setupDocsUrl("API", "zh")).toContain("/docs/API.zh-CN.md");
    expect(setupDocsUrl("webdav", "en")).toContain("/docs/webdav.md");
    expect(setupDocsUrl("sites", "zh")).toContain("/docs/sites.zh-CN.md");
  });
});

describe("fetchSetup (actual)", () => {
  test("returns JSON on 200", async () => {
    const actual = await vi.importActual<typeof import("../setup")>("../setup");
    mockAuthFetch.mockResolvedValue(
      new Response(JSON.stringify(greenResult()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const result = await actual.fetchSetup();
    expect(result.mcpUrl).toBe("http://localhost/mcp");
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/setup");
  });

  test("throws on non-OK", async () => {
    const actual = await vi.importActual<typeof import("../setup")>("../setup");
    mockAuthFetch.mockResolvedValue(new Response("nope", { status: 401 }));
    await expect(actual.fetchSetup()).rejects.toThrow(/nope|401/);
  });
});

describe("SetupView", () => {
  test("loads checklist and shows mcp copy when all applicable green", async () => {
    mockFetchSetup.mockResolvedValue(greenResult());
    const onNotify = vi.fn();
    render(<SetupView onNotify={onNotify} />);
    await waitFor(() =>
      expect(screen.getByText(strings.setupReady)).toBeInTheDocument()
    );
    expect(screen.getByText("R2 read/write")).toBeInTheDocument();
    expect(screen.getByText(strings.setupStatusSkipped)).toBeInTheDocument();
    expect(screen.getByText(/WebDAV ON/)).toBeInTheDocument();
    expect(screen.getByText(strings.setupDocsLink)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: strings.setupCopyMcp }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(strings.setupMcpCopied, "success")
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  test("shows warning when a check is red", async () => {
    mockFetchSetup.mockResolvedValue(
      greenResult({
        allApplicableGreen: false,
        checks: [
          {
            id: "r2",
            status: "red",
            title: { zh: "R2", en: "R2 read/write" },
            message: { zh: "失败", en: "Probe failed" },
            docs: "deploy",
          },
        ],
      })
    );
    render(<SetupView onNotify={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(strings.setupNotReady)).toBeInTheDocument()
    );
    expect(screen.getByText(strings.setupStatusRed)).toBeInTheDocument();
    expect(screen.getByText("Probe failed")).toBeInTheDocument();
    expect(screen.queryByText(strings.setupReady)).not.toBeInTheDocument();
  });

  test("load failure shows error alert", async () => {
    mockFetchSetup.mockRejectedValue(new Error("boom"));
    render(<SetupView onNotify={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
  });

  test("refresh reloads checks", async () => {
    mockFetchSetup
      .mockResolvedValueOnce(greenResult())
      .mockResolvedValueOnce(
        greenResult({
          allApplicableGreen: false,
          checks: [
            {
              id: "mcp",
              status: "red",
              title: { zh: "MCP", en: "MCP tools/list" },
              message: { zh: "", en: "MCP off" },
              docs: "API",
            },
          ],
        })
      );
    render(<SetupView onNotify={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(strings.setupReady)).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: strings.setupRefresh }));
    await waitFor(() =>
      expect(screen.getByText(strings.setupNotReady)).toBeInTheDocument()
    );
    expect(mockFetchSetup).toHaveBeenCalledTimes(2);
  });

  test("clipboard failure notifies error", async () => {
    mockFetchSetup.mockResolvedValue(greenResult());
    (navigator.clipboard.writeText as Mock).mockRejectedValue(
      new Error("denied")
    );
    const onNotify = vi.fn();
    render(<SetupView onNotify={onNotify} />);
    await waitFor(() =>
      expect(screen.getByText(strings.setupReady)).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: strings.setupCopyMcp }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(strings.setupCopyFailed, "error")
    );
  });
});

describe("SettingsView setup entry", () => {
  test("opens setup via button", () => {
    const onOpenSetup = vi.fn();
    render(<SettingsView onNotify={vi.fn()} onOpenSetup={onOpenSetup} />);
    fireEvent.click(
      screen.getByRole("button", { name: strings.setupOpenFromSettings })
    );
    expect(onOpenSetup).toHaveBeenCalled();
  });
});
