import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, test } from "vitest";

import {
  AGENTS_SKILL_FILENAME,
  DRIVE_ORIGIN_PLACEHOLDER,
  MCP_API_KEY_ENV,
  buildDavflareSkillMarkdown,
} from "../agentsSkill";
import { cursorEnvPlaceholder } from "../mcpExport";

describe("agentsSkill", () => {
  test("builds SKILL.md with frontmatter, MCP URL, and env placeholder", () => {
    const md = buildDavflareSkillMarkdown("https://drive.example.com");
    expect(md.startsWith("---\nname: davflare\n")).toBe(true);
    expect(md).toContain("https://drive.example.com/mcp");
    expect(md).toContain(cursorEnvPlaceholder(MCP_API_KEY_ENV));
    expect(md).toContain("publish_site");
    expect(md).toContain("image_upload");
    expect(md).toContain("share_create");
    expect(md).toContain("npx skills add fanchenggang/Davflare --skill davflare");
    expect(md).not.toMatch(/\bfd_[A-Za-z0-9_-]{8,}\b/);
    expect(md).toContain("Connect Claude / Cursor MCP");
    expect(md).toContain("Do not invent");
  });

  test("committed skills/davflare/SKILL.md matches placeholder build", () => {
    const expected = buildDavflareSkillMarkdown(DRIVE_ORIGIN_PLACEHOLDER);
    const path = resolve(__dirname, "../../../skills/davflare/SKILL.md");
    const onDisk = readFileSync(path, "utf8");
    expect(onDisk).toBe(expected);
    expect(AGENTS_SKILL_FILENAME).toBe("SKILL.md");
  });
});
