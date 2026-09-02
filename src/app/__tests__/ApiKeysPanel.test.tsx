import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ApiKeysPanel from "../../ApiKeysPanel";
import { createApiKey, listApiKeys, revokeApiKey } from "../apikeys";
import { DEFAULT_FEATURE_FLAGS, useFeatures } from "../features";
import { setLang, strings, translate } from "../strings";

jest.mock("../features", () => {
  const actual = jest.requireActual("../features");
  return { ...actual, useFeatures: jest.fn() };
});

jest.mock("../apikeys", () => {
  const actual = jest.requireActual("../apikeys");
  return {
    ...actual,
    listApiKeys: jest.fn(),
    createApiKey: jest.fn(),
    revokeApiKey: jest.fn(),
  };
});

const mockUseFeatures = useFeatures as unknown as jest.Mock;
const mockList = listApiKeys as unknown as jest.Mock;
const mockCreate = createApiKey as unknown as jest.Mock;
const mockRevoke = revokeApiKey as unknown as jest.Mock;

beforeEach(() => {
  setLang("zh");
  mockUseFeatures.mockReset();
  mockList.mockReset();
  mockCreate.mockReset();
  mockRevoke.mockReset();
  mockUseFeatures.mockReturnValue({
    flags: DEFAULT_FEATURE_FLAGS,
    sitesHost: null,
    updateFlags: jest.fn(),
  });
  mockList.mockResolvedValue([]);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("ApiKeysPanel", () => {
  test("loads empty list", async () => {
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={jest.fn()} />);
    await waitFor(() => expect(screen.getByText(strings.apiNoKeys)).toBeInTheDocument());
    expect(mockList).toHaveBeenCalled();
  });

  test("empty name does not create", async () => {
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await screen.findByText(strings.apiNoKeys);
    fireEvent.click(screen.getByRole("button", { name: strings.createApiKey }));
    expect(onNotify).toHaveBeenCalledWith(translate("fillKeyName"), "error");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("creates a key", async () => {
    mockCreate.mockResolvedValue({
      id: "1",
      name: "k",
      prefix: "fd_",
      createdAt: "",
      expiresAt: null,
      key: "fd_secret",
    });
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await screen.findByText(strings.apiNoKeys);
    fireEvent.change(screen.getByLabelText(strings.apiKeyName), { target: { value: "k" } });
    fireEvent.click(screen.getByRole("button", { name: strings.createApiKey }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("keyCreatedToast"), "success")
    );
    expect(mockCreate).toHaveBeenCalled();
  });

  test("list error notifies", async () => {
    mockList.mockRejectedValue(new Error("keys-fail"));
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("keys-fail", "error"));
  });
});
