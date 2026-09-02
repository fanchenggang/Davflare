import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { authFetch, useAuth } from "./auth";
import { translate } from "./strings";

export type FeatureFlagName =
  | "webdav"
  | "mcp"
  | "apiKey"
  | "sites"
  | "imageHost";

export interface FeatureFlags {
  webdav: boolean;
  mcp: boolean;
  apiKey: boolean;
  sites: boolean;
  imageHost: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  webdav: true,
  mcp: true,
  apiKey: true,
  sites: true,
  imageHost: true,
};

export interface AppConfig {
  username: string;
  publicRead: boolean;
  sitesHost: string | null;
  flags: FeatureFlags;
}

function flagsFromPayload(data: Record<string, unknown>): FeatureFlags {
  const pick = (key: FeatureFlagName): boolean =>
    typeof data[key] === "boolean" ? (data[key] as boolean) : DEFAULT_FEATURE_FLAGS[key];
  return {
    webdav: pick("webdav"),
    mcp: pick("mcp"),
    apiKey: pick("apiKey"),
    sites: pick("sites"),
    imageHost: pick("imageHost"),
  };
}

export function parseAppConfig(data: unknown): AppConfig {
  const src =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    username: typeof src.username === "string" ? src.username : "",
    publicRead: src.publicRead === true,
    sitesHost: typeof src.sitesHost === "string" && src.sitesHost ? src.sitesHost : null,
    flags: flagsFromPayload(src),
  };
}

export async function fetchAppConfig(): Promise<AppConfig> {
  const response = await authFetch("/api/config");
  if (!response.ok) {
    throw new Error((await response.text()) || translate("loadConfigFailed"));
  }
  return parseAppConfig(await response.json());
}

export async function patchFeatureFlags(
  patch: Partial<FeatureFlags>
): Promise<AppConfig> {
  const response = await authFetch("/api/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || translate("saveConfigFailed"));
  }
  return parseAppConfig(await response.json());
}

interface FeaturesContextValue {
  config: AppConfig;
  flags: FeatureFlags;
  sitesHost: string | null;
  refresh: () => Promise<void>;
  updateFlags: (patch: Partial<FeatureFlags>) => Promise<void>;
}

const FeaturesContext = createContext<FeaturesContextValue>({
  config: {
    username: "",
    publicRead: false,
    sitesHost: null,
    flags: DEFAULT_FEATURE_FLAGS,
  },
  flags: DEFAULT_FEATURE_FLAGS,
  sitesHost: null,
  refresh: async () => {},
  updateFlags: async () => {},
});

export function useFeatures() {
  return useContext(FeaturesContext);
}

export function FeaturesProvider({ children }: { children: React.ReactNode }) {
  const { username } = useAuth();
  const [config, setConfig] = useState<AppConfig>({
    username: "",
    publicRead: false,
    sitesHost: null,
    flags: DEFAULT_FEATURE_FLAGS,
  });

  const refresh = useCallback(async () => {
    if (!username) return;
    try {
      setConfig(await fetchAppConfig());
    } catch {
      // keep last / defaults
    }
  }, [username]);

  useEffect(() => {
    if (!username) {
      setConfig({
        username: "",
        publicRead: false,
        sitesHost: null,
        flags: DEFAULT_FEATURE_FLAGS,
      });
      return;
    }
    void refresh();
  }, [username, refresh]);

  const updateFlags = useCallback(async (patch: Partial<FeatureFlags>) => {
    setConfig(await patchFeatureFlags(patch));
  }, []);

  const value = useMemo(
    () => ({
      config,
      flags: config.flags,
      sitesHost: config.sitesHost,
      refresh,
      updateFlags,
    }),
    [config, refresh, updateFlags]
  );

  return (
    <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>
  );
}
