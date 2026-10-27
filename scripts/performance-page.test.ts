import { describe, expect, test } from "bun:test";
import { inlineMarkdown, measurementsSection, performanceMarkdown } from "../src/lib/performance-page";

const compare = `# phux vs tmux

## What survives what

Programs keep running.

## Measurements

On 2026-09-30, two runs compared clients. See [run 1](https://phux.sh/benchmarks/2026-09-30/run1/samples.json).

## Next

- [Install](./install.md)
`;

describe("performance page", () => {
  test("lifts the measurements section and nothing around it", () => {
    expect(measurementsSection(compare)).toBe(
      "On 2026-09-30, two runs compared clients. See [run 1](https://phux.sh/benchmarks/2026-09-30/run1/samples.json).",
    );
    expect(measurementsSection("# No measurements\n\nNone.\n")).toBeUndefined();
  });

  test("renders published links and escapes the rest", () => {
    const html = inlineMarkdown(measurementsSection(compare)!);
    expect(html).toContain('<a href="https://phux.sh/benchmarks/2026-09-30/run1/samples.json">run 1</a>');
    expect(inlineMarkdown("a <script> & [x](javascript:alert)")).toBe("a &lt;script&gt; &amp; x");
  });

  test("the markdown twin quotes the measurements and points at the comparison", () => {
    const markdown = performanceMarkdown(measurementsSection(compare), "https://github.com/no-phux/phux/blob/main/docs/compare.md");
    expect(markdown).toContain('url: "https://docs.phux.sh/performance"');
    expect(markdown).toContain("On 2026-09-30");
    expect(markdown).toContain("](/compare)");
    expect(performanceMarkdown(undefined, "https://github.com/no-phux/phux/blob/main/docs/compare.md")).toContain(
      "Measurements are published with the comparison.",
    );
  });
});
