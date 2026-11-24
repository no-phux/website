import { describe, expect, test } from "bun:test";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { discover } from "./docs-catalog";
import { writeDocumentation } from "./docs-output";
import { guide, metadata, revision, siteRevision, source, state, useDocsSyncRoot, versions } from "./docs-sync.harness";

useDocsSyncRoot();

async function writeSite() {
  const { entries, unpublished } = await discover(state.docs);
  const out = join(state.root, "out");
  await mkdir(out);
  const result = await writeDocumentation(out, entries, revision, versions, siteRevision, unpublished);
  return { out, result };
}

describe("flat page frontmatter", () => {
  test("honors group, order, slug, title and description, and strips the source frontmatter", async () => {
    await guide("install.md", {
      slug: "installation",
      group: "start",
      order: 2,
      title: '"Install phux: every platform"',
      description: "Install, update and remove phux.",
    }, "# Install\n\nOne command.\n\n## Channels\n\nText.\n");
    const { entries, excluded } = await discover(state.docs);
    expect(excluded).toEqual([]);
    expect(entries).toEqual([{
      repoPath: "docs/install.md",
      abs: join(state.docs, "install.md"),
      slug: "installation",
      group: "start",
      order: 2,
      title: "Install phux: every platform",
      description: "Install, update and remove phux.",
    }]);
    const { out } = await writeSite();
    const page = await readFile(join(out, "installation.md"), "utf8");
    expect(page).toContain('title: "Install phux: every platform"');
    expect(page).toContain('summary: "One command."');
    expect(page).toContain('description: "Install, update and remove phux."');
    expect(page).not.toContain("slug: installation");
    expect(page.split("---\n").at(-1)).toBe("## Channels\n\nText.\n");
  });

  test("defaults the slug to the basename and the title to the H1", async () => {
    await guide("keys.md", { group: "customize", order: 1 }, "# Keys\n\nBindings.\n");
    const { entries } = await discover(state.docs);
    expect(entries).toEqual([{ repoPath: "docs/keys.md", abs: join(state.docs, "keys.md"), slug: "keys", group: "customize", order: 1 }]);
  });

  test("the README publishes as the docs map", async () => {
    await guide("README.md", { slug: "docs", group: "start", order: 9 }, "# All docs\n\nEvery page.\n");
    const { out } = await writeSite();
    expect(await readFile(join(out, "docs.md"), "utf8")).toContain('sourcePath: "docs/README.md"');
  });

  test("orders pages within a group by order and groups in GROUPS order", async () => {
    await guide("internals.md", { group: "internals", order: 0 });
    await guide("third.md", { group: "customize", order: 2.5 });
    await guide("first.md", { group: "customize", order: -1 });
    await guide("second.md", { group: "customize", order: 1 });
    await guide("started.md", { group: "start", order: 3 });
    const { out } = await writeSite();
    expect((await metadata(out)).pages).toEqual([
      "---Get started---", "overview", "started",
      "---Customize---", "first", "second", "third",
      "---Automate---", "pane-command", "agent-waiting", "terminal-mcp",
      "---Machines and clients---", "tailscale",
      "---Work on phux---", "internals",
    ]);
  });

  test("publish: false excludes the page and strips links to it, keeping the label", async () => {
    await guide("substrate.md", { publish: false }, "# Internal\n\nKeep off the site.\n");
    await guide(
      "architecture.md",
      { group: "internals", order: 0 },
      "# Architecture\n\nA public summary.\n\n## Detail\n\nSee the [record](./substrate.md#cut) and [remote](./remote.md).\n\n[hidden]: ./substrate.md\n",
    );
    await guide("remote.md", { group: "connect", order: 0 });
    const { entries, excluded, unpublished } = await discover(state.docs);
    expect(entries.map(({ slug }) => slug)).not.toContain("substrate");
    expect(excluded).toEqual(["docs/substrate.md (publish:false)"]);
    expect([...unpublished]).toEqual(["docs/substrate.md"]);
    const { out, result } = await writeSite();
    expect(result.failed).toEqual([]);
    const architecture = await readFile(join(out, "architecture.md"), "utf8");
    expect(architecture).toContain("See the record and [remote](/remote).");
    expect(architecture).not.toMatch(/substrate\.md|\/substrate/);
    expect(await readdir(out)).not.toContain("substrate.md");
    expect(JSON.stringify(await metadata(out))).not.toContain("substrate");
  });

  test("draft and scratch stability exclude a page even without a group", async () => {
    await source("clients.md", "---\nstability: draft\n---\n# Clients");
    await source("future-guide.md", "---\nstability: Scratch\n---\n# Future");
    const { entries, excluded, unpublished } = await discover(state.docs);
    expect(entries).toEqual([]);
    expect(excluded.sort()).toEqual(["docs/clients.md (stability:draft)", "docs/future-guide.md (stability:Scratch)"]);
    expect([...unpublished].sort()).toEqual(["docs/clients.md", "docs/future-guide.md"]);
  });

  test("a flat page without a group or publish: false fails, naming the file", async () => {
    await source("future-guide.md");
    await expect(discover(state.docs)).rejects.toThrow("docs/future-guide.md: frontmatter needs `group` and `order`, or `publish: false`");
  });

  test("an unknown group fails", async () => {
    await guide("future-guide.md", { group: "misc", order: 1 });
    await expect(discover(state.docs)).rejects.toThrow('docs/future-guide.md: unknown group "misc"; use one of start, customize, automate, connect, build, help, internals');
  });

  test("the reference group belongs to the generated section", async () => {
    await guide("future-guide.md", { group: "reference", order: 1 });
    await expect(discover(state.docs)).rejects.toThrow('docs/future-guide.md: unknown group "reference"');
  });

  test("a missing or non-numeric order fails", async () => {
    await guide("future-guide.md", { group: "start", order: "soon" });
    await expect(discover(state.docs)).rejects.toThrow('docs/future-guide.md: order must be a number, got "soon"');
    await guide("future-guide.md", { group: "start" });
    await expect(discover(state.docs)).rejects.toThrow('docs/future-guide.md: order must be a number, got ""');
  });

  test("two pages claiming one slug fail", async () => {
    await guide("install.md", { slug: "installation", group: "start", order: 2 });
    await guide("setup.md", { slug: "installation", group: "start", order: 3 });
    await expect(discover(state.docs)).rejects.toThrow("duplicate slug installation: docs/install.md and docs/setup.md");
  });

  test("ignores the historical archive below docs/", async () => {
    await guide("README.md", { slug: "docs", group: "start", order: 9 });
    await source("adr/README.md");
    await source("adr/old-decision.md");
    const { entries } = await discover(state.docs);
    expect(entries.map(({ slug }) => slug)).toEqual(["docs"]);
  });
});

