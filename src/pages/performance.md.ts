import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { APIRoute } from "astro";
import {
  loadCompareMarkdown,
  measurementsSection,
  performanceMarkdown,
  performanceSource,
} from "../lib/performance-page";

export const GET: APIRoute = () => {
  const siteRoot = process.cwd();
  const measurements = measurementsSection(loadCompareMarkdown(siteRoot) ?? "");
  let revision: string | undefined;
  try {
    revision = (JSON.parse(readFileSync(join(siteRoot, "public/docs-manifest.json"), "utf8")) as { revision?: string }).revision;
  } catch {
    revision = undefined;
  }
  return new Response(performanceMarkdown(measurements, performanceSource(revision)), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
