import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import BackupCronCard from "../../BackupCronCard";
import { setLang, strings } from "../strings";

describe("BackupCronCard", () => {
  beforeEach(() => {
    setLang("en");
    vi.restoreAllMocks();
  });

  test("renders push/pull previews without API keys", () => {
    render(
      <BackupCronCard origin="https://drive.example.com" onNotify={vi.fn()} />
    );
    expect(screen.getByTestId("backup-cron-card")).toBeInTheDocument();
    expect(screen.getByText(strings.backupCronTitle)).toBeInTheDocument();

    const push = screen.getByTestId("backup-cron-push-preview").textContent || "";
    expect(push).toContain("davflare sync push");
    expect(push).not.toMatch(/\bfd_/);

    const pull = screen.getByTestId("backup-cron-pull-preview").textContent || "";
    expect(pull).toContain("davflare sync pull");
    expect(pull).not.toMatch(/\bfd_/);

    const full = screen.getByTestId("backup-cron-full-preview").textContent || "";
    expect(full).toContain("https://drive.example.com");
    expect(full).toContain("DAVFLARE_SERVER");
    expect(full).not.toMatch(/\bfd_[A-Za-z0-9]/);
  });

  test("copy push line writes clipboard and notifies", async () => {
    const onNotify = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <BackupCronCard origin="https://drive.example.com" onNotify={onNotify} />
    );
    fireEvent.click(screen.getByRole("button", { name: strings.backupCronCopyPush }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    const pasted = writeText.mock.calls[0][0] as string;
    expect(pasted).toContain("davflare sync push");
    expect(pasted).not.toMatch(/\bfd_/);
    expect(onNotify).toHaveBeenCalledWith(strings.backupCronPushCopied, "success");
  });
});
