import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);

const TabRules = nodeRequire("../../../extension/tabRules.js") as {
  COLORS: string[];
  compile: (rule: Record<string, unknown>) => ((tab: unknown) => boolean) | null;
  firstMatch: (model: unknown, tab: unknown) => Record<string, unknown> | null;
  normalize: (raw: unknown) => {
    fallbackDomain: boolean;
    rules: Array<Record<string, unknown>>;
  };
  planGroups: (
    listOrModel: unknown,
    tabs: unknown[]
  ) => Array<{ kind: string; title: string; color: string; collapsed: boolean; tabIds: number[] }>;
  remove: (list: unknown, id: string) => { rules: Array<Record<string, unknown>> };
  upsert: (list: unknown, rule: Record<string, unknown>) => {
    fallbackDomain: boolean;
    rules: Array<Record<string, unknown>>;
  };
};

function tab(id: number, url: string, title = "") {
  return { id, url, title };
}

describe("extension/tabRules.js model", () => {
  test("normalizes rules, validates colors, keeps the fallback flag, drops junk", () => {
    const model = TabRules.normalize({
      fallbackDomain: false,
      rules: [
        { id: "r1", domain: "github.com", title: "code", color: "nope", order: 2 },
        { title: "no criteria" },
        null,
      ],
    });
    expect(model.fallbackDomain).toBe(false);
    expect(model.rules).toHaveLength(1);
    expect(model.rules[0]).toMatchObject({ id: "r1", color: "grey", order: 2 });

    expect(TabRules.normalize(null)).toEqual({
      version: 1,
      fallbackDomain: true,
      rules: [],
    });
    // rows without any usable criterion are dropped outright
    expect(
      TabRules.normalize({ rules: [null, { title: "no criteria" }] }).rules
    ).toEqual([]);
  });

  test("upsert replaces by id, appends otherwise, and sorts by priority", () => {
    let list = TabRules.upsert({ rules: [] }, { id: "b", domain: "b.dev", title: "B", order: 2 });
    list = TabRules.upsert(list, { id: "a", domain: "a.dev", title: "A", order: 1 });
    expect(list.rules.map((r) => r.id)).toEqual(["a", "b"]);

    list = TabRules.upsert(list, { id: "b", domain: "b2.dev", title: "B2", order: 0 });
    expect(list.rules.map((r) => r.title)).toEqual(["B2", "A"]);
    expect(TabRules.remove(list, "a").rules.map((r) => r.id)).toEqual(["b"]);
  });
});

describe("extension/tabRules.js compile", () => {
  test("a rule with no criteria compiles to null", () => {
    expect(TabRules.compile({ title: "empty" })).toBeNull();
  });

  test("invalid regex disables the rule instead of throwing", () => {
    expect(TabRules.compile({ regex: "([unclosed" })).toBeNull();
  });

  test("domain matches the exact host and subdomains only", () => {
    const isGithub = TabRules.compile({ domain: "github.com" })!;
    expect(isGithub(tab(1, "https://github.com/a"))).toBe(true);
    expect(isGithub(tab(2, "https://api.github.com/v3"))).toBe(true);
    expect(isGithub(tab(3, "https://notgithub.com"))).toBe(false);
    expect(isGithub(tab(4, "https://example.com"))).toBe(false);
    expect(isGithub(tab(5, "chrome://settings"))).toBe(false);
  });

  test("criteria combine with AND; title matching is case-insensitive", () => {
    const strict = TabRules.compile({
      domain: "example.com",
      titleIncludes: "PROD",
    })!;
    expect(strict(tab(1, "https://example.com", "Console (PROD)"))).toBe(true);
    expect(strict(tab(2, "https://example.com", "console (prod)"))).toBe(true);
    expect(strict(tab(7, "https://example.com", "staging"))).toBe(false);
    expect(strict(tab(8, "https://other.com", "Console (PROD)"))).toBe(false);

    const urlHit = TabRules.compile({ urlIncludes: "/pulls" })!;
    expect(urlHit(tab(3, "https://git.dev/pulls/1"))).toBe(true);
    expect(urlHit(tab(4, "https://git.dev/issues/1"))).toBe(false);

    const re = TabRules.compile({ regex: "^https://s\\.dev/[0-9]+" })!;
    expect(re(tab(5, "https://s.dev/123"))).toBe(true);
    expect(re(tab(6, "https://s.dev/abc"))).toBe(false);
  });
});

describe("extension/tabRules.js planGroups", () => {
  const model = TabRules.normalize({
    rules: [
      { id: "r1", domain: "github.com", title: "Code", color: "blue", collapsed: true },
      { id: "r2", urlIncludes: "jira", title: "Work", color: "green" },
    ],
  });

  test("matched tabs follow rule order; unmatched group by domain when fallback is on", () => {
    const tabs = [
      tab(1, "https://github.com/a"),
      tab(2, "https://jira.corp.io/b"),
      tab(3, "https://news.ycombinator.com"),
      tab(4, "https://news.ycombinator.com/x"),
      tab(5, "chrome://settings"),
      tab(6, "https://github.com/c"),
    ];
    const plans = TabRules.planGroups(model, tabs);
    expect(plans).toEqual([
      { kind: "rule", title: "Code", color: "blue", collapsed: true, tabIds: [1, 6] },
      { kind: "rule", title: "Work", color: "green", collapsed: false, tabIds: [2] },
      { kind: "domain", title: "news.ycombinator.com", color: "grey", collapsed: false, tabIds: [3, 4] },
    ]);
  });

  test("with fallback off, unmatched tabs stay ungrouped", () => {
    const noFallback = TabRules.normalize({ fallbackDomain: false, rules: model.rules });
    const plans = TabRules.planGroups(noFallback, [
      tab(1, "https://github.com/a"),
      tab(2, "https://other.dev"),
    ]);
    expect(plans).toEqual([
      { kind: "rule", title: "Code", color: "blue", collapsed: true, tabIds: [1] },
    ]);
  });

  test("firstMatch returns the first matching rule object", () => {
    const hit = TabRules.firstMatch(model, tab(1, "https://github.com/x"));
    expect(hit && hit.id).toBe("r1");
    expect(TabRules.firstMatch(model, tab(2, "https://nothing.dev"))).toBeNull();
  });
});
