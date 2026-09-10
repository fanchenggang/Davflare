import { authFetch } from "./auth";
import type { FeatureFlags } from "./features";

export type SetupCheckStatus = "green" | "red" | "skipped";

export type SetupDocsSlug = "deploy" | "webdav" | "API" | "sites";

export interface SetupCheck {
  id: "r2" | "webdav" | "flags" | "sitesHost" | "mcp";
  status: SetupCheckStatus;
  title: { zh: string; en: string };
  message: { zh: string; en: string };
  docs?: SetupDocsSlug;
  flags?: FeatureFlags;
}

export interface SetupResult {
  checks: SetupCheck[];
  allApplicableGreen: boolean;
  origin: string;
  mcpUrl: string;
  mcpJson: string;
}

const DOCS_BASE = "https://github.com/fanchenggang/Davflare/blob/main";

export function setupDocsUrl(slug: SetupDocsSlug, lang: "zh" | "en"): string {
  if (lang === "zh") {
    if (slug === "API") return `${DOCS_BASE}/docs/API.zh-CN.md`;
    return `${DOCS_BASE}/docs/${slug}.zh-CN.md`;
  }
  if (slug === "API") return `${DOCS_BASE}/docs/API.md`;
  return `${DOCS_BASE}/docs/${slug}.md`;
}

export async function fetchSetup(): Promise<SetupResult> {
  const response = await authFetch("/api/setup");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return (await response.json()) as SetupResult;
}
