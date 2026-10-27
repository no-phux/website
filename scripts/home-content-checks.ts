import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Page } from "playwright-core";
import HeroDemo from "../src/components/HeroDemo";
import Tour from "../src/components/tour/Tour";
import { illustratedCopy } from "../src/components/tour/script";

/** Product copy and metadata must agree, including the script-free document. */
export async function verifyHomeContent(page: Page) {
  assert.equal((await page.getByRole("heading", { level: 1 }).innerText()).trim(), "phux");
  assert.equal((await page.locator(".hero-description").innerText()).trim(), "A terminal multiplexer whose server you can drive from code.");
  assert.match(await page.locator(".hero-body").innerText(), /Shells run in a background server/);
  assert.match(await page.locator(".hero-body").innerText(), /the desktop app/);
  assert.equal(await page.locator(".try-link").getAttribute("aria-label"), "Open the browser demo");
  assert.equal((await page.locator("#workspace-title").innerText()).trim(), "Browser demo");
  assert.equal((await page.locator(".workspace-heading p").innerText()).trim(), "A disposable phux shell in your browser.");
  assert.equal((await page.locator(".closing-platforms").innerText()).trim(), "All platforms ↗");
  assert.equal(await page.title(), "phux — A terminal multiplexer whose server you can drive from code.");
  assert.equal(await page.locator('meta[name="description"]').getAttribute("content"), "A terminal multiplexer whose server you can drive from code.");
  assert.equal(await page.locator('meta[property="og:description"]').getAttribute("content"), "A terminal multiplexer whose server you can drive from code.");
  assert.equal(await page.locator('meta[name="twitter:description"]').getAttribute("content"), "A terminal multiplexer whose server you can drive from code.");
  assert.equal((await page.locator(".download-note").innerText()).trim(), "Apple silicon · macOS 26 or later · Apache-2.0 · No account");
  assert.equal(await page.locator(".cli-requirement").count(), 0);
  const heroCopy = [
    await page.locator("body").innerText(),
    await page.locator(".hero-demo").evaluate((node) => node.textContent ?? ""),
    renderToStaticMarkup(createElement(Tour)).replace(/<[^>]*>/g, " "),
    renderToStaticMarkup(createElement(HeroDemo)).replace(/<[^>]*>/g, " "),
    illustratedCopy(),
  ].join("\n");
  assert.doesNotMatch(heroCopy, /phone/i, "the homepage does not name a phone");
}
