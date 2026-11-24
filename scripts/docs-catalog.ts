/** Source catalog and discovery policy for the documentation producer. */
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

/** Nav groups, in sidebar render order. */
export const GROUPS = {
  start: "Get started",
  customize: "Customize",
  automate: "Automate",
  connect: "Machines and clients",
  build: "Build for phux",
  help: "Help",
  reference: "Reference",
  internals: "Work on phux",
} as const;
type Group = keyof typeof GROUPS;

export interface Entry {
  /** Source path relative to the phux REPO root, e.g. "docs/spec/L1.md". */
  repoPath: string;
  /** Absolute path on disk to read from. */
  abs: string;
  /** Site collection slug (also the URL tail). */
  slug: string;
  group: Group;
  order: number;
  /** Title override; otherwise derived from the H1. */
  title?: string;
  /** Metadata summary override for virtual pages. */
  summary?: string;
  /** Meta description override. The visible lede stays the source summary. */
  description?: string;
}

// ── frontmatter ──────────────────────────────────────────────────────────
interface SourceFm {
  body: string;
  meta: Record<string, string>;
}

export function parseFrontmatter(raw: string): SourceFm {
  if (!raw.startsWith("---\n")) return { body: raw, meta: {} };
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return { body: raw, meta: {} };
  const block = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\n/, "");
  const meta: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return { body, meta };
}

// ── discovery ──────────────────────────────────────────────────────────────
/*
 * Each flat `docs/*.md` page places itself with its own frontmatter:
 * `group` (a GROUPS key) and numeric `order`, plus optional `slug` (default:
 * the basename), `title` and `description`. `publish: false` keeps a page off
 * the site. A flat page with neither fails discovery.
 */
/** Reading order of the generated reference pages; unlisted ones follow alphabetically. */
const REFERENCE_ORDER = [
  "cli.md", "config.md", "keys.md", "actions.md", "widgets.md", "hooks.md",
  "environment.md", "exit-codes.md", "files.md", "kinds.md", "parity.md", "deprecations.md",
];

/**
 * Directory trees walked recursively. The directory's README becomes the
 * section index (bare slug, order 0); other files sort alphabetically by
 * basename after it.
 */
const SECTION_ROOTS: { dir: string; group: Group; urlPrefix: string }[] = [
  { dir: "reference", group: "reference", urlPrefix: "reference" },
];

/** Stability values that mark a doc as internal / unpublishable. */
const EXCLUDED_STABILITY = new Set(["scratch", "draft"]);

/** Recursively list all `*.md` files under `dir` (absolute paths). */
async function walkMd(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md"));
  const out = files.map((entry) => join(dir, entry.name));
  for (const entry of entries.filter((entry) => entry.isDirectory())) {
    out.push(...await walkMd(join(dir, entry.name)));
  }
  return out;
}

/** repoPath stays docs-relative even when PHUX_DOCS_DIR overrides the source. */
function docsRepoPath(docsDir: string, abs: string): string {
  return `docs/${relative(docsDir, abs).split(/[\\/]/).join("/")}`;
}

/** Returns the exclusion reason, or null to keep the candidate. */
function exclusionReason(meta: Record<string, string>): string | null {
  if (meta.publish?.toLowerCase() === "false") return "publish:false";
  if (EXCLUDED_STABILITY.has((meta.stability ?? "").toLowerCase())) {
    return `stability:${meta.stability}`;
  }
  return null;
}

/** Numeric nav-order; absent/non-numeric values sort after explicit orders. */
function navOrder(meta: Record<string, string>): number {
  const raw = [meta["nav-order"], meta.nav_order, meta.navOrder].find((value) => value !== undefined);
  if (raw === undefined) return Infinity;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Infinity;
}

interface Candidate {
  abs: string;
  repoPath: string;
  meta: Record<string, string>;
}

interface Discovery {
  /** Excluded sources with their reason, for the sync report. */
  excluded: string[];
  /** Repo paths of excluded sources; links to them are stripped. */
  unpublished: Set<string>;
}

function candidateFromSource(docsDir: string, abs: string, raw: string, out: Discovery): Candidate | null {
  const repoPath = docsRepoPath(docsDir, abs);
  const { meta } = parseFrontmatter(raw);
  const reason = exclusionReason(meta);
  if (reason) {
    out.excluded.push(`${repoPath} (${reason})`);
    out.unpublished.add(repoPath);
    return null;
  }
  return { abs, repoPath, meta };
}

/** Flat pages take any group but `reference`, which SECTION_ROOTS owns. */
function isFlatGroup(value: string): value is Group {
  return value !== "reference" && Object.hasOwn(GROUPS, value);
}

