#!/usr/bin/env bun
/**
 * seo.ts — search decisions at full volume. See SEO.md for the method.
 *
 * Four roles, never mixed: real data finds (Search Console export, the synced
 * docs), code counts (seo-pages.ts, seo-queries.ts), Jev judges (TypeSafe System One, one narrow
 * question per row), and the reasoning model writes. Jev never counts, compares
 * numbers, or makes an irreversible call; every result is advisory and written
 * to .seo/ for a person or agent to act on.
 *
 *   bun run seo audit                     code-only page checks, no network
 *   bun run seo gate [slug...]            Jev pre-publish questions per page
 *   bun run seo links <slug>              internal-link candidates for a page
 *   bun run seo queries <Queries.csv>     triage a Search Console export
 *   bun run seo calibrate <labels.csv> <results.csv> <column>
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { band, jevJudge, type Band } from "./seo-jev";
import { audit, gate, judgeLinks, linkCandidates, loadCorpus, type Page } from "./seo-pages";
import { calibrate, parseCsv, parseQueries, toCsv, triageQueries } from "./seo-queries";

export * from "./seo-jev";
export * from "./seo-pages";
export * from "./seo-queries";

export const OUT = resolve(import.meta.dir, "../.seo");

async function save(name: string, rows: Record<string, unknown>[]) {
  await mkdir(OUT, { recursive: true });
  const path = join(OUT, name);
  await writeFile(path, toCsv(rows));
  console.log(`\nwrote ${relative(process.cwd(), path)}`);
}

function pagesFor(pages: Page[], slugs: string[]): Page[] {
  if (slugs.length === 0) return pages;
  const missing = slugs.filter((slug) => !pages.some((page) => page.slug === slug));
  if (missing.length) throw new Error(`unknown docs slug(s): ${missing.join(", ")}`);
  return pages.filter((page) => slugs.includes(page.slug));
}

const COMMANDS: Record<string, (args: string[]) => Promise<number>> = {
  async audit() {
    const rows = audit(await loadCorpus());
    const flagged = rows.filter((row) => row.issues.length);
    for (const row of flagged) console.log(`${row.slug.padEnd(24)} in:${String(row.inbound).padStart(2)}  ${row.issues.join(" · ")}`);
    console.log(`\n${flagged.length}/${rows.length} pages have issues`);
    await save("audit.csv", rows as unknown as Record<string, unknown>[]);
    return 0;
  },
  async gate(args) {
    const strict = args.includes("--strict");
    const pages = pagesFor(await loadCorpus(), args.filter((a) => !a.startsWith("--")));
    const rows = await gate(pages, jevJudge());
    for (const row of rows) {
      const cells = Object.entries(row.answers).map(([id, p]) => `${id}:${p.toFixed(2)}`).join("  ");
      console.log(`${row.failing.length ? "FAIL" : "ok  "} ${row.slug.padEnd(24)} ${cells}`);
    }
    await save("gate.csv", rows.map((r) => ({ slug: r.slug, ...r.answers, failing: r.failing })));
    return strict && rows.some((r) => r.failing.length) ? 1 : 0;
  },
  async links([slug]) {
    if (!slug) throw new Error("usage: seo links <slug>");
    const pages = await loadCorpus();
    const [target] = pagesFor(pages, [slug]);
    const rows = await judgeLinks(target, linkCandidates(target, pages), jevJudge());
    for (const row of rows) console.log(`${band(row.fits).padEnd(6)} ${row.fits.toFixed(2)}  /${row.source}`);
    console.log(`\nanchor: "${target.title}" → /${target.slug}. Write each link inside an existing sentence of the phux docs source.`);
    await save(`links-${slug.replace(/\//g, "_")}.csv`, rows.map(({ excerpt: _, ...row }) => ({ ...row, band: band(row.fits) })));
    return 0;
  },
  async queries([file]) {
    if (!file) throw new Error("usage: seo queries <Queries.csv>");
    const rows = parseQueries(await readFile(file, "utf8"));
    const judged = await triageQueries(rows, jevJudge());
    const count = (b: Band) => judged.filter((r) => r.band === b).length;
    console.log(`${rows.length} queries: act ${count("act")} · check ${count("check")} · review ${count("review")}`);
    const wins = judged.filter((r) => r.quickWin && r.band !== "review").sort((a, b) => b.impressions - a.impressions);
    for (const r of wins.slice(0, 20)) console.log(`quick win  pos ${r.position.toFixed(1).padStart(4)}  ${String(r.impressions).padStart(6)} imp  ${r.category.padEnd(18)} ${r.query}`);
    await save("queries.csv", judged as unknown as Record<string, unknown>[]);
    return 0;
  },
  async calibrate([labelsFile, resultsFile, column]) {
    if (!labelsFile || !resultsFile || !column) throw new Error("usage: seo calibrate <labels.csv> <results.csv> <column>");
    const labels = parseCsv(await readFile(labelsFile, "utf8"));
    const [header, ...rest] = parseCsv(await readFile(resultsFile, "utf8"));
    const results = rest.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
    const report = calibrate(labels, results, header[0], column);
    for (const d of report.disagreements) console.log(`disagree  ${d.key}  you:${d.label}  jev:${d.got}`);
    console.log(`\n${report.disagreements.length}/${report.compared} disagreements — ${report.advice}`);
    return 0;
  },
};

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  const run = COMMANDS[command ?? ""];
  if (!run) {
    console.error(`usage: bun run seo <${Object.keys(COMMANDS).join("|")}> …  (see SEO.md)`);
    process.exit(2);
  }
  try {
    process.exit(await run(args));
  } catch (error) {
    console.error(`seo ${command}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
