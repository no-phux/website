/** Emit collection pages and Fumadocs navigation from the discovered catalog. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AGENT_START, OVERVIEW, SITE } from "../src/lib/site";
import { GROUPS, type Entry } from "./docs-catalog";
import { createPageRenderer, yamlString, type Versions } from "./docs-markdown";

const FOLDER_TITLES: Record<string, string> = {
  reference: "Reference",
};

/** The website-owned overview leads the catalog's first group. */
const OVERVIEW_ITEM = { name: "overview", group: "start", order: -1 } as const;

const REFERENCE_PAGES = [
  "index",
  "cli",
  "config",
  "actions",
  "widgets",
  "hooks",
  "environment",
  "exit-codes",
  "files",
  "deprecations",
  "kinds",
  "parity",
];

function folderPrefixes(entries: Entry[]): Set<string> {
  const prefixes = new Set<string>();
  for (const { slug } of entries) {
    const i = slug.lastIndexOf("/");
    if (i > 0) prefixes.add(slug.slice(0, i));
  }
  return prefixes;
}

function outputFile(outDir: string, slug: string, prefixes: Set<string>): string {
  return prefixes.has(slug) ? join(outDir, slug, "index.md") : join(outDir, `${slug}.md`);
}

async function readSource(entry: Entry): Promise<string | null> {
  try {
    return await readFile(entry.abs, "utf8");
  } catch {
    console.warn(`  fail (read):    ${entry.repoPath}`);
    return null;
  }
}

function immediateChildren(entries: Entry[], prefix: string): Entry[] {
  return entries.filter(({ slug }) => {
    if (slug === prefix) return true;
    if (!slug.startsWith(`${prefix}/`)) return false;
    return !slug.slice(prefix.length + 1).includes("/");
  }).sort((a, b) => {
    if (a.slug === prefix) return -1;
    if (b.slug === prefix) return 1;
    return 0;
  });
}

function folderPages(entries: Entry[], prefix: string): string[] {
  const pages = immediateChildren(entries, prefix).map(({ slug }) =>
    slug === prefix ? "index" : slug.slice(prefix.length + 1));
  if (prefix !== "reference") return pages;
  const available = new Set(pages);
  return [
    ...REFERENCE_PAGES.filter((page) => available.delete(page)),
    ...pages.filter((page) => available.has(page)),
  ];
}

type NavItem = { name: string; group: Entry["group"]; order: number };

/** Flat pages as themselves; a top-level folder once, as `...folder`, at its first entry. */
function navItems(entries: Entry[], prefixes: Set<string>): NavItem[] {
  const items: NavItem[] = [OVERVIEW_ITEM];
  const folders = new Set<string>();
  for (const { slug, group, order } of entries) {
    const top = slug.split("/")[0]!;
    if (!prefixes.has(top)) {
      items.push({ name: slug, group, order });
    } else if (!folders.has(top)) {
      folders.add(top);
      items.push({ name: `...${top}`, group, order });
    }
  }
  return items;
}

/**
 * The root navigation is one flat list derived from the catalog: a
 * `---Label---` separator per GROUPS entry, in GROUPS order, then that group's
 * pages by `order`. Top-level folders are extracted in place, so every page
 * keeps its URL and the sidebar has no collapsible folders.
 */
export function rootNavigation(entries: Entry[], prefixes: Set<string>): string[] {
  const items = navItems(entries, prefixes);
  return (Object.keys(GROUPS) as Entry["group"][]).flatMap((group) => {
    const pages = items.filter((item) => item.group === group).sort((a, b) => a.order - b.order);
    return pages.length ? [`---${GROUPS[group]}---`, ...pages.map(({ name }) => name)] : [];
  });
}

async function writeNavigation(outDir: string, entries: Entry[], prefixes: Set<string>): Promise<void> {
  for (const prefix of [...prefixes].sort()) {
    const meta = { title: FOLDER_TITLES[prefix] ?? prefix, pages: folderPages(entries, prefix) };
    await writeFile(join(outDir, prefix, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  }
  await writeFile(join(outDir, "meta.json"), `${JSON.stringify({ pages: rootNavigation(entries, prefixes) }, null, 2)}\n`);
}

async function writeSourcePages(outDir: string, entries: Entry[], prefixes: Set<string>, render: ReturnType<typeof createPageRenderer>) {
  let written = 0;
  const failed: string[] = [];
  for (const entry of entries) {
    const raw = await readSource(entry);
    if (raw === null) {
      failed.push(entry.repoPath);
      continue;
    }
    const file = outputFile(outDir, entry.slug, prefixes);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, render(raw, entry), "utf8");
    written++;
  }
  return { written, failed };
}

/** Caller prepares outDir; returns read failures without hiding write/render errors. */
export async function writeDocumentation(outDir: string, entries: Entry[], revision: string, versions: Versions, siteRevision: string) {
  const prefixes = folderPrefixes(entries);
  const render = createPageRenderer(entries, revision, versions);
  const result = await writeSourcePages(outDir, entries, prefixes, render);
  result.written += await writeOverviewPage(outDir, versions, siteRevision);
  await writeNavigation(outDir, entries, prefixes);
  return result;
}

async function writeOverviewPage(outDir: string, versions: Versions, siteRevision: string): Promise<number> {
  const { title, summary, pitch } = OVERVIEW;
  const body = `# ${title}

${summary}

## ${pitch.headline}

${pitch.text}

[Install phux](/installation) · [Try in your browser](${SITE.url}/embed) · [Use an agent](#use-an-agent)

## Try it

${OVERVIEW.firstRun.map(({ label, action, detail }, index) => `${index + 1}. **${label}:** \`${action}\` — ${detail}`).join("\n")}

${OVERVIEW.continuity} [What survives what](/concepts#what-survives-what).

## The model

${OVERVIEW.model} A server owns running terminals; each client chooses its local views and focus. [Concepts](/concepts).

## Guides

${OVERVIEW.paths.map(({ href, title, text }) => `- [${title}](${href}) — ${text}`).join("\n")}

## Use an agent

\`\`\`text
${AGENT_START.prompt}
\`\`\`

[Coding agents](/agents) · [Driving terminals from scripts](/scripting)

## Reference

[Concepts](/concepts) · [CLI and configuration](/reference) · [Protocol](/protocol) · [Architecture](/architecture) · [Troubleshooting](/troubleshooting) · [All documentation](/docs) · [Docs MCP (read-only)](${SITE.url}/mcp)
`;
  const fm = [
    "---",
    `title: ${yamlString(title)}`,
    `summary: ${yamlString(summary)}`,
    `description: ${yamlString(summary)}`,
    `group: ${yamlString(GROUPS.start)}`,
    `order: -1`,
    `sourcePath: ${yamlString("src/pages/overview.astro")}`,
    `sourceBase: ${yamlString("https://github.com/no-phux/website")}`,
    `sourceRevision: ${yamlString(siteRevision)}`,
    `protocolVersion: ${yamlString(versions.protocolVersion)}`,
    `projectVersion: ${yamlString(versions.projectVersion)}`,
    `stability: ${yamlString("stable")}`,
    "---",
    "",
  ].join("\n");
  await writeFile(join(outDir, "overview.md"), fm + body, "utf8");
  return 1;
}
