import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { discover, type Entry } from "./docs-catalog";
import { createPageRenderer } from "./docs-markdown";
import { writeDocumentation } from "./docs-output";

const revision = "a".repeat(40);
const siteRevision = "b".repeat(40);
const versions = { protocolVersion: "1.2.3", projectVersion: "0.4.5" };
let root: string;
let docs: string;
let warning: ReturnType<typeof spyOn>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "phux-docs-sync-"));
  docs = join(root, "custom-source");
  await mkdir(docs);
  warning = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  warning.mockRestore();
  await rm(root, { recursive: true, force: true });
});

async function source(file: string, body = "# Title\n\nA summary.\n\n## Detail\n\nText.\n") {
  const path = join(docs, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

async function metadata(out: string, folder = "") {
  return JSON.parse(await readFile(join(out, folder, "meta.json"), "utf8"));
}

const entry: Entry = { repoPath: "docs/clients.md", abs: "/unused", slug: "clients", group: "connect", order: 1 };

function render(body: string, entries = [entry]) {
  return createPageRenderer(entries, revision, versions)(body, entry);
}

describe("documentation discovery interface", () => {
  test("keeps canonical flat guides and ignores the historical archive", async () => {
    const guides = ["embedding", "organization", "desktop-capture", "desktop-changes", "desktop-panes"];
    for (const guide of guides) await source(`${guide}.md`);
    await source("install.md");
    await source("README.md");
    await source("adr/README.md");
    await source("adr/old-decision.md");
    const { entries, excluded } = await discover(docs);
    expect(entries.map(({ slug }) => slug).sort()).toEqual(["docs", "installation", ...guides].sort());
    expect(entries.find(({ slug }) => slug === "installation")).toMatchObject({ repoPath: "docs/install.md", group: "start", order: 2 });
    expect(entries.find(({ slug }) => slug === "organization")).toMatchObject({ group: "internals", order: 2 });
    expect(excluded).toEqual([]);
    expect(warning).toHaveBeenCalledWith("  skip (missing): docs/clients.md");
  });

  test("publishes host services in Build for phux with local documentation links", async () => {
    for (const file of ["program-protocol.md", "program-sequences.md", "protocol.md"]) await source(file);
    await source("host-services.md", "# Host services\n\nHTTP over the phux connection.\n\n## Commands\n\nSee the [protocol](./protocol.md#commands-events-resources).\n");
    const { entries } = await discover(docs);
    expect(entries.find(({ slug }) => slug === "host-services")).toMatchObject({
      repoPath: "docs/host-services.md", group: "build", order: 2,
    });
    const out = join(root, "out");
    await mkdir(out);
    expect(await writeDocumentation(out, entries, revision, versions, siteRevision)).toEqual({ written: 5, failed: [] });
    expect((await metadata(out)).pages).toEqual([
      "---Get started---", "overview", "---Build for phux---", "program-protocol", "program-sequences", "host-services",
      "---Work on phux---", "protocol",
    ]);
    const guide = await readFile(join(out, "host-services.md"), "utf8");
    expect(guide).toContain('sourcePath: "docs/host-services.md"');
    expect(guide).toContain("[protocol](/protocol#commands-events-resources)");
  });

  test("publishes distributions beside plugins in Customize with local guide links", async () => {
    await source("plugins.md", "# Plugins\n\nExtend phux.\n\n## More\n\nSee [Distributions](./distros.md).\n");
    await source("distros.md", "# Distributions\n\nPortable defaults.\n\n## Write a distro\n\nCompose [plugins](./plugins.md).\n");
    await source("projects.md");
    const { entries, excluded } = await discover(docs);
    expect(entries.find(({ slug }) => slug === "distros")).toMatchObject({
      repoPath: "docs/distros.md", group: "customize", order: 7,
    });
    expect(excluded).toEqual([]);
    const out = join(root, "out");
    await mkdir(out);
    expect(await writeDocumentation(out, entries, revision, versions, siteRevision)).toEqual({ written: 4, failed: [] });
    expect((await metadata(out)).pages).toEqual([
      "---Get started---", "overview", "---Customize---", "plugins", "distros", "projects",
    ]);
    expect(await readFile(join(out, "plugins.md"), "utf8")).toContain("[Distributions](/distros)");
    const guide = await readFile(join(out, "distros.md"), "utf8");
    expect(guide).toContain('title: "Distributions"');
    expect(guide).toContain('sourcePath: "docs/distros.md"');
    expect(guide).toContain("[plugins](/plugins)");
  });

  test("publishes tmux import after Keys in Customize with local guide links", async () => {
    for (const file of ["config.md", "themes.md", "status-bar.md", "hooks.md", "plugins.md", "distros.md", "projects.md", "scripting.md"]) await source(file);
    await source("keys.md", "# Keys\n\nNative bindings.\n\n## Coming from tmux\n\nSee the [tmux importer guide](./tmux-import.md).\n");
    await source("getting-started.md", "# Getting started\n\nFirst steps.\n\n## Coming from tmux\n\nSee [Bring your tmux keys to phux](./tmux-import.md).\n");
    await source("tmux-import.md", "# Bring your tmux keys to phux\n\nImport native bindings.\n\n## Apply and undo\n\nSee [when settings take effect](./config.md#when-a-change-takes-effect) and the [JSON error contract](./scripting.md#json-output-and-errors).\n");
    const { entries, excluded } = await discover(docs);
    expect(entries.find(({ slug }) => slug === "tmux-import")).toMatchObject({
      repoPath: "docs/tmux-import.md", group: "customize", order: 2,
    });
    const customize = entries.filter(({ group }) => group === "customize").sort((a, b) => a.order - b.order);
    expect(customize.map(({ slug }) => slug)).toEqual([
      "config", "keys", "tmux-import", "themes", "status-bar", "hooks", "plugins", "distros", "projects",
    ]);
    expect(customize.map(({ order }) => order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(excluded).toEqual([]);
    const out = join(root, "out");
    await mkdir(out);
    expect(await writeDocumentation(out, entries, revision, versions, siteRevision)).toEqual({ written: 12, failed: [] });
    expect((await metadata(out)).pages).toEqual([
      "---Get started---", "overview", "getting-started", "---Customize---",
      "config", "keys", "tmux-import", "themes", "status-bar", "hooks", "plugins", "distros", "projects",
      "---Automate---", "scripting",
    ]);
    expect(await readFile(join(out, "keys.md"), "utf8")).toContain("[tmux importer guide](/tmux-import)");
    expect(await readFile(join(out, "getting-started.md"), "utf8")).toContain("[Bring your tmux keys to phux](/tmux-import)");
    const guide = await readFile(join(out, "tmux-import.md"), "utf8");
    expect(guide).toContain('title: "Bring your tmux keys to phux"');
    expect(guide).toContain('sourcePath: "docs/tmux-import.md"');
    expect(guide).toContain("[when settings take effect](/config#when-a-change-takes-effect)");
    expect(guide).toContain("[JSON error contract](/scripting#json-output-and-errors)");
  });

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
    const { entries, excluded } = await discover(docs);
    expect(entries.filter(({ order }) => order > 0).sort((a, b) => a.order - b.order).map(({ slug }) => slug)).toEqual([
      "reference/beta", "reference/alpha", "reference/delta", "reference/nested/child", "reference/aardvark", "reference/zeta",
    ]);
    expect(entries.filter(({ order }) => order === 0).map(({ slug }) => slug).sort()).toEqual(["reference", "reference/nested"]);
    expect(excluded).toEqual(["docs/reference/hidden.md (stability:DRAFT)"]);
  });

  test("fails visibly for an uncatalogued authored flat page", async () => {
    await source("future-guide.md");
    await expect(discover(docs)).rejects.toThrow("uncatalogued documentation: docs/future-guide.md; add it to ORIENTATION and navigation");
  });

  test("a denylisted flat page does not excuse another uncatalogued page", async () => {
    await source("substrate.md");
    await source("future-guide.md");
    await expect(discover(docs)).rejects.toThrow("uncatalogued documentation: docs/future-guide.md; add it to ORIENTATION and navigation");
  });

  test("excludes the internal substrate doc and emits no page or link to it", async () => {
    await source("substrate.md", "# Internal\n\nKeep off the site.\n");
    await source(
      "architecture.md",
      "# Architecture\n\nA public summary.\n\n## Detail\n\nSee the [record](./substrate.md#cut) and [remote](./remote.md).\n\n[hidden]: ./substrate.md\n",
    );
    await source("remote.md");
    const { entries, excluded } = await discover(docs);
    expect(entries.map(({ repoPath }) => repoPath)).not.toContain("docs/substrate.md");
    expect(entries.map(({ slug }) => slug)).not.toContain("substrate");
    expect(excluded).toContain("docs/substrate.md (denylist)");
    const out = join(root, "out");
    await mkdir(out);
    expect(await writeDocumentation(out, entries, revision, versions, siteRevision)).toEqual({ written: 3, failed: [] });
    const architecture = await readFile(join(out, "architecture.md"), "utf8");
    expect(architecture).toContain("See the record and [remote](/remote).");
    expect(architecture).not.toMatch(/substrate\.md|\/substrate/);
    expect(await readdir(out)).not.toContain("substrate.md");
    expect(JSON.stringify(await metadata(out))).not.toContain("substrate");
  });

  test("still excludes draft/scratch flat pages, including unknown work in progress", async () => {
    await source("clients.md", "---\nstability: draft\n---\n# Clients");
    await source("future-guide.md", "---\nstability: Scratch\n---\n# Future");
    const { entries, excluded } = await discover(docs);
    expect(entries).toEqual([]);
    expect(excluded.sort()).toEqual(["docs/clients.md (stability:draft)", "docs/future-guide.md (stability:Scratch)"]);
  });

  test("rejects colliding directory-index and page routes rather than overwriting", async () => {
    await source("reference/nested.md");
    await source("reference/nested/README.md");
    await expect(discover(docs)).rejects.toThrow("duplicate slug reference/nested");
  });
});

describe("source Markdown rendering interface", () => {
  test("rewrites hosted routes, references, directories and unhosted sources with immutable provenance", () => {
    const hosted: Entry = { ...entry, repoPath: "docs/reference/CLI.md", slug: "reference/cli", group: "reference" };
    const body = "# Clients\n\nA summary.\n\n## Links\n\n" + [
      "[CLI](./reference/CLI.md#flags#extra)",
      "[Root](./README.md) [Reference](./reference/)",
      "[Source](../crates/phux/src/lib.rs#L1) [Tree](../crates/)",
      "[History](./adr/old.md) [Missing](./missing.md)",
      "[web](https://example.test/a.md) [secure](http://example.test) [mail](mailto:a@b.test) [local](#links)",
      '[ref]: ./reference/CLI.md#flags "CLI title"',
      "[single]: ./missing.md 'Source title'",
    ].join("\n");
    const text = render(body, [entry, hosted, { ...entry, repoPath: "docs/README.md", slug: "docs" }]);
    expect(text).toContain("[CLI](/reference/cli#flags#extra)");
    expect(text).toContain("[Root](/docs) [Reference](/reference)");
    expect(text).toContain(`[Source](https://github.com/no-phux/phux/blob/${revision}/crates/phux/src/lib.rs#L1)`);
    expect(text).toContain(`[Tree](https://github.com/no-phux/phux/tree/${revision}/crates)`);
    expect(text).toContain(`[History](https://github.com/no-phux/phux/blob/${revision}/docs/adr/old.md)`);
    expect(text).toContain('[ref]: /reference/cli#flags "CLI title"');
    expect(text).toContain(`[single]: https://github.com/no-phux/phux/blob/${revision}/docs/missing.md 'Source title'`);
    expect(text).toContain("[web](https://example.test/a.md) [secure](http://example.test) [mail](mailto:a@b.test) [local](#links)");
    expect(text).toContain(`sourcePath: "docs/clients.md"\nsourceRevision: "${revision}"`);
  });

  test("resolves links relative to nested source paths without sharing route state", () => {
    const nested = { ...entry, repoPath: "docs/reference/nested/page.md", slug: "reference/nested/page" };
    const raw = "# Nested\n\nSummary.\n\n## Links\n\n[Clients](../../clients.md#use) [Docs](../../)\n";
    const first = createPageRenderer([entry, nested], revision, versions);
    const other = createPageRenderer([nested], "c".repeat(40), versions);
    expect(other(raw, nested)).toContain(`/blob/${"c".repeat(40)}/docs/clients.md#use`);
    expect(first(raw, nested)).toContain("[Clients](/clients#use) [Docs](/docs)");
  });

  test("keeps code fences, whitespace and source-reference titles while stripping the shell-owned lead", () => {
    const code = '```sh\nprintf "%s\\n" "two  spaces"\n# not a heading\n```\n';
    const text = render(`# Clients\n\nA **formatted** summary with \`code\` and [links](./clients.md).\n\n## Commands\n\n${code}`);
    expect(text).toContain('title: "Clients"\nsummary: "A formatted summary with code and links."');
    expect(text.split("---\n").at(-1)).toBe(`## Commands\n\n${code}`);
  });

  test("replaces a published native Windows desktop with the WSL limit", () => {
    const truth = "On Windows today, the CLI and TUI run under WSL 2. The native desktop build is not published yet.";
    const clients = render(`# Clients\n\nThe terminal UI.\n\n## Desktop\n\nPhux Desktop is a native app for macOS 26 or later on Apple silicon,\nLinux on x86_64 or arm64 with Vulkan, and Windows x64 with a WSL 2 server.\nOn macOS and Linux, install it with:\n\nThe [Windows app](../clients/desktop/README.md#windows) uses native Direct3D\nrendering, input and clipboard; shells and agents stay in WSL. Its desktop\nupdates use the Windows installer. WSLg is not required. The local Changes\npanel and external Unix developer socket are not available on Windows.\n\nIt shows every session.\n`);
    expect(clients).toContain(truth);
    expect(clients).not.toContain("Windows app");
    expect(clients).not.toContain("Windows x64");
    const install = { ...entry, repoPath: "docs/install.md", slug: "installation" };
    const installation = createPageRenderer([install], revision, versions)(`# Install\n\nOne command.\n\nWindows uses these Linux CLI/server builds through [WSL](#windows-wsl),\nincluding from PowerShell. The [Windows desktop](../clients/desktop/README.md#windows)\nis native, with its coordinator in WSL. There is no native Windows coordinator\nor Intel Mac build.\n\nThe terminal UI runs in WSL; the native Windows desktop\nconnects to the same coordinator.\n\ninside WSL. Neither step removes your distribution. For a native window,\nsee [Windows Desktop](../clients/desktop/README.md#windows); WSLg is not required.\n`, install);
    expect(installation).toContain(truth);
    expect(installation).toContain("There is no Intel Mac build.");
    expect(installation).not.toContain("does not exist");
    expect(installation).toContain("The terminal UI runs in WSL.");
    expect(installation).not.toContain("connects to the same coordinator");
    expect(installation).not.toContain("Windows Desktop");
  });

  test("honors metadata overrides, YAML escaping and safe stability defaults", () => {
    const override = { ...entry, title: 'A "quoted" \\ title', summary: "Owned summary." };
    const renderer = createPageRenderer([override], revision, versions);
    const text = renderer("---\nstability: internal\n---\n# Source title\n\nSource summary.\n\n## Details\n", override);
    expect(text).toContain('title: "A \\"quoted\\" \\\\ title"');
    expect(text).toContain('summary: "Owned summary."');
    expect(text).toContain('stability: "stable"');
    expect(render("---\nstability: evolving\n---\n# Source\n\nSummary.\n\n## Detail\n")).toContain('stability: "evolving"');
    expect(render("# Bare")).toContain('summary: ""');
  });
});

describe("collection output interface", () => {
  test("emits folder indexes, curated navigation and website-owned overview provenance", async () => {
    for (const file of ["README.md", "install.md", "config.md", "reference/README.md", "reference/zebra.md", "reference/cli.md", "reference/config.md"]) await source(file);
    const { entries } = await discover(docs);
    const out = join(root, "out");
    await mkdir(out);
    expect(await writeDocumentation(out, entries, revision, versions, siteRevision)).toEqual({ written: 8, failed: [] });
    expect(await readFile(join(out, "config.md"), "utf8")).toContain('sourcePath: "docs/config.md"');
    expect(await readFile(join(out, "reference/index.md"), "utf8")).toContain('sourcePath: "docs/reference/README.md"');
    expect(await metadata(out, "reference")).toEqual({ title: "Reference", pages: ["index", "cli", "config", "zebra"] });
    // One flat list from the catalog: the overview leads, the all-docs map closes Get started.
    expect(await metadata(out)).toEqual({
      pages: ["---Get started---", "overview", "installation", "docs", "---Customize---", "config", "---Reference---", "...reference"],
    });
    const overview = await readFile(join(out, "overview.md"), "utf8");
    expect(overview).toContain(`sourcePath: "src/pages/overview.astro"\nsourceBase: "https://github.com/no-phux/website"\nsourceRevision: "${siteRevision}"`);
    expect(overview).toContain('protocolVersion: "1.2.3"\nprojectVersion: "0.4.5"');
    expect(overview).toContain("[Install phux](/installation)");
  });

  test("reports an unreadable source without masking write errors or dropping the overview", async () => {
    const out = join(root, "out");
    await mkdir(out);
    const missing = { ...entry, abs: join(root, "missing.md") };
    expect(await writeDocumentation(out, [missing], revision, versions, siteRevision)).toEqual({ written: 1, failed: ["docs/clients.md"] });
    expect(warning).toHaveBeenCalledWith("  fail (read):    docs/clients.md");
    const notDirectory = join(root, "not-a-directory");
    await writeFile(notDirectory, "occupied");
    await expect(writeDocumentation(notDirectory, [], revision, versions, siteRevision)).rejects.toThrow();
  });
});
