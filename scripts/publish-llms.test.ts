import { describe, expect, test } from "bun:test";
import { llmsTxtForBuild } from "./publish-llms";

const source = `# phux

- [Automation reference](https://docs.phux.sh/scripting): selectors, input, waits, and structured results.
- [Build on phux](https://docs.phux.sh/building): the entry point for building on phux (CLI --json, MCP, watch, wire protocol, OSC 7501, plugins).
- [Wire protocol](https://docs.phux.sh/protocol): framing, terminal substrate, and metadata.
`;

describe("published llms.txt", () => {
  test("keeps the builder line when /building is in the build", () => {
    expect(llmsTxtForBuild(source, true)).toBe(source);
  });

  test("omits the builder line when /building was not synced", () => {
    const published = llmsTxtForBuild(source, false);
    expect(published).not.toContain("https://docs.phux.sh/building");
    expect(published).toContain("https://docs.phux.sh/scripting");
    expect(published).toContain("https://docs.phux.sh/protocol");
    expect(published).not.toMatch(/\n\n\n/);
  });
});
