import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import AuthThumbnail from "../../AuthThumbnail";
import { authFetch } from "../auth";

jest.mock("../auth", () => ({
  authFetch: jest.fn(),
}));

jest.mock("../../MimeIcon", () => ({
  __esModule: true,
  default: () => <span data-testid="mime-icon-fallback" />,
}));

const mockAuthFetch = authFetch as unknown as jest.Mock;

beforeEach(() => {
  mockAuthFetch.mockReset();
});

describe("AuthThumbnail", () => {
  test("加载失败回退到类型图标", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    render(<AuthThumbnail digest="d1" name="a.txt" contentType="text/plain" size={32} />);
    await waitFor(() => expect(screen.getByTestId("mime-icon-fallback")).toBeInTheDocument());
  });

  test("加载成功显示 objectURL 图片", async () => {
    const createObjectURL = jest.fn(() => "blob:thumb");
    const original = URL.createObjectURL;
    URL.createObjectURL = createObjectURL as any;

    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(["png"], { type: "image/png" }),
    } as unknown as Response);

    render(<AuthThumbnail digest="d2" name="a.png" contentType="image/png" size={48} />);
    await waitFor(() => expect(screen.getByAltText("a.png")).toBeInTheDocument());
    expect(createObjectURL).toHaveBeenCalled();

    URL.createObjectURL = original;
  });
});
