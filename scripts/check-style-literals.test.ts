import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ART_HEADER, compare, countLiterals, scan } from "./check-style-literals";

describe("style literal ratchet", () => {
  test("counts every raw literal family", () => {
    const css = [
      ".a { color: #fff; background: #12345678; }",
      ".b { border-radius: 6px; box-shadow: 0 1px 2px black; font-size: 14px; }",
      ".c { transition: opacity .2s cubic-bezier(.2,.9,.25,1), transform 120ms; }",
      ".d { padding-left: 4px; margin-right: 0; left: 0; }",
    ].join("\n");
    // 2 hex, radius, shadow, font size, bezier, 2 durations, 2 physical properties, 1 offset.
    expect(countLiterals("src/x.css", css)).toBe(11);
  });

  test("token references and logical properties are clean", () => {
    const css = [
      ".a { color: var(--phux-text-text); border-radius: var(--phux-radius-md); }",
      ".b { transition: opacity var(--phux-motion-fade-duration) var(--phux-motion-fade-easing); }",
      ".c { padding-inline-start: var(--phux-space-s2); inset-inline-end: 0; text-align: left; }",
      ".d { font-size: var(--phux-type-body-size); box-shadow: var(--phux-elevation-raised); }",
      ".e:focus-visible { outline: 2px solid var(--phux-border-focus); }",
      ".f { --padding-left: 0px; }",
    ].join("\n");
    expect(countLiterals("src/x.css", css)).toBe(0);
  });

  test("entities, anchors and script offsets are not literals", () => {
    expect(countLiterals("src/x.astro", '<a href="#main">&#39;</a>')).toBe(0);
    expect(countLiterals("src/x.ts", "const box = { left: 0, right: 4 };")).toBe(0);
    expect(countLiterals("src/x.ts", 'el.style.color = "#c0ffee";')).toBe(1);
  });

  test("fails on a rise or a new file, reports a fall", () => {
    const verdict = compare({ "src/a.css": 3, "src/b.css": 2 }, { "src/a.css": 4, "src/b.css": 1, "src/c.css": 1 });
    expect(verdict.regressions).toEqual([
      "src/a.css: 4 raw style literals (baseline 3)",
      "src/c.css: 1 raw style literals (baseline 0)",
    ]);
    expect(verdict.reductions).toEqual(["src/b.css: 1 (baseline 2)"]);
  });

  test("owner files, illustration scenes and tests are exempt", () => {
    const root = mkdtempSync(join(tmpdir(), "style-literals-"));
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    write("src/styles/brand-tokens.css", ":root { --x: #fff; }");
    write("src/styles/reader/tokens.css", ":root { --y: #000; }");
    write("src/components/motion/Scene.css", `/* ${ART_HEADER} */\n.s { fill: #abc; }`);
    write("src/components/motion/Plain.css", ".s { fill: #abc; }");
    write("src/components/prototype/vgpu/lab.css", `/* ${ART_HEADER} */\n.l { color: #abc; }`);
    write("src/components/fox/scene.ts", `// ${ART_HEADER}\nlight("#fff");`);
    // The header only exempts files under an art root.
    write("src/components/Card.css", `/* ${ART_HEADER} */\n.c { color: #abc; }`);
    write("src/lib/x.test.ts", 'expect("#fff")');
    write("src/pages/a.astro", "<style>.a { color: #fff; }</style>");
    expect(scan(root)).toEqual({ "src/components/Card.css": 1, "src/components/motion/Plain.css": 1, "src/pages/a.astro": 1 });
  });
});
