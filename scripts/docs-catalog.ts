/** Source catalog and discovery policy for the documentation producer. */
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

/** Nav groups, in sidebar render order. */
export const GROUPS = {
  start: "Get started",
  use: "Use phux",
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
/**
 * The hand-written pages, in nav order. Path is relative to DOCS_DIR.
 */
const ORIENTATION: { file: string; slug: string; group: Group; order: number }[] = [
  { file: "README.md", slug: "docs", group: "start", order: 0 },
  { file: "install.md", slug: "installation", group: "start", order: 1 },
  { file: "getting-started.md", slug: "getting-started", group: "start", order: 2 },
  { file: "concepts.md", slug: "concepts", group: "start", order: 3 },
  { file: "config.md", slug: "config", group: "use", order: 0 },
  { file: "scripting.md", slug: "scripting", group: "use", order: 1 },
  { file: "agents.md", slug: "agents", group: "use", order: 2 },
  { file: "acp.md", slug: "acp", group: "use", order: 3 },
  { file: "remote.md", slug: "remote", group: "use", order: 4 },
  { file: "clients.md", slug: "clients", group: "use", order: 5 },
  { file: "desktop-capture.md", slug: "desktop-capture", group: "use", order: 6 },
  { file: "desktop-changes.md", slug: "desktop-changes", group: "use", order: 7 },
  { file: "desktop-panes.md", slug: "desktop-panes", group: "use", order: 8 },
  { file: "troubleshooting.md", slug: "troubleshooting", group: "use", order: 9 },
  { file: "architecture.md", slug: "architecture", group: "internals", order: 0 },
  { file: "organization.md", slug: "organization", group: "internals", order: 1 },
  { file: "protocol.md", slug: "protocol", group: "internals", order: 2 },
  { file: "embedding.md", slug: "embedding", group: "internals", order: 3 },
  { file: "development.md", slug: "development", group: "internals", order: 4 },
  { file: "releasing.md", slug: "releasing", group: "internals", order: 5 },
];

/**
 * Directory trees walked recursively. The directory's README becomes the
 * section index (bare slug, order 0); other files sort alphabetically by
 * basename after it.
 */
const SECTION_ROOTS: { dir: string; group: Group; urlPrefix: string }[] = [
  { dir: "reference", group: "reference", urlPrefix: "reference" },
];

/** Repo-relative paths that must never publish. */
const DENYLIST = new Set<string>([]);

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
function exclusionReason(repoPath: string, meta: Record<string, string>): string | null {
  if (DENYLIST.has(repoPath)) return "denylist";
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

function candidateFromSource(docsDir: string, abs: string, raw: string, excluded: string[]): Candidate | null {
  const repoPath = docsRepoPath(docsDir, abs);
  const { meta } = parseFrontmatter(raw);
  const reason = exclusionReason(repoPath, meta);
  if (reason) {
    excluded.push(`${repoPath} (${reason})`);
    return null;
  }
  return { abs, repoPath, meta };
}

/** Fail at discovery, rather than silently dropping a new authored flat guide. */
async function validateFlatPages(docsDir: string, excluded: string[]): Promise<void> {
  const known = new Set(ORIENTATION.map(({ file }) => file));
  const files = (await readdir(docsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"));
  for (const { name } of files) {
    if (known.has(name)) continue;
    const abs = join(docsDir, name);
    const candidate = candidateFromSource(docsDir, abs, await readFile(abs, "utf8"), excluded);
    if (candidate) throw new Error(`uncatalogued documentation: ${candidate.repoPath}; add it to ORIENTATION and navigation`);
  }
}

async function discoverOrientation(docsDir: string, excluded: string[]): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (const { file, ...page } of ORIENTATION) {
    const abs = join(docsDir, file);
    // Orientation files historically warn and skip when absent.
    let raw: string;
    try {
      raw = await readFile(abs, "utf8");
    } catch {
      console.warn(`  skip (missing): docs/${file}`);
      continue;
    }
    const candidate = candidateFromSource(docsDir, abs, raw, excluded);
    if (candidate) entries.push({ repoPath: candidate.repoPath, abs, ...page });
  }
  return entries;
}

function compareNavOrder(a: Candidate, b: Candidate): number {
  const na = navOrder(a.meta);
  const nb = navOrder(b.meta);
  if (na !== nb) return na < nb ? -1 : 1;
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

async function discoverSection(docsDir: string, root: typeof SECTION_ROOTS[number], excluded: string[]): Promise<Entry[]> {
  const rootDir = join(docsDir, root.dir);
  const files = (await walkMd(rootDir)).sort((a, b) => a.localeCompare(b));
  const kept: Candidate[] = [];
  for (const abs of files) {
    const candidate = candidateFromSource(docsDir, abs, await readFile(abs, "utf8"), excluded);
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

/** Discover public pages, retaining explicit routes/order and exclusion diagnostics. */
export async function discover(docsDir: string): Promise<{ entries: Entry[]; excluded: string[] }> {
  const excluded: string[] = [];
  await validateFlatPages(docsDir, excluded);
  const entries = await discoverOrientation(docsDir, excluded);
  for (const root of SECTION_ROOTS) {
    entries.push(...await discoverSection(docsDir, root, excluded));
  }
  return { entries: uniqueEntries(entries), excluded };
}
