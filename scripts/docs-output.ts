/** Emit collection pages and Fumadocs navigation from the discovered catalog. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AGENT_START, OVERVIEW, SITE } from "../src/lib/site";
import { GROUPS, type Entry } from "./docs-catalog";
import { createPageRenderer, yamlString, type Versions } from "./docs-markdown";

const FOLDER_TITLES: Record<string, string> = {
  reference: "Reference",
};

// Fumadocs supports references to pages outside a folder. These virtual
// folders give each page one navigational home while preserving its URL.
const TASK_GROUPS = [
  {
    folder: "(start)", title: "Start here", defaultOpen: true,
    pages: ["../installation", "../getting-started", "../concepts"],
  },
  {
    folder: "(use)", title: `Use ${SITE.name}`,
    pages: ["../config", "../scripting", "../agents", "../remote", "../clients", "../desktop-capture", "../desktop-changes", "../desktop-panes", "../troubleshooting"],
  },
  {
    folder: "(contribute)", title: "Work on phux",
    pages: ["../architecture", "../organization", "../protocol", "../embedding", "../development", "../releasing", "../docs"],
  },
];

const ROOT_PAGES = ["overview", "(start)", "(use)", "reference", "(contribute)"];

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

async function writeNavigation(outDir: string, entries: Entry[], prefixes: Set<string>): Promise<void> {
  for (const prefix of [...prefixes].sort()) {
    const meta = { title: FOLDER_TITLES[prefix] ?? prefix, pages: folderPages(entries, prefix) };
    await writeFile(join(outDir, prefix, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  }
  for (const { folder, ...meta } of TASK_GROUPS) {
    await mkdir(join(outDir, folder), { recursive: true });
    await writeFile(join(outDir, folder, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  }
  await writeFile(join(outDir, "meta.json"), `${JSON.stringify({ pages: ROOT_PAGES }, null, 2)}\n`);
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
