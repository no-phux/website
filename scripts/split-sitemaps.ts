// The Astro sitemap lists every URL in one file under https://phux.sh.
// docs.phux.sh needs its own index, or its /sitemap-index.xml points at phux.sh.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DOCS_HOST = "docs.phux.sh";

export function docsUrlBlocks(xml: string): string[] {
  return [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)]
    .map((match) => match[0])
    .filter((block) => block.includes(`<loc>https://${DOCS_HOST}/`) || block.includes(`<loc>https://${DOCS_HOST}<`));
}

export function latestLastmod(blocks: string[]): string | undefined {
  return blocks
    .map((block) => block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1])
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

export function sitemapUrlset(blocks: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${blocks.join("\n")}\n</urlset>\n`;
}

export function sitemapIndex(loc: string, lastmod?: string): string {
  const when = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap>\n    <loc>${loc}</loc>${when}\n  </sitemap>\n</sitemapindex>\n`;
}

export async function splitDocsSitemap(dir: string): Promise<void> {
  const xml = await readFile(join(dir, "sitemap-0.xml"), "utf8");
  const blocks = docsUrlBlocks(xml);
  if (!xml.includes("<lastmod>")) throw new Error("sitemap-0.xml is missing lastmod");
  if (blocks.some((block) => !block.includes("<lastmod>"))) throw new Error("a docs sitemap URL is missing lastmod");
  if (!blocks.some((block) => block.includes(`<loc>https://${DOCS_HOST}/performance</loc>`))) {
    throw new Error("sitemap-0.xml is missing https://docs.phux.sh/performance");
  }
  const lastmod = latestLastmod(blocks);
  await writeFile(join(dir, "sitemap-docs-0.xml"), sitemapUrlset(blocks));
  await writeFile(join(dir, "sitemap-docs-index.xml"), sitemapIndex(`https://${DOCS_HOST}/sitemap-docs-0.xml`, lastmod));
}
