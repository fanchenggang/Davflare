import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import ImagesView from "../../ImagesView";
import SettingsView from "../../SettingsView";
import SitesView from "../../SitesView";
import { DEFAULT_FEATURE_FLAGS, useFeatures } from "../features";
import { listImages } from "../images";
import { listSites } from "../sites";
import { setLang, strings } from "../strings";

jest.mock("../features", () => {
  const actual = jest.requireActual("../features");
  return { ...actual, useFeatures: jest.fn() };
});

jest.mock("../sites", () => {
  const actual = jest.requireActual("../sites");
  return { ...actual, listSites: jest.fn() };
});

jest.mock("../images", () => {
  const actual = jest.requireActual("../images");
  return { ...actual, listImages: jest.fn() };
});

jest.mock("../transferQueue", () => ({
  useUploadEnqueue: () => jest.fn(),
}));

const mockUseFeatures = useFeatures as unknown as jest.Mock;
const mockListSites = listSites as unknown as jest.Mock;
const mockListImages = listImages as unknown as jest.Mock;

beforeEach(() => {
  setLang("en");
  mockUseFeatures.mockReset();
  mockListSites.mockReset();
  mockListImages.mockReset();
  mockUseFeatures.mockReturnValue({
    flags: DEFAULT_FEATURE_FLAGS,
    sitesHost: null,
    updateFlags: jest.fn(),
  });
});

describe("P0 copy: Settings / Sites / Images", () => {
  test("Settings states MCP is 404 when API Key is off", () => {
    render(<SettingsView onNotify={jest.fn()} />);
    expect(screen.getByText(strings.mcpRequiresApiKey)).toBeInTheDocument();
    expect(strings.mcpRequiresApiKey).toMatch(/404/);
    expect(strings.mcpRequiresApiKey).toMatch(/API Key/i);
    expect(screen.getByText(strings.flagWebdav)).toBeInTheDocument();
    expect(screen.getByText(strings.flagMcp)).toBeInTheDocument();
    expect(screen.getByText(strings.flagApiKey)).toBeInTheDocument();
    expect(screen.getByText(strings.flagSites)).toBeInTheDocument();
    expect(screen.getByText(strings.flagImageHost)).toBeInTheDocument();
  });

  test("Sites view is blunt when SITES_HOST is missing", async () => {
    mockListSites.mockResolvedValue({ sitesHost: null, sites: [] });
    render(<SitesView onNotify={jest.fn()} onManageFiles={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(strings.sitesHostMissing)).toBeInTheDocument();
    });
    expect(screen.getByText(strings.sitesHostMissingHint)).toBeInTheDocument();
    expect(strings.sitesHostMissingHint).toMatch(/SITES_HOST/);
    expect(strings.sitesHostMissingHint).toMatch(/redeploy/i);
    expect(strings.sitesHostMissingHint).toMatch(/hostname only/i);
  });

  test("Images view is blunt when SITES_HOST is missing", async () => {
    mockListImages.mockResolvedValue({ sitesHost: null, images: [] });
    render(<ImagesView onNotify={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(strings.imagesHostMissing)).toBeInTheDocument();
    });
    expect(screen.getByText(strings.imagesHostMissingHint)).toBeInTheDocument();
    expect(strings.imagesHostMissingHint).toMatch(/SITES_HOST/);
    expect(strings.imagesHostMissingHint).toMatch(/redeploy/i);
    expect(strings.imagesHostMissing).toMatch(/will not open/);
  });
});
