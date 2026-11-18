import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODE, PREVIEW, modeTokens, parseTokenCss, previewDeclarations, tokenNames, tokensFor } from "../src/lib/token-css";

const root = join(import.meta.dir, "..");
const source = readFileSync(join(root, "src/styles/brand-tokens.css"), "utf8");
const rules = parseTokenCss(source);
const hex = /^#[0-9A-F]{6}([0-9A-F]{2})?$/;

describe("brand token stylesheet", () => {
  test("parses rules inside at-rules and skips comments and @theme", () => {
    const parsed = parseTokenCss(`/* a { --x: 1; } */
:root { --a: #000; color-scheme: dark; }
@media (prefers-color-scheme: light) { :root { --a: #fff; } }
@theme inline { --color-a: var(--a); }`);
    expect(parsed).toEqual([
      { at: [], selector: ":root", props: { "--a": "#000" } },
      { at: ["@media (prefers-color-scheme: light)"], selector: ":root", props: { "--a": "#fff" } },
    ]);
  });

  test("every mode the site relies on is emitted with an opaque ground", () => {
    for (const mode of Object.keys(MODE) as (keyof typeof MODE)[]) {
      const { selector, at } = MODE[mode];
      expect(Object.keys(tokensFor(rules, selector, at)).length).toBeGreaterThan(50);
      expect(modeTokens(rules, mode)["--phux-layer-ground"]).toMatch(hex);
    }
  });

  test("the accessibility blocks the design page previews exist", () => {
    for (const block of Object.keys(PREVIEW) as (keyof typeof PREVIEW)[]) {
      expect(previewDeclarations(rules, block)).toContain("--phux-text-text:");
    }
    expect(previewDeclarations(rules, "forced")).toContain("--phux-layer-ground: Canvas;");
  });

  test("the reader variant keeps its paper and ink", () => {
    const light = modeTokens(rules, "readerLight");
    expect(light["--phux-layer-ground"]).toBe("#F5F5F3");
    expect(light["--phux-text-text"]).toBe("#121310");
    expect(light["--phux-type-lead-size"]).toBe("0.9375rem");
  });

  test("the site's stylesheets only name tokens the brand defines", () => {
    const defined = new Set(tokenNames(rules));
    const stylesheets = [
      "src/styles/global.css",
      "src/styles/terminal-surface.css",
      "src/styles/mobile-access.css",
      "src/styles/privacy.css",
      "src/styles/reader/tokens.css",
      "src/styles/reader/shell.css",
      "src/styles/reader/prose.css",
      "src/styles/reader/overview.css",
      "src/styles/reader/search.css",
      "src/styles/reader/narrow.css",
      "src/pages/index.astro",
      "src/pages/[design].astro",
      "src/layouts/BaseLayout.astro",
    ];
    const missing: string[] = [];
    for (const path of stylesheets) {
      const text = readFileSync(join(root, path), "utf8");
      for (const [, name] of text.matchAll(/var\((--phux-[a-z0-9-]+)/g)) {
        // `--phux-type-${role}-size` in a template names a family; the page renders each member.
        if (name!.endsWith("-")) continue;
        if (!defined.has(name!)) missing.push(`${path}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
