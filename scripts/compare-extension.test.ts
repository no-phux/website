import { describe, expect, test } from "bun:test";
import { extendComparePage } from "./compare-extension";
import { createPageRenderer } from "./docs-markdown";

const revision = "a".repeat(40);
const versions = { protocolVersion: "1.2.3", projectVersion: "0.4.5" };
const compare = {
  repoPath: "docs/compare.md",
  abs: "/unused",
  slug: "compare",
  group: "start" as const,
  order: 5,
};
const linked = ["config", "plugins", "scripting", "clients", "concepts", "agents", "remote"].map((slug) => ({
  ...compare,
  repoPath: `docs/${slug}.md`,
  slug,
}));
const catalog = [
  compare,
  ...linked,
  { ...compare, repoPath: "docs/install.md", slug: "installation" },
];

const source = `# phux vs tmux, Herdr, and cmux

Facts were checked on 2026-10-19.

| Clients | terminal UI and desktop app; a browser client to build on; phone apps in progress |
| --- | --- |

## Next

- [Install](./install.md)
`;

describe("compare page extension", () => {
  test("adds zellij, WezTerm, and Rex, and drops the phone-app phrase", () => {
    const text = createPageRenderer(catalog, revision, versions)(source, compare);
    expect(text).toContain("2026-10-19");
    expect(text).toContain("checked on 2026-10-27");
    expect(text).toContain("## Compared with zellij and WezTerm");
    expect(text).toContain("## phux and Rex");
    expect(text).not.toContain("If you want an open-source option");
    expect(text).toContain("## Where phux isn't the answer");
    expect(text.indexOf("## phux and Rex")).toBeLessThan(text.indexOf("\n## Next\n"));
    expect(text.indexOf("| zellij | WezTerm | phux |")).toBeGreaterThan(0);
    expect(text).toContain(`https://github.com/no-phux/phux/blob/${revision}/LICENSE`);
    expect(text).toContain("[Scripting](/scripting)");
    expect(text).toContain("[Remote machines](/remote)");
    expect(text).toContain("[Install](/installation)");
    expect(text).toContain("[What survives what](/concepts#what-survives-what)");
    expect(text).toContain("[Concepts](/concepts#clients)");
    expect(text).toContain("[Remote machines](/remote#who-can-do-what)");
    expect(text).not.toContain("github.com/no-phux/phux/tree/");
    expect(text).toContain("Apache-2.0");
    expect(text).toContain("A terminal multiplexer whose server you can drive from code.");
    expect(text).toContain("wezterm.plugin.require");
    expect(text).toContain("https://wezterm.org/config/plugins.html");
    expect(text).toContain(
      "Several clients can show one session at once. A machine you pair can do everything you can.",
    );
    expect(text).toContain("true multiplayer collaboration");
    expect(text).toContain("sharing a live session with other people is built in from the start");
    expect(text).not.toContain("is still a young feature and is evolving rapidly");
    expect(text).toContain("native macOS/iOS applications");
    expect(text).not.toContain("phone");
    expect(text).not.toMatch(/Rex but better|better than Rex/i);
    expect(text).not.toMatch(/TestFlight|iPhone|Android|seamless|supercharge|revolutionize|\bunlock\b|10x/i);
    expect(text).not.toMatch(/phux.{0,80}iOS|iOS.{0,80}phux/s);
  });

  test("does not rewrite a different page", () => {
    const clients = { ...compare, repoPath: "docs/clients.md", slug: "clients", group: "connect" as const };
    const raw = "# Clients\n\nThe terminal UI.\n\n## Phones\n\nphone apps in progress\n";
    const text = createPageRenderer([clients], revision, versions)(raw, clients);
    expect(text).toContain("phone apps in progress");
    expect(text).not.toContain("zellij");
  });

  test("appends the extension when the source has no Next section", () => {
    const text = extendComparePage("# Compare\n\nIntro.\n\n## Compared with tmux\n\nText.\n", revision);
    expect(text.trimEnd().endsWith("built in from the start.")).toBe(true);
  });
});
