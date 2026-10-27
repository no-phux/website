/** Reduced-motion and script-free homepage acceptance. */
import assert from "node:assert/strict";
import type { Browser } from "playwright-core";

export async function verifyStaticHome(browser: Browser, base: string) {
  const stillContext = await browser.newContext({ reducedMotion: "reduce" });
  const stillPage = await stillContext.newPage();
  await stillPage.goto(`${base}/?hero=classic`);
  await stillPage.mouse.move(1200, 100);
  assert.equal(await stillPage.locator("[data-fox-eye]").first().getAttribute("transform"), "translate(0 0)", "initial reduced motion keeps the fox centered");
  await stillPage.locator("#connection-details > summary").click();
  await stillPage.locator(".tour").scrollIntoViewIfNeeded();
  await stillPage.locator("astro-island:not([ssr]) .tour").waitFor();
  assert.equal(await stillPage.locator(".tour-play").count(), 0, "reduced motion does not autoplay");
  assert.equal(await stillPage.locator(".tour").getAttribute("data-playing"), "false");
  assert.ok(await stillPage.locator(".tour-summary").textContent(), "the illustration has a readable explanation");
  assert.match(await stillPage.locator(".tour-terminal").innerText(), /Finished/, "reduced motion shows the settled chapter");
  await stillContext.close();
  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  assert.ok(await staticPage.locator("[data-fox]").isVisible(), "the fox remains visible without JavaScript");
  assert.equal((await staticPage.getByRole("heading", { level: 1 }).innerText()).trim(), "phux");
  assert.equal((await staticPage.locator(".hero-description").innerText()).trim(), "A terminal multiplexer whose server you can drive from code.");
  await staticPage.locator(".install-options > summary").click();
  assert.ok(await staticPage.locator("#install code").isVisible());
  assert.equal(await staticPage.getByRole("slider").count(), 0, "no-JS does not offer an inert slider");
  assert.ok(await staticPage.locator(".client-tui").isVisible() && await staticPage.locator(".client-gui").isVisible(), "no-JS shows both static client previews");
  assert.equal(await staticPage.locator("iframe").count(), 0, "no-JS never downloads the live app");
  await staticPage.locator("#connection-details > summary").click();
  assert.equal(await staticPage.getByRole("link", { name: "Open demo", exact: true }).getAttribute("href"), "/embed");
  assert.match(await staticPage.locator(".tour-terminal").innerText(), /Finished/, "no-JS tour shows a settled scene");
  assert.equal(await staticPage.locator(".tour-lines > span").first().evaluate((node) => getComputedStyle(node).opacity), "1", "static output stays fully readable");
  await staticContext.close();
}
