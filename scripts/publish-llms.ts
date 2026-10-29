// public/llms.txt lists pages before phux publishes them.
// A build that skipped a page omits that page's line, so the published
// index does not point at a missing page. The next build that syncs the
// page keeps the line.
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Slugs whose llms.txt lines publish only when that page is in the build. */
export const GATED_LLMS_SLUGS = ["building", "any-program-status"] as const;

function linkFor(slug: string): string {
  return `](https://docs.phux.sh/${slug})`;
}

export function llmsTxtForBuild(source: string, presentSlugs: ReadonlySet<string>): string {
  return source
    .split("\n")
    .filter((line) => GATED_LLMS_SLUGS.every((slug) => presentSlugs.has(slug) || !line.includes(linkFor(slug))))
    .join("\n");
}

export async function publishLlmsTxt(distDir: string): Promise<void> {
  const path = join(distDir, "llms.txt");
  const source = await readFile(path, "utf8");
  const present = new Set(GATED_LLMS_SLUGS.filter((slug) => existsSync(join(distDir, `${slug}.html`))));
  const next = llmsTxtForBuild(source, present);
  if (next !== source) await writeFile(path, next);
}
