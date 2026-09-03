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

  test("custom expiry invalid hours rejects creation", async () => {
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await screen.findByText(strings.apiNoKeys);
    fireEvent.change(screen.getByLabelText(strings.apiKeyName), { target: { value: "k" } });
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText(strings.apiExpiryCustom));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: strings.createApiKey }));
    expect(onNotify).toHaveBeenCalledWith(translate("fillValidHours"), "error");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("custom expiry valid hours creates key", async () => {
    mockCreate.mockResolvedValue({
      id: "2",
      name: "k",
      prefix: "fd_",
      createdAt: "",
      expiresAt: null,
      key: "fd_secret2",
    });
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await screen.findByText(strings.apiNoKeys);
    fireEvent.change(screen.getByLabelText(strings.apiKeyName), { target: { value: "k" } });
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText(strings.apiExpiryCustom));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: strings.createApiKey }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("keyCreatedToast"), "success")
    );
    expect(mockCreate).toHaveBeenCalledWith({
      name: "k",
      expiresInHours: 12,
      key: undefined,
    });
  });

  test("revoke key removes row and notifies", async () => {
    mockList.mockResolvedValue([
      {
        id: "k1",
        name: "my-key",
        prefix: "fd_a",
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: null,
        lastUsedAt: null,
      },
    ]);
    mockRevoke.mockResolvedValue(undefined);
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await screen.findByText(/my-key/);
    fireEvent.click(screen.getByText(strings.revokeApiKey));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("keyRevokedToast"), "success")
    );
    expect(mockRevoke).toHaveBeenCalledWith("k1");
  });

  test("copy usage notifies", async () => {
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await screen.findByText(strings.apiNoKeys);
    fireEvent.click(screen.getAllByRole("button", { name: strings.copyUsage })[0]);
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(
        translate("copiedFormat", { label: strings.usageLabel }),
        "success"
      )
    );
  });

  test("formats invalid and expired metadata", async () => {
    mockList.mockResolvedValue([
      {
        id: "k2", name: "bad", prefix: "fd_b", createdAt: "",
        expiresAt: "not-a-date", lastUsedAt: "also-bad",
      },
      {
        id: "k3", name: "old", prefix: "fd_c", createdAt: "",
        expiresAt: "2000-01-01T00:00:00.000Z", lastUsedAt: "2000-01-01T00:00:00.000Z",
      },
    ]);
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={jest.fn()} />);
    expect(await screen.findByText(/bad/)).toBeInTheDocument();
    expect(screen.getAllByText(/尚未使用/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/已过期/).length).toBeGreaterThan(0);
  });

  test("copy failure notifies error", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("clipboard"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await screen.findByText(strings.apiNoKeys);
    fireEvent.click(screen.getAllByRole("button", { name: strings.copyUsage })[0]);
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("copyFailed2"), "error")
    );
  });

  test("create with preset expiry calls correct hours", async () => {
    mockCreate.mockResolvedValue({
      id: "k4", name: "k", prefix: "fd_", createdAt: "", expiresAt: null, key: "fd_k4",
    });
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await screen.findByText(strings.apiNoKeys);
    fireEvent.change(screen.getByLabelText(strings.apiKeyName), { target: { value: "k" } });
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText(strings.apiExpiry1d));
    fireEvent.click(screen.getByRole("button", { name: strings.createApiKey }));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({ name: "k", expiresInHours: 24, key: undefined });
      expect(onNotify).toHaveBeenCalledWith(translate("keyCreatedToast"), "success");
    });
  });

  test("create failure notifies error", async () => {
    mockCreate.mockRejectedValue(new Error("create-fail"));
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await screen.findByText(strings.apiNoKeys);
    fireEvent.change(screen.getByLabelText(strings.apiKeyName), { target: { value: "k" } });
    fireEvent.click(screen.getByRole("button", { name: strings.createApiKey }));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("create-fail", "error"));
  });

  test("revoke failure notifies and reloads", async () => {
    mockList.mockResolvedValue([
      { id: "k5", name: "key5", prefix: "fd_", createdAt: "", expiresAt: null },
    ]);
    mockRevoke.mockRejectedValue(new Error("revoke-fail"));
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await screen.findByText(/key5/);
    fireEvent.click(screen.getByText(strings.revokeApiKey));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("revoke-fail", "error"));
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  test("all curl copy buttons notify", async () => {
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await screen.findByText(strings.apiNoKeys);
    const buttonNames = [
      strings.copyCurl,
      strings.copyDownloadCurl,
      strings.copyListCurl,
      strings.copyOverwriteCurl,
      strings.copyBackupCurl,
      strings.copyDeleteCurl,
      strings.copyMkdirCurl,
    ];
    for (const name of buttonNames) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(7));
  });

  test("custom key input and created key copy", async () => {
    mockCreate.mockResolvedValue({
      id: "k6", name: "k", prefix: "fd_", createdAt: "", expiresAt: null, key: "fd_custom_secret",
    });
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await screen.findByText(strings.apiNoKeys);
    fireEvent.change(screen.getByLabelText(strings.apiKeyCustom), {
      target: { value: "my-prefix" },
    });
    fireEvent.change(screen.getByLabelText(strings.apiKeyName), { target: { value: "k" } });
    fireEvent.click(screen.getByRole("button", { name: strings.createApiKey }));
    await waitFor(() => expect(screen.getByText("fd_custom_secret")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: strings.copyApiKey }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(
        translate("copiedFormat", { label: strings.keyLabel }),
        "success"
      )
    );
  });

  test("dialog action copy usage", async () => {
    const onNotify = jest.fn();
    render(<ApiKeysPanel open onClose={jest.fn()} onNotify={onNotify} />);
    await screen.findByText(strings.apiNoKeys);
    const buttons = screen.getAllByRole("button", { name: strings.copyUsage });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(
        translate("copiedFormat", { label: strings.usageLabel }),
        "success"
      )
    );
  });
});
