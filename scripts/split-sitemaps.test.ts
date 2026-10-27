import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { docsUrlBlocks, splitDocsSitemap, stripDocsUrls } from "./split-sitemaps";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://phux.sh/</loc><lastmod>2026-10-01T00:00:00Z</lastmod></url>
<url><loc>https://docs.phux.sh/overview</loc><lastmod>2026-10-27T00:00:00Z</lastmod></url>
<url><loc>https://docs.phux.sh/performance</loc></url>
</urlset>
`;

const second = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://docs.phux.sh/protocol</loc><lastmod>2026-09-01T00:00:00Z</lastmod></url>
<url><loc>https://phux.sh/more</loc><lastmod>2026-10-02T00:00:00Z</lastmod></url>
</urlset>
`;

describe("docs sitemap split", () => {
  test("keeps docs URLs, lastmod, and /performance on the docs host", async () => {
    expect(docsUrlBlocks(xml).map((block) => block.match(/<loc>([^<]+)<\/loc>/)?.[1])).toEqual([
      "https://docs.phux.sh/overview",
      "https://docs.phux.sh/performance",
    ]);
    expect(stripDocsUrls(xml)).not.toContain("docs.phux.sh");
    expect(stripDocsUrls(xml)).toContain("https://phux.sh/");
    const dir = await mkdtemp(join(tmpdir(), "sitemaps-"));
    await mkdir(dir, { recursive: true });
    await Bun.write(join(dir, "sitemap-0.xml"), xml);
    await Bun.write(join(dir, "sitemap-1.xml"), second);
    await Bun.write(join(dir, "sitemap-index.xml"), `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://phux.sh/sitemap-0.xml</loc><lastmod>2026-10-27T00:00:00Z</lastmod></sitemap><sitemap><loc>https://phux.sh/sitemap-1.xml</loc><lastmod>2026-09-01T00:00:00Z</lastmod></sitemap></sitemapindex>`);
    await splitDocsSitemap(dir);
    const index = await readFile(join(dir, "sitemap-docs-index.xml"), "utf8");
    const docs = await readFile(join(dir, "sitemap-docs-0.xml"), "utf8");
    const moreDocs = await readFile(join(dir, "sitemap-docs-1.xml"), "utf8");
    const site = await readFile(join(dir, "sitemap-0.xml"), "utf8");
    const siteMore = await readFile(join(dir, "sitemap-1.xml"), "utf8");
    expect(index).toContain("<loc>https://docs.phux.sh/sitemap-docs-0.xml</loc>");
    expect(index).toContain("<loc>https://docs.phux.sh/sitemap-docs-1.xml</loc>");
    expect(index).toContain("<lastmod>2026-10-27T00:00:00Z</lastmod>");
    expect(index).toContain("<lastmod>2026-09-01T00:00:00Z</lastmod>");
    expect(index).not.toContain("https://phux.sh/");
    expect(docs).toContain("<url><loc>https://docs.phux.sh/performance</loc></url>");
    expect(docs).toContain("<lastmod>2026-10-27T00:00:00Z</lastmod>");
    expect(docs).not.toContain("https://phux.sh/");
    expect(moreDocs).toContain("<loc>https://docs.phux.sh/protocol</loc>");
    expect(site).toContain("https://phux.sh/");
    expect(site).not.toContain("docs.phux.sh");
    expect(siteMore).toContain("https://phux.sh/more");
    expect(siteMore).not.toContain("docs.phux.sh");
    const siteIndex = await readFile(join(dir, "sitemap-index.xml"), "utf8");
    expect(siteIndex).toContain("<loc>https://phux.sh/sitemap-0.xml</loc><lastmod>2026-10-01T00:00:00Z</lastmod>");
    expect(siteIndex).toContain("<loc>https://phux.sh/sitemap-1.xml</loc><lastmod>2026-10-02T00:00:00Z</lastmod>");
    expect(siteIndex).not.toContain("2026-10-27T00:00:00Z");
    expect(siteIndex).not.toContain("2026-09-01T00:00:00Z");
  });
});
