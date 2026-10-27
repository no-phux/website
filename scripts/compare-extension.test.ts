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

const source = `# phux vs tmux, Herdr, and cmux

Facts were checked on 2026-10-19.

| Clients | terminal UI and desktop app; a browser client to build on; phone apps in progress |
| --- | --- |

## Next

- [Install](./install.md)
`;

describe("compare page extension", () => {
  test("adds zellij, WezTerm, and an open-source option, and drops the phone-app phrase", () => {
    const text = createPageRenderer([compare], revision, versions)(source, compare);
    expect(text).toContain("2026-10-19");
    expect(text).toContain("checked on 2026-10-27");
    expect(text).toContain("## Compared with zellij and WezTerm");
    expect(text).toContain("## If you want an open-source option");
    expect(text).toContain("## Where phux isn't the answer");
    expect(text.indexOf("## If you want an open-source option")).toBeLessThan(text.indexOf("\n## Next\n"));
    expect(text.indexOf("| zellij | WezTerm | phux |")).toBeGreaterThan(0);
    expect(text).toContain(`https://github.com/no-phux/phux/blob/${revision}/LICENSE`);
    expect(text).toContain("Apache-2.0");
    expect(text).toContain("phux does not claim live multi-person session sharing");
    expect(text).toContain("is still a young feature and is evolving rapidly");
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
    expect(text.trimEnd().endsWith("phux does not claim that.")).toBe(true);
  });
});
