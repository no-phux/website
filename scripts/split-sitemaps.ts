// The Astro sitemap lists every URL under https://phux.sh. Docs URLs are
// copied onto docs.phux.sh and removed from the phux.sh files so a page is
// listed once. Every sitemap-N.xml is split the same way.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { laterLastmod } from "./sitemap-lastmod";

const DOCS_HOST = "docs.phux.sh";
const SITEMAP_FILE = /^sitemap-(\d+)\.xml$/;

export function docsUrlBlocks(xml: string): string[] {
  return [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)]
    .map((match) => match[0])
    .filter((block) => block.includes(`<loc>https://${DOCS_HOST}/`) || block.includes(`<loc>https://${DOCS_HOST}<`));
}

export function stripDocsUrls(xml: string): string {
  return xml.replace(/<url>[\s\S]*?<\/url>\n?/g, (block) => (docsUrlBlocks(block).length ? "" : block));
}

export function latestLastmod(blocks: string[]): string | undefined {
  return blocks
    .map((block) => block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1])
    .reduce<string | undefined>((latest, value) => laterLastmod(latest, value), undefined);
}

export function sitemapUrlset(blocks: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${blocks.join("\n")}\n</urlset>\n`;
}

export function sitemapIndex(entries: { loc: string; lastmod?: string }[]): string {
  const body = entries.map((entry) => {
    const when = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : "";
    return `  <sitemap>\n    <loc>${entry.loc}</loc>${when}\n  </sitemap>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

/** The Astro index is written before docs URLs are removed, so its lastmod can name a page that left the file. */
export function rewriteSitemapIndexLastmod(xml: string, file: string, lastmod: string | undefined): string {
  const loc = `https://phux.sh/${file}`;
  const pattern = new RegExp(`(<sitemap>\\s*<loc>${loc}</loc>)(?:\\s*<lastmod>[^<]*</lastmod>)?(\\s*</sitemap>)`);
  return xml.replace(pattern, (_match, open: string, close: string) => `${open}${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}${close}`);
}

export async function splitDocsSitemap(dir: string): Promise<void> {
  const names = (await readdir(dir)).filter((name) => SITEMAP_FILE.test(name)).sort();
  if (names.length === 0) throw new Error("no sitemap-N.xml to split");
  const docsFiles: { loc: string; lastmod?: string }[] = [];
  let sawPerformance = false;
  let index = "";
  const indexPath = join(dir, "sitemap-index.xml");
  try {
    index = await readFile(indexPath, "utf8");
  } catch {
    index = "";
  }
  for (const name of names) {
    const xml = await readFile(join(dir, name), "utf8");
    const blocks = docsUrlBlocks(xml);
    const siteXml = stripDocsUrls(xml);
    await writeFile(join(dir, name), siteXml);
    if (index) index = rewriteSitemapIndexLastmod(index, name, latestLastmod([...siteXml.matchAll(/<url>[\s\S]*?<\/url>/g)].map((match) => match[0])));
    if (blocks.length === 0) continue;
    const docsName = name.replace(/^sitemap-/, "sitemap-docs-");
    await writeFile(join(dir, docsName), sitemapUrlset(blocks));
    if (blocks.some((block) => block.includes(`<loc>https://${DOCS_HOST}/performance</loc>`))) sawPerformance = true;
    docsFiles.push({ loc: `https://${DOCS_HOST}/${docsName}`, lastmod: latestLastmod(blocks) });
  }
  if (!sawPerformance) throw new Error("docs sitemap is missing https://docs.phux.sh/performance");
  if (index) await writeFile(indexPath, index);
  await writeFile(join(dir, "sitemap-docs-index.xml"), sitemapIndex(docsFiles));
}