describe("reference section discovery", () => {
  test("orders public section pages using all nav-order aliases, then basename", async () => {
    await source("reference/README.md");
    await source("reference/Beta.md", "---\nnav-order: -2\n---\n# Beta");
    await source("reference/Alpha.md", "---\nnav_order: 0\n---\n# Alpha");
    await source("reference/Delta.md", "---\nnavOrder: 0\n---\n# Delta");
    await source("reference/nested/Child.md", "---\nnavOrder: 2\n---\n# Child");
    await source("reference/nested/README.md");
    await source("reference/Zeta.md", "---\nnav-order: nope\nnav_order: -3\n---\n# Zeta");
    await source("reference/Aardvark.md");
    await source("reference/hidden.md", "---\nstability: DRAFT\nnav-order: -10\n---\n# Hidden");
    const { entries, excluded } = await discover(state.docs);
    expect(entries.filter(({ order }) => order > 0).sort((a, b) => a.order - b.order).map(({ slug }) => slug)).toEqual([
      "reference/beta", "reference/alpha", "reference/delta", "reference/nested/child", "reference/aardvark", "reference/zeta",
    ]);
    expect(entries.filter(({ order }) => order === 0).map(({ slug }) => slug).sort()).toEqual(["reference", "reference/nested"]);
    expect(excluded).toEqual(["docs/reference/hidden.md (stability:DRAFT)"]);
  });

  test("rejects colliding directory-index and page routes rather than overwriting", async () => {
    await source("reference/nested.md");
    await source("reference/nested/README.md");
    await expect(discover(state.docs)).rejects.toThrow("duplicate slug reference/nested");
  });
});
