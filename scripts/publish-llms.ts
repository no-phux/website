// public/llms.txt lists /building before phux publishes docs/building.md.
// A build that skipped that page omits the line, so the published index
// does not point at a missing page. The next build that syncs the page
// keeps the line.
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BUILDING_LINK = "](https://docs.phux.sh/building)";

export function llmsTxtForBuild(source: string, buildingPageExists: boolean): string {
  if (buildingPageExists) return source;
  return source
    .split("\n")
    .filter((line) => !line.includes(BUILDING_LINK))
    .join("\n");
}

export async function publishLlmsTxt(distDir: string): Promise<void> {
  const path = join(distDir, "llms.txt");
  const source = await readFile(path, "utf8");
  const next = llmsTxtForBuild(source, existsSync(join(distDir, "building.html")));
  if (next !== source) await writeFile(path, next);
}
