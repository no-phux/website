import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  frontmatterValue,
  laterLastmod,
  pageLastmods,
  repositoryShallow,
  sourceCommitDate,
  sourceLastmod,
  urlsMissingLastmod,
} from "./sitemap-lastmod";

const page = `---
title: "Install"
sourcePath: "docs/install.md"
sourceBase: "https://github.com/no-phux/phux"
---
`;

describe("sitemap lastmod", () => {
  test("reads the quoted source path from synced frontmatter", () => {
    expect(frontmatterValue(page, "sourcePath")).toBe("docs/install.md");
    expect(frontmatterValue(page, "missing")).toBeUndefined();
    expect(frontmatterValue('sourcePath: "say \\"hi\\""', "sourcePath")).toBe('say "hi"');
  });

  test("a missing or shallow repository yields no date", () => {
    expect(repositoryShallow("/tmp/not-a-git-repo")).toBe(true);
    expect(sourceLastmod("/tmp/not-a-git-repo", "docs/install.md")).toBeUndefined();
    expect(sourceCommitDate("/tmp/not-a-git-repo/docs/install.md")).toBeUndefined();
  });

  test("compares committer instants across offsets", () => {
    // 03:19-04:00 is 07:19:35Z, one second after the Z timestamp. Text order picks the Z value.
    expect(laterLastmod("2026-10-28T07:19:34Z", "2026-10-28T03:19:35-04:00")).toBe("2026-10-28T03:19:35-04:00");
    expect(laterLastmod("2026-10-28T08:00:00Z", "2026-10-27T08:41:11+00:00")).toBe("2026-10-28T08:00:00Z");
    expect(laterLastmod(undefined, "not-a-date")).toBeUndefined();
  });

  test("names every sitemap entry that omits lastmod", () => {
    const xml = `<urlset>
<url><loc>https://docs.phux.sh/overview</loc><lastmod>2026-10-27T00:00:00Z</lastmod></url>
<url><loc>https://docs.phux.sh/performance</loc></url>
</urlset>
<sitemapindex>
  <sitemap><loc>https://phux.sh/sitemap-0.xml</loc></sitemap>
</sitemapindex>`;
    expect(urlsMissingLastmod(xml)).toEqual([
      "https://docs.phux.sh/performance",
      "https://phux.sh/sitemap-0.xml",
    ]);
  });

  test("sourceMtime from sync metadata dates a page when git history cannot", () => {
    const root = mkdtempSync(join(tmpdir(), "lastmod-"));
    const synced = join(root, "src/content/docs/_synced");
    mkdirSync(synced, { recursive: true });
    writeFileSync(join(synced, "agent-waiting.md"), `---
title: "Waiting"
sourcePath: "src/site-docs/agent-waiting.md"
sourceBase: "https://github.com/no-phux/website"
sourceMtime: "2026-10-27T08:41:11+00:00"
---
`);
    writeFileSync(join(synced, "orphan.md"), `---
title: "Orphan"
sourcePath: "docs/orphan.md"
---
`);
    const dates = pageLastmods(root);
    expect(dates.get("/agent-waiting")).toBe("2026-10-27T08:41:11+00:00");
    expect(dates.has("/orphan")).toBe(false);
  });

  test("a full website checkout dates every phux.sh page and the website-owned docs pages", () => {
    const root = join(import.meta.dir, "..");
    expect(repositoryShallow(root)).toBe(false);
    const dates = pageLastmods(root);
    for (const path of [
      "/", "/brand", "/connect", "/demos", "/demos/program-status-osc7501",
      "/more", "/phone", "/privacy", "/support", "/telemetry",
      "/overview", "/performance",
    ]) {
      expect(dates.get(path), path).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    for (const file of [
      "src/site-docs/agent-waiting.md",
      "src/site-docs/pane-command.md",
      "src/site-docs/tailscale.md",
      "src/site-docs/terminal-mcp.md",
    ]) {
      expect(sourceCommitDate(join(root, file)), file).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});