/** Drop one pair of matching YAML quotes. */
function unquote(value: string | undefined): string | undefined {
  const m = value?.match(/^(["'])(.*)\1$/);
  return m ? m[2] : value;
}

function navPosition(repoPath: string, meta: Record<string, string>): { group: Group; order: number } {
  const { group, order } = meta;
  if (!group) throw new Error(`${repoPath}: frontmatter needs \`group\` and \`order\`, or \`publish: false\``);
  if (!isFlatGroup(group)) {
    const known = Object.keys(GROUPS).filter(isFlatGroup).join(", ");
    throw new Error(`${repoPath}: unknown group "${group}"; use one of ${known}`);
  }
  const n = Number(order);
  if (!order || !Number.isFinite(n)) throw new Error(`${repoPath}: order must be a number, got "${order ?? ""}"`);
  return { group, order: n };
}

/** Navigation placement from a flat page's own frontmatter. */
function flatEntry({ abs, repoPath, meta }: Candidate): Entry {
  const slug = unquote(meta.slug) || basename(abs, ".md");
  const entry: Entry = { repoPath, abs, slug, ...navPosition(repoPath, meta) };
  const title = unquote(meta.title);
  const description = unquote(meta.description);
  if (title) entry.title = title;
  if (description) entry.description = description;
  return entry;
}

async function discoverFlat(docsDir: string, out: Discovery): Promise<Entry[]> {
  const files = (await readdir(docsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map(({ name }) => join(docsDir, name))
    .sort((a, b) => a.localeCompare(b));
  const entries: Entry[] = [];
  for (const abs of files) {
    const candidate = candidateFromSource(docsDir, abs, await readFile(abs, "utf8"), out);
    if (candidate) entries.push(flatEntry(candidate));
  }
  return entries;
}

/** Position in REFERENCE_ORDER; unlisted files sort after the listed ones. */
function referenceRank(abs: string): number {
  const rank = REFERENCE_ORDER.indexOf(basename(abs));
  return rank === -1 ? REFERENCE_ORDER.length : rank;
}

function compareNavOrder(a: Candidate, b: Candidate): number {
  const na = navOrder(a.meta);
  const nb = navOrder(b.meta);
  if (na !== nb) return na < nb ? -1 : 1;
  const ra = referenceRank(a.abs);
  const rb = referenceRank(b.abs);
  if (ra !== rb) return ra - rb;
  return basename(a.abs).localeCompare(basename(b.abs));
}

function sectionEntry(candidate: Candidate, root: typeof SECTION_ROOTS[number], rootDir: string, nonReadme: Candidate[]): Entry {
  const relInRoot = relative(rootDir, candidate.abs).split(/[\\/]/).join("/");
  const { abs, repoPath } = candidate;
  if (basename(abs).toLowerCase() === "readme.md") {
    // Nested READMEs keep their directory as the slug tail.
    const dir = dirname(relInRoot);
    const slug = dir === "." ? root.urlPrefix : `${root.urlPrefix}/${dir}`;
    return { repoPath, abs, slug, group: root.group, order: 0 };
  }
  const slug = `${root.urlPrefix}/${relInRoot.replace(/\.md$/, "").toLowerCase()}`;
  return { repoPath, abs, slug, group: root.group, order: nonReadme.indexOf(candidate) + 1 };
}

async function discoverSection(docsDir: string, root: typeof SECTION_ROOTS[number], out: Discovery): Promise<Entry[]> {
  const rootDir = join(docsDir, root.dir);
  const files = (await walkMd(rootDir)).sort((a, b) => a.localeCompare(b));
  const kept: Candidate[] = [];
  for (const abs of files) {
    const candidate = candidateFromSource(docsDir, abs, await readFile(abs, "utf8"), out);
    if (candidate) kept.push(candidate);
  }
  const nonReadme = kept.filter(({ abs }) => basename(abs).toLowerCase() !== "readme.md");
  nonReadme.sort(compareNavOrder);
  return kept.map((candidate) => sectionEntry(candidate, root, rootDir, nonReadme));
}

/** One entry per slug; the same source may be discovered by multiple roots. */
function uniqueEntries(entries: Entry[]): Entry[] {
  const seen = new Map<string, string>();
  return entries.filter((entry) => {
    const previous = seen.get(entry.slug);
    if (previous && previous !== entry.repoPath) {
      throw new Error(`duplicate slug ${entry.slug}: ${previous} and ${entry.repoPath}`);
    }
    if (previous) return false;
    seen.set(entry.slug, entry.repoPath);
    return true;
  });
}

/** Discover public pages, with exclusion diagnostics and the unpublished sources. */
export async function discover(docsDir: string): Promise<{ entries: Entry[] } & Discovery> {
  const out: Discovery = { excluded: [], unpublished: new Set() };
  const entries = await discoverFlat(docsDir, out);
  for (const root of SECTION_ROOTS) {
    entries.push(...await discoverSection(docsDir, root, out));
  }
  return { entries: uniqueEntries(entries), ...out };
}
