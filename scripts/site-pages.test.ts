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
    const bySlug = new Map(pages.map((page) => [page.slug, page]));
    expect(bySlug.get("agent-waiting")?.title).toBe("Know when Claude Code or Codex is waiting for you");
    expect(bySlug.get("agent-waiting")?.body).toContain("## Many agents at once");
    expect(bySlug.get("agent-waiting")?.body).toContain("phux agent list --json");
    expect(bySlug.get("agent-waiting")?.body).toContain("phux wait --until");
    expect(bySlug.get("agent-waiting")?.body).toContain("phux wait --idle");
    expect(bySlug.get("agent-waiting")?.body).toContain("phux watch --json");
    expect(bySlug.get("pane-command")?.title).toBe("Run a command in a tmux pane and get its output and exit code");
    expect(bySlug.get("pane-command")?.description).toBe("Run a command in a tmux pane with send-keys, wait-for, and capture-pane. phux run prints the output and exits with the command's status.");
    const pane = bySlug.get("pane-command")?.body ?? "";
    expect(pane.indexOf("tmux send-keys")).toBeGreaterThan(-1);
    expect(pane.indexOf("tmux send-keys")).toBeLessThan(pane.indexOf("phux run --timeout"));
    expect(pane).toContain("tmux wait-for cmd-done");
    expect(pane).toContain("capture-pane -p -S -");
    expect(pane).toContain("sh, bash, zsh, and fish");
    expect(pane).toContain("## Coming from tmux");
    expect(pane.indexOf("## Coming from tmux")).toBeGreaterThan(pane.indexOf("phux run --timeout"));
    expect(pane).toContain("phux send-keys");
    expect(bySlug.get("pane-command")?.body).toContain("phux snapshot");
    expect(bySlug.get("pane-command")?.body).toContain("phux kill --server");
    expect(bySlug.get("terminal-mcp")?.body.startsWith("phux is a terminal multiplexer with a built-in MCP server (`phux mcp`).\n")).toBe(true);
    expect(bySlug.get("terminal-mcp")?.body).toContain("`phux_snapshot`");
    expect(bySlug.get("terminal-mcp")?.body).toContain("`phux_agent_wait`");
    expect(bySlug.get("terminal-mcp")?.body).not.toContain("`phux_operation_status`");
    expect(bySlug.get("tailscale")?.title).toBe("Reach your coding agents over Tailscale and SSH");
    expect(bySlug.get("tailscale")?.summary.startsWith("Reach the coding agents on another machine over Tailscale")).toBe(true);
  });
});
