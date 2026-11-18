import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright-core";

/** Hold the actual reader module: visible SSR content does not imply a live shortcut. */
export async function verifyReaderHydration(page: Page, base: string, root: string) {
  const html = await readFile(resolve(root, "config.html"), "utf8");
  const island = html.match(/<astro-island\b[^>]*component-export="Docs"[^>]*>/)?.[0];
  const componentPath = island?.match(/component-url="([^"]+)"/)?.[1];
  assert.ok(componentPath, "the built config page names its reader module");
  const componentUrl = new URL(componentPath, base).href;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(componentUrl, async route => {
    await held;
    await route.continue();
  });
  try {
    const requested = page.waitForRequest(componentUrl);
    await page.goto(`${base}/config`, { waitUntil: "domcontentloaded" });
    await requested;
    assert.equal(await page.locator(".reader").getAttribute("data-search-ready"), "false");
    assert.ok(await page.locator("h1").isVisible(), "the SSR reader is already visible");
    await page.keyboard.press("/");
    assert.equal(await page.getByRole("dialog").count(), 0, "a key before listener attachment is not replayed");

    release();
    await page.locator('.reader[data-search-ready="true"]').waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0, "hydration did not replay the early key");
    await page.keyboard.press("/");
    await page.getByRole("dialog").locator("input").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
  } finally {
    release();
    await page.unroute(componentUrl);
  }
}
