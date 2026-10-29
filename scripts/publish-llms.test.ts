import { describe, expect, test } from "bun:test";
import { llmsTxtForBuild } from "./publish-llms";

const building = "- [Build on phux](https://docs.phux.sh/building): the entry point for building on phux (CLI --json, MCP, watch, wire protocol, OSC 7501, plugins).";
const status = "- [Any program can report status](https://docs.phux.sh/any-program-status): a program in a pane reports what it is doing with one OSC 7501 sequence, with no phux library, socket, or hook.";
const source = `# phux

- [Automation reference](https://docs.phux.sh/scripting): selectors, input, waits, and structured results.
${building}
${status}
- [Wire protocol](https://docs.phux.sh/protocol): framing, terminal substrate, and metadata.
`;

describe("published llms.txt", () => {
  test("keeps a gated line when that page is in the build", () => {
    expect(llmsTxtForBuild(source, new Set(["building", "any-program-status"]))).toBe(source);
  });

  test("omits each gated line on its own when that page was not synced", () => {
    const buildingOnly = llmsTxtForBuild(source, new Set(["building"]));
    expect(buildingOnly).toContain("https://docs.phux.sh/building");
    expect(buildingOnly).not.toContain("https://docs.phux.sh/any-program-status");
    expect(buildingOnly).toContain("https://docs.phux.sh/scripting");
    expect(buildingOnly).toContain("https://docs.phux.sh/protocol");

    const statusOnly = llmsTxtForBuild(source, new Set(["any-program-status"]));
    expect(statusOnly).not.toContain("https://docs.phux.sh/building)");
    expect(statusOnly).toContain("https://docs.phux.sh/any-program-status");

    const neither = llmsTxtForBuild(source, new Set());
    expect(neither).not.toContain("https://docs.phux.sh/building");
    expect(neither).not.toContain("https://docs.phux.sh/any-program-status");
    expect(neither).toContain("https://docs.phux.sh/protocol");
    expect(neither).not.toMatch(/\n\n\n/);
  });
});
