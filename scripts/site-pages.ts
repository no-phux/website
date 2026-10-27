/** Website-owned task guides emitted into the docs collection beside overview. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter, type Entry } from "./docs-catalog";

const SITE_PAGES_DIR = join(import.meta.dir, "../src/site-docs");
const DESCRIPTION_LIMIT = 160;

export const SITE_PAGE_CATALOG = [
  { file: "pane-command.md", slug: "pane-command", group: "automate", order: -1 },
  { file: "agent-waiting.md", slug: "agent-waiting", group: "automate", order: 4 },
  { file: "terminal-mcp.md", slug: "terminal-mcp", group: "automate", order: 5 },
  { file: "tailscale.md", slug: "tailscale", group: "connect", order: -1 },
] as const satisfies readonly { file: string; slug: string; group: Entry["group"]; order: number }[];

export interface SitePage {
  file: string;
  slug: string;
  group: Entry["group"];
  order: number;
  title: string;
  summary: string;
  description: string;
  body: string;
}

function required(meta: Record<string, string>, key: string, file: string): string {
  const value = meta[key]?.trim();
  if (!value) throw new Error(`${file}: missing ${key}`);
  return value;
}

/** Load the task guides. Throws when title, summary, or description is missing or too long. */
export async function loadSitePages(): Promise<SitePage[]> {
  const pages: SitePage[] = [];
  for (const item of SITE_PAGE_CATALOG) {
    const raw = await readFile(join(SITE_PAGES_DIR, item.file), "utf8");
    const { body, meta } = parseFrontmatter(raw);
    const description = required(meta, "description", item.file);
    if (description.length > DESCRIPTION_LIMIT || description.endsWith("...")) {
      throw new Error(`${item.file}: description must be a complete sentence of at most ${DESCRIPTION_LIMIT} characters`);
    }
    const text = body.trim();
    if (!text) throw new Error(`${item.file}: empty body`);
    pages.push({
      ...item,
      title: required(meta, "title", item.file),
      summary: required(meta, "summary", item.file),
      description,
      body: `${text}\n`,
    });
  }
  return pages;
}
