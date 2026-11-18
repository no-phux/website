import { expect, test } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { discover } from "./docs-catalog";
import { writeDocumentation } from "./docs-output";
import { metadata, revision, siteRevision, source, state, useDocsSyncRoot, versions } from "./docs-sync.harness";

useDocsSyncRoot();

test("catalogs Build on phux ahead of the program protocol and skips a missing source", async () => {
  const absent = await discover(state.docs);
  expect(absent.entries.some(({ slug }) => slug === "building")).toBe(false);
  expect(absent.entries.some(({ slug }) => slug === "any-program-status")).toBe(false);
  expect(state.warning).toHaveBeenCalledWith("  skip (missing): docs/building.md");
  expect(state.warning).toHaveBeenCalledWith("  skip (missing): docs/any-program-status.md");

  await source("building.md", "# Build on phux\n\nPrograms that drive a phux server start here.\n");
  await source("any-program-status.md", "# Any program can report status\n\nA program reports with OSC 7501.\n");
  for (const file of ["program-protocol.md", "scripting.md", "agents.md", "protocol.md"]) await source(file);
  const { entries } = await discover(state.docs);
  const buildingDescription = "There is no published SDK or client library yet. A program builds on the JSON CLI, MCP, the wire protocol, unpublished Rust client crates, OSC 7501, or plugins.";
  expect(buildingDescription.length).toBeLessThanOrEqual(160);
  expect(buildingDescription.endsWith("...")).toBe(false);
  expect(entries.find(({ slug }) => slug === "building")).toMatchObject({
    repoPath: "docs/building.md",
    slug: "building",
    group: "build",
    order: -1,
    title: "Build on phux: JSON CLI, MCP, wire protocol, OSC 7501 and plugins",
    description: buildingDescription,
  });
  expect(entries.find(({ slug }) => slug === "any-program-status")).toMatchObject({
    repoPath: "docs/any-program-status.md",
    slug: "any-program-status",
    group: "build",
    order: -0.5,
    title: "Any program can report status",
  });
  const out = join(state.root, "out");
  await mkdir(out);
  await writeDocumentation(out, entries, revision, versions, siteRevision);
  const pages = (await metadata(out)).pages as string[];
  expect(pages.indexOf("scripting")).toBeGreaterThan(-1);
  expect(pages.indexOf("agents")).toBeGreaterThan(pages.indexOf("scripting"));
  expect(pages.indexOf("---Build for phux---")).toBeGreaterThan(pages.indexOf("agents"));
  expect(pages.indexOf("building")).toBe(pages.indexOf("---Build for phux---") + 1);
  expect(pages.indexOf("any-program-status")).toBe(pages.indexOf("building") + 1);
  expect(pages.indexOf("program-protocol")).toBe(pages.indexOf("any-program-status") + 1);
  expect(pages.indexOf("protocol")).toBeGreaterThan(pages.indexOf("building"));
  const guide = await readFile(join(out, "building.md"), "utf8");
  expect(guide).toContain('title: "Build on phux: JSON CLI, MCP, wire protocol, OSC 7501 and plugins"');
  expect(guide).toContain(`description: "${buildingDescription}"`);
  expect(guide).toContain('summary: "Programs that drive a phux server start here."');
  expect(guide.replace(/no published SDK or client library/gi, "")).not.toMatch(/SDK|multi-client|hooks edge/i);
  expect(guide).toContain('sourcePath: "docs/building.md"');
  const status = await readFile(join(out, "any-program-status.md"), "utf8");
  expect(status).toContain('title: "Any program can report status"');
  expect(status).toContain('sourcePath: "docs/any-program-status.md"');
});
