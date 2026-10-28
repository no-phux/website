import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { HOME, SITE } from "../src/lib/site";

/** Product copy and metadata must agree, including the script-free document. */
export async function verifyHomeContent(page: Page) {
  assert.equal((await page.getByRole("heading", { level: 1 }).innerText()).replace(/\s+/g, " ").trim(), HOME.headline);
  assert.equal((await page.locator(".hero-description").innerText()).trim(), "Your agents. Your machines. One workspace.");
  assert.match(await page.locator(".hero-body").innerText(), /Run coding agents side by side/);
  assert.equal(await page.locator(".workflow-grid article").count(), 6);
  assert.match(await page.locator(".workflow-proof").innerText(), /A server crash or machine reboot ends running programs/);
  assert.match(await page.locator(".control-proof pre").innerText(), /phux agent wait --any --until blocked --timeout 600/);
  assert.match(await page.locator(".control-proof figcaption").innerText(), /not a live feed/);
  assert.equal(await page.locator('.product-fit a[href="https://docs.phux.sh/compare#phux-vs-orca"]').count(), 1);
  assert.equal(await page.locator(".try-link").getAttribute("aria-label"), "Open the browser demo");
  assert.equal((await page.locator("#workspace-title").innerText()).trim(), "Browser demo");
  assert.equal((await page.locator(".workspace-heading p").innerText()).trim(), "A disposable phux shell in your browser.");
  assert.equal((await page.locator(".closing-platforms").innerText()).trim(), "All platforms ↗");
  assert.equal(await page.title(), `${SITE.name} — ${HOME.headline}`);
  assert.equal(await page.locator('meta[name="description"]').getAttribute("content"), HOME.description);
  assert.equal(await page.locator('meta[property="og:description"]').getAttribute("content"), HOME.description);
  assert.equal(await page.locator('meta[name="twitter:description"]').getAttribute("content"), HOME.description);
  assert.equal((await page.locator(".download-note").innerText()).trim(), "Apple silicon · macOS 26 or later · Apache-2.0 · No account");
  assert.equal(await page.locator(".cli-requirement").count(), 0);
}
