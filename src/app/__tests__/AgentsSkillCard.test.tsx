import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import AgentsSkillCard from "../../AgentsSkillCard";
import { MCP_API_KEY_ENV } from "../agentsSkill";
import { setLang, strings } from "../strings";

describe("AgentsSkillCard", () => {
  beforeEach(() => {
    setLang("en");
    vi.restoreAllMocks();
  });

  test("renders preview with origin MCP URL and no raw key", () => {
    render(
      <AgentsSkillCard origin="https://drive.example.com" onNotify={vi.fn()} />
    );
    expect(screen.getByTestId("agents-skill-card")).toBeInTheDocument();
    expect(screen.getByText(strings.agentsSkillTitle)).toBeInTheDocument();
    expect(screen.getByText(strings.agentsSkillVsMcpHint)).toBeInTheDocument();

    const preview = screen.getByTestId("agents-skill-preview").textContent || "";
    expect(preview).toContain("name: davflare");
    // Preview is truncated; origin still appears in Auth settings URL.
    expect(preview).toContain("https://drive.example.com/#/settings");
    expect(preview).not.toMatch(/\bfd_[A-Za-z0-9_-]{8,}\b/);
  });

  test("copy skill writes full markdown and notifies", async () => {
    const onNotify = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <AgentsSkillCard origin="https://drive.example.com" onNotify={onNotify} />
    );
    fireEvent.click(screen.getByTestId("agents-skill-copy"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    const pasted = writeText.mock.calls[0][0] as string;
    expect(pasted).toContain("https://drive.example.com/mcp");
    expect(pasted).toContain(`\${env:${MCP_API_KEY_ENV}}`);
    expect(pasted).toContain("publish_site");
    expect(onNotify).toHaveBeenCalledWith(strings.agentsSkillCopied, "success");
  });
});
