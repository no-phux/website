// Raw-style-literal ratchet (design spec §5.1, DESIGN_SYSTEM.md "Guardrails").
//
// Colours, radii, easings, durations, shadows and pixel type sizes belong in
// the generated brand tokens (src/styles/brand-tokens.css). This check counts
// raw literals per file under src/ and fails when any file's count rises above
// scripts/style-literals.baseline.json or a new file gains one. Counts that
// fall are reported, never written: only a cleanup commit rewrites the
// baseline (`bun run scripts/check-style-literals.ts --write-baseline`).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

export type Counts = Record<string, number>;

const SCANNED = new Set([".css", ".astro", ".ts", ".tsx"]);

/** Token-owning files, where literals are the definition. */
export const OWNER_PATHS = new Set(["src/styles/brand-tokens.css", "src/styles/reader/tokens.css"]);

/** Illustration scenes may keep literals when they carry this header. */
export const ART_HEADER = "style-literals: illustration";
const ART_ROOTS = ["src/components/motion/"];

type Rule = { name: string; pattern: RegExp; css?: true };

/** Physical inline properties only make sense in stylesheets and Astro styles. Custom
 *  properties (a third party's `--padding-left`) are names, not properties. */
export const RULES: Rule[] = [
  { name: "hex colour", pattern: /(?<![&\w])#[0-9a-fA-F]{3,8}\b/g },
  { name: "pixel radius", pattern: /border-radius:\s*[0-9]+px/g },
  { name: "cubic-bezier", pattern: /cubic-bezier\(/g },
  { name: "box-shadow literal", pattern: /box-shadow:\s*[0-9]/g },
  { name: "pixel font size", pattern: /font-size:\s*[0-9.]+px/g },
  { name: "physical inline property", pattern: /(?<![-\w])(?:padding|margin|border)-(?:left|right)\b/g, css: true },
  { name: "physical inline offset", pattern: /(?<![-\w])(?:left|right)\s*:(?!:)/g, css: true },
];

/** `transition`/`animation` declarations, whose values may not carry raw durations. */
const MOTION_DECLARATION = /\b(?:transition|animation)(?:-duration|-delay)?\s*:\s*([^;}{"'`]*)/g;
const DURATION = /(?<![\w.-])[0-9]*\.?[0-9]+m?s\b/g;

export function isOwner(path: string): boolean {
  return OWNER_PATHS.has(path);
}

export function isArt(path: string, source: string): boolean {
  return ART_ROOTS.some((root) => path.startsWith(root)) && source.slice(0, 2048).includes(ART_HEADER);
}

function isStylesheet(path: string): boolean {
  return path.endsWith(".css") || path.endsWith(".astro");
}

function matches(pattern: RegExp, text: string): number {
  return text.match(pattern)?.length ?? 0;
}

/** Counts the raw style literals in one file's source. */
export function countLiterals(path: string, source: string): number {
  let total = 0;
  for (const rule of RULES) {
    if (rule.css && !isStylesheet(path)) continue;
    total += matches(rule.pattern, source);
  }
  for (const declaration of source.matchAll(MOTION_DECLARATION)) {
    total += matches(DURATION, declaration[1] ?? "");
  }
  return total;
}

function scannable(path: string): boolean {
  if (!SCANNED.has(extname(path))) return false;
  return !/\.test\.tsx?$/.test(path) && !path.endsWith(".d.ts");
}

function* walk(root: string, dir: string): Generator<string> {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(root, path);
    else if (scannable(path)) yield path.split(sep).join("/");
  }
}

/** Per-file literal counts under `src/`, skipping owner and illustration files. */
export function scan(root: string): Counts {
  const counts: Counts = {};
  for (const path of walk(root, "src")) {
    if (isOwner(path)) continue;
    const source = readFileSync(join(root, path), "utf8");
    if (isArt(path, source)) continue;
    const count = countLiterals(path, source);
    if (count > 0) counts[path] = count;
  }
  return counts;
}

export type Verdict = { regressions: string[]; reductions: string[] };

/** Compares a scan with the committed baseline. */
export function compare(baseline: Counts, current: Counts): Verdict {
  const regressions: string[] = [];
  const reductions: string[] = [];
  for (const [path, count] of Object.entries(current).sort()) {
    const allowed = baseline[path] ?? 0;
    if (count > allowed) regressions.push(`${path}: ${count} raw style literals (baseline ${allowed})`);
  }
  for (const [path, allowed] of Object.entries(baseline).sort()) {
    const count = current[path] ?? 0;
    if (count < allowed) reductions.push(`${path}: ${count} (baseline ${allowed})`);
  }
  return { regressions, reductions };
}

export function sorted(counts: Counts): Counts {
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function main(): void {
  const root = join(import.meta.dir, "..");
  const baselinePath = join(import.meta.dir, "style-literals.baseline.json");
  const current = scan(root);
  const total = Object.values(current).reduce((sum, count) => sum + count, 0);
  if (process.argv.includes("--write-baseline")) {
    writeFileSync(baselinePath, `${JSON.stringify(sorted(current), null, 2)}\n`);
    console.log(`style literals: baseline written (${total} in ${Object.keys(current).length} files)`);
    return;
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Counts;
  const { regressions, reductions } = compare(baseline, current);
  if (reductions.length > 0) {
    console.log(`style literals: below baseline, rewrite it in the cleanup commit:\n  ${reductions.join("\n  ")}`);
  }
  if (regressions.length > 0) {
    console.error(
      `style literals: use the brand tokens (var(--phux-*)) instead of raw values:\n  ${regressions.join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log(`style literals: ${total} in ${Object.keys(current).length} files (${relative(root, baselinePath)})`);
}

if (import.meta.main) main();
