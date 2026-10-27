import assert from "node:assert/strict";
import type { Browser, Page } from "playwright-core";
import { platformVisitors } from "./home-platform-fixtures";

/**
 * Keyboard coverage for the MobileAccessForm on /more.
 * The homepage copy of this form is gone; these are the same thresholds.
 */
export async function verifyMoreEmailField(browser: Browser, base: string) {
  // Phone widths, matching the old homepage email checks. At a desktop height the
  // form sits too low on /more to scroll above a keyboard, so those widths are not this test.
  for (const width of [320, 390]) {
    const context = await browser.newContext({
      userAgent: platformVisitors.iphone.userAgent,
      viewport: { width, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    await context.addInitScript(
      (points) => Object.defineProperty(navigator, "maxTouchPoints", { get: () => points }),
      platformVisitors.iphone.maxTouchPoints,
    );
    const page = await context.newPage();
    await page.route("**/api/beta", (route) => route.fulfill({ json: { ok: true, status: "invited" } }));
    try {
      await page.goto(`${base}/more`);
      const form = page.locator("#beta-form");
      const email = form.locator("input[name=email]");
      assert.ok(await form.isHidden(), "email is optional and does not summon a keyboard");
      await page.locator("#testflight [data-email-invite] > summary").click();
      assert.ok(await email.evaluate((node) => node !== document.activeElement), "opening access does not force the keyboard");
      const geometry = await email.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return { height: box.height, font: style.fontSize, appearance: style.appearance };
      });
      assert.ok(geometry.height >= 44 && geometry.height <= 52, `compact accessible email height at ${width}`);
      assert.equal(geometry.appearance, "none", "email controls do not use the platform's native inset style");
      assert.ok(parseFloat(geometry.font) >= 16, "email entry does not trigger iPhone focus zoom");
      assert.ok(await email.evaluate((node) => parseFloat(getComputedStyle(node).fontSize) >= 16), "email entry avoids focus zoom");
      await email.fill(`more-${width}@example.com`);
      await verifyKeyboardViewport(page);
      await verifyParentKeyboard(page);
      await form.locator("button[type=submit]").click();
      await page.locator("#beta-note").filter({ hasText: /Invite sent|Request received/ }).waitFor();
      assert.ok(await email.evaluate((node) => node !== document.activeElement), "success dismisses the email keyboard");
    } finally {
      await context.close();
    }
  }
}

/** Same viewport contract the homepage form used when the keyboard opened. */
export async function verifyKeyboardViewport(page: Page) {
  const normalHeight = await page.evaluate(() => visualViewport!.height);
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", { value: 340, configurable: true });
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(() => {
    const box = document.querySelector("#beta-form")!.getBoundingClientRect();
    const top = visualViewport!.offsetTop;
    return box.top >= top + 19 && box.bottom <= top + 321;
  });
  await page.evaluate((height) => {
    Object.defineProperty(visualViewport, "height", { value: height, configurable: true });
    visualViewport!.dispatchEvent(new Event("resize"));
  }, normalHeight);
}

/** Focus survives the keyboard adjustment. Same bounds as the homepage iframe test, on /more's form. */
export async function verifyParentKeyboard(page: Page) {
  const input = page.locator('#beta-form input[name="email"]');
  await input.focus();
  const height = await page.evaluate(() => visualViewport!.height);
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", { configurable: true, value: 300 });
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(() => {
    const box = document.querySelector("#beta-form")!.getBoundingClientRect();
    return box.top >= visualViewport!.offsetTop + 19 && box.bottom <= visualViewport!.offsetTop + 281;
  });
  assert.ok(await input.evaluate((node) => node === document.activeElement), "keyboard adjustment preserves the user's focused field");
  await page.evaluate((value) => {
    Object.defineProperty(visualViewport, "height", { configurable: true, value });
    visualViewport!.dispatchEvent(new Event("resize"));
  }, height);
}
