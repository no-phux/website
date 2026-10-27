import assert from "node:assert/strict";
import type { FrameLocator, Page } from "playwright-core";

/** An iframe's own visual viewport does not shrink when the parent's keyboard opens. */
export async function verifyParentKeyboard(page: Page, hero: FrameLocator) {
  const input = hero.locator('.install-hook-request input[name="email"]');
  await input.focus();
  const height = await page.evaluate(() => visualViewport!.height);
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", { configurable: true, value: 300 });
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(() => {
    const frame = document.querySelector<HTMLIFrameElement>("#home-light iframe")!;
    const form = frame.contentDocument!.querySelector(".install-hook-request")!;
    const box = form.getBoundingClientRect();
    const top = frame.getBoundingClientRect().top;
    return box.top + top >= visualViewport!.offsetTop + 19 && box.bottom + top <= visualViewport!.offsetTop + 281;
  });
  assert.ok(await input.evaluate(node => node === document.activeElement), "keyboard adjustment preserves the user's focused field");
  await page.evaluate(value => {
    Object.defineProperty(visualViewport, "height", { configurable: true, value });
    visualViewport!.dispatchEvent(new Event("resize"));
  }, height);
}
