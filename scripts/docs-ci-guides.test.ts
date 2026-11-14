import { expect, test } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { discover } from "./docs-catalog";
import { writeDocumentation } from "./docs-output";
import { metadata, revision, siteRevision, source, state, useDocsSyncRoot, versions } from "./docs-sync.harness";

useDocsSyncRoot();

test("publishes CI guides beside development with local links and navigation", async () => {
  await source("development.md", "# Development\n\nSee the [CI plan](./ci-plan.md).\n");
  await source("ci.md", "# CI policy\n\nSee [development](./development.md).\n");
  await source("ci-plan.md", "# CI execution plan\n\nSee the [CI policy](./ci.md).\n");
  const { entries, excluded } = await discover(state.docs);
  const guides = entries.filter(({ group }) => group === "internals").sort((a, b) => a.order - b.order);
  expect(guides.map(({ slug }) => slug)).toEqual(["development", "ci", "ci-plan"]);
  expect(excluded).toEqual([]);
  const out = join(state.root, "out");
  await mkdir(out);
  expect(await writeDocumentation(out, entries, revision, versions, siteRevision)).toEqual({ written: 8, failed: [] });
  expect((await metadata(out)).pages).toEqual([
    "---Get started---", "overview",
    "---Automate---", "pane-command", "agent-waiting", "terminal-mcp",
    "---Machines and clients---", "tailscale",
    "---Work on phux---", "development", "ci", "ci-plan",
  ]);
  expect(await readFile(join(out, "development.md"), "utf8")).toContain("[CI plan](/ci-plan)");
  expect(await readFile(join(out, "ci-plan.md"), "utf8")).toContain("[CI policy](/ci)");
});
