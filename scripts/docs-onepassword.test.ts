import { expect, test } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { discover } from "./docs-catalog";
import { writeDocumentation } from "./docs-output";
import { metadata, revision, siteRevision, source, state, useDocsSyncRoot, versions } from "./docs-sync.harness";

useDocsSyncRoot();

test("catalogs 1Password credentials after approvals", async () => {
  await source("approvals.md", "# Approvals\n\nReview a request.\n");
  await source(
    "onepassword.md",
    "# 1Password credentials\n\nKeep API credentials in 1Password and supply them to a local or remote program only when you approve its request. phux stores references, not a vault password, Secret Key, service-account token, or a copy of the credentials.\n\n## Set up a provider\n",
  );
  await source("acp.md", "# ACP\n\nProvider sessions.\n");
  const { entries } = await discover(state.docs);
  expect(entries.find(({ slug }) => slug === "onepassword")).toMatchObject({
    repoPath: "docs/onepassword.md",
    slug: "onepassword",
    group: "automate",
    order: 2.6,
    title: "1Password credentials",
    description: "Keep API credentials in 1Password and supply them to a local or remote program only when you approve its request.",
  });
  const out = join(state.root, "out");
  await mkdir(out);
  await writeDocumentation(out, entries, revision, versions, siteRevision);
  const pages = (await metadata(out)).pages as string[];
  expect(pages.indexOf("onepassword")).toBe(pages.indexOf("approvals") + 1);
  expect(pages.indexOf("acp")).toBe(pages.indexOf("onepassword") + 1);
  const guide = await readFile(join(out, "onepassword.md"), "utf8");
  expect(guide).toContain('title: "1Password credentials"');
  expect(guide).toContain('description: "Keep API credentials in 1Password and supply them to a local or remote program only when you approve its request."');
  expect(guide).toContain('summary: "Keep API credentials in 1Password and supply them to a local or remote program only when you approve its request. phux stores references, not a vault password, Secret Key, service-account token, or a copy of the credentials."');
  expect(guide).toContain('sourcePath: "docs/onepassword.md"');
});
