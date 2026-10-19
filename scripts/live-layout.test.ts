import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/components/prototype/vgpu/live/live.css", import.meta.url), "utf8");
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
const keyframes = new Map([...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)].map(([, name, body]) => [name, body]));

test("no CSS animation holds a glass pane's transform: the spring layout owns it", () => {
  const glass = rules.filter((rule) => /\.live-(glass|primary|secondary)\b/.test(rule.selector) && /(^|;)\s*animation\s*:/.test(rule.body));
  for (const rule of glass) {
    const names = [...rule.body.matchAll(/animation\s*:\s*([^;]+)/g)].flatMap(([, value]) => value.split(",").map((part) => part.trim().split(/\s+/)[0]));
    for (const name of names) if (name !== "none") expect(keyframes.get(name) ?? "", `${rule.selector} animates ${name}`).not.toMatch(/transform/);
  }
});

test("the embedded hero fills its frame, so the page never reflows as the session connects", () => {
  expect(css).toContain(".embedded-home .vibe-stage.live-session-stage{min-height:100svh}");
});

test("the connecting placeholder takes the live terminal's height at every breakpoint", () => {
  const heights = rules.filter((rule) => rule.selector.includes(".live-primary :is(.live-pane-preview,.live-connection-state)"));
  expect(heights.length).toBe(3);
  expect(rules.some((rule) => rule.selector === ".live-connection-state" && /height\s*:/.test(rule.body))).toBe(false);
});
