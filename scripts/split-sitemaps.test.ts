import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { docsUrlBlocks, splitDocsSitemap } from "./split-sitemaps";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://phux.sh/</loc><lastmod>2026-10-01T00:00:00Z</lastmod></url>
<url><loc>https://docs.phux.sh/overview</loc><lastmod>2026-10-27T00:00:00Z</lastmod></url>
<url><loc>https://docs.phux.sh/performance</loc><lastmod>2026-10-27T00:00:00Z</lastmod></url>
</urlset>
`;

describe("docs sitemap split", () => {
  test("keeps docs URLs, lastmod, and /performance on the docs host", async () => {
    expect(docsUrlBlocks(xml).map((block) => block.match(/<loc>([^<]+)<\/loc>/)?.[1])).toEqual([
      "https://docs.phux.sh/overview",
      "https://docs.phux.sh/performance",
    ]);
    const dir = await mkdtemp(join(tmpdir(), "sitemaps-"));
    await mkdir(dir, { recursive: true });
    await Bun.write(join(dir, "sitemap-0.xml"), xml);
    await splitDocsSitemap(dir);
    const index = await readFile(join(dir, "sitemap-docs-index.xml"), "utf8");
    const docs = await readFile(join(dir, "sitemap-docs-0.xml"), "utf8");
    expect(index).toContain("<loc>https://docs.phux.sh/sitemap-docs-0.xml</loc>");
    expect(index).toContain("<lastmod>2026-10-27T00:00:00Z</lastmod>");
    expect(index).not.toContain("https://phux.sh/");
    expect(docs).toContain("<loc>https://docs.phux.sh/performance</loc>");
    expect(docs).not.toContain("https://phux.sh/");
  });
});
