import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";

import { authFetch, useAuth } from "../auth";
import { FeaturesProvider, useFeatures } from "../features";

jest.mock("../auth", () => ({
  authFetch: jest.fn(),
  useAuth: jest.fn(),
}));

const mockAuthFetch = authFetch as unknown as jest.Mock;
const mockUseAuth = useAuth as unknown as jest.Mock;

function Probe() {
  const { flags, sitesHost, config, refresh, updateFlags } = useFeatures();
  return (
    <div>
      <span data-testid="webdav">{String(flags.webdav)}</span>
      <span data-testid="host">{sitesHost ?? "none"}</span>
      <span data-testid="user">{config.username}</span>
      <button type="button" onClick={() => refresh()}>
        refresh
      </button>
      <button
        type="button"
        onClick={() => updateFlags({ webdav: false }).catch(() => {})}
      >
        patch
      </button>
    </div>
  );
}

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => (ok ? JSON.stringify(body) : "fail"),
  } as unknown as Response;
}

beforeEach(() => {
  mockAuthFetch.mockReset();
  mockUseAuth.mockReset();
});

describe("FeaturesProvider", () => {
  test("skips fetch when logged out and resets config", async () => {
    mockUseAuth.mockReturnValue({ username: null });
    render(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>
    );
    expect(screen.getByTestId("user")).toHaveTextContent("");
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  test("loads config, swallows refresh errors, and patches flags", async () => {
    mockUseAuth.mockReturnValue({ username: "alice" });
    mockAuthFetch
      .mockResolvedValueOnce(
        jsonResponse({
          username: "alice",
          publicRead: true,
          sitesHost: "sites.example.com",
          webdav: true,
        })
      )
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(
        jsonResponse({
          username: "alice",
          publicRead: false,
          sitesHost: "",
          webdav: false,
        })
      );

    render(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("alice")
    );
    expect(screen.getByTestId("host")).toHaveTextContent("sites.example.com");

    await act(async () => {
      screen.getByText("refresh").click();
    });
    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("user")).toHaveTextContent("alice");

    await act(async () => {
      screen.getByText("patch").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("webdav")).toHaveTextContent("false")
    );
    expect(screen.getByTestId("host")).toHaveTextContent("none");
  });
});
