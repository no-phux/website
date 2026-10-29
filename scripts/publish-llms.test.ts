import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { llmsTxtForBuild, publishLlmsTxt } from "./publish-llms";

const indexed = await readFile(new URL("../public/llms.txt", import.meta.url), "utf8");
const building = "https://docs.phux.sh/building";
const status = "https://docs.phux.sh/any-program-status";

async function publish(htmlFiles: string[]): Promise<string> {
  const dist = await mkdtemp(join(tmpdir(), "phux-llms-"));
  try {
    await writeFile(join(dist, "llms.txt"), indexed);
    for (const name of htmlFiles) await writeFile(join(dist, name), "<!doctype html>");
    await publishLlmsTxt(dist);
    return await readFile(join(dist, "llms.txt"), "utf8");
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
}

describe("published llms.txt", () => {
  test("keeps a gated line when that page is in the build", async () => {
    const published = await publish(["building.html", "any-program-status.html"]);
    expect(published).toBe(indexed);
    expect(llmsTxtForBuild(indexed, new Set(["building", "any-program-status"]))).toBe(indexed);
  });

  test("omits the any-program-status llms.txt line when that page is not in the build", async () => {
    expect(indexed).toContain(status);
    const published = await publish(["building.html"]);
    expect(published).not.toContain(status);
    expect(published).toContain(building);
    expect(published).toContain("https://docs.phux.sh/protocol");
  });

  test("omits the building llms.txt line when that page is not in the build", async () => {
    expect(indexed).toContain(building);
    const published = await publish(["any-program-status.html"]);
    expect(published).not.toContain(building);
    expect(published).toContain(status);
    expect(published).toContain("https://docs.phux.sh/scripting");
  });
});
