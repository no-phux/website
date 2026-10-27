import { describe, expect, test } from "bun:test";
import { DOCS_PREFIXES } from "../host/routes";
import { rootNavigation } from "./docs-output";
import { loadSitePages, SITE_PAGE_CATALOG } from "./site-pages";

const FORBIDDEN = [
  "TestFlight",
  "iPhone",
  "Android",
  "iOS",
  "phone app",
  "mobile app",
  "revolutionize",
  "supercharge",
  "seamless",
  "unlock",
  "10x",
];

describe("website task guides", () => {
  test("publishes four guides ahead of the deeper pages they link", async () => {
    const pages = await loadSitePages();
    expect(pages.map(({ slug }) => slug)).toEqual(["pane-command", "agent-waiting", "terminal-mcp", "tailscale"]);
    for (const page of pages) {
      expect(page.description.length).toBeLessThanOrEqual(160);
      expect(page.description.endsWith("...")).toBe(false);
      expect(page.summary).not.toContain("`");
      const text = `${page.title}\n${page.summary}\n${page.description}\n${page.body}`;
      for (const phrase of FORBIDDEN) {
        expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
      expect((DOCS_PREFIXES as readonly string[]).includes(`/${page.slug}`)).toBe(true);
    }
    expect(rootNavigation([], new Set())).toEqual([
      "---Get started---", "overview",
      "---Automate---", "pane-command", "agent-waiting", "terminal-mcp",
      "---Machines and clients---", "tailscale",
    ]);
    expect(SITE_PAGE_CATALOG.map(({ slug }) => slug)).not.toContain("mcp");
  });
});
