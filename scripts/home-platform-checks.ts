import assert from "node:assert/strict";
import type { Browser, Page } from "playwright-core";
import { platformVisitors } from "./home-platform-fixtures";
import { installActions, type InstallPlatform } from "../src/lib/home-platform";
import { homepageInstallPromise } from "./home-content-checks";

type Action = (typeof installActions)[InstallPlatform];

const phonePlatform = (platform: InstallPlatform) =>
  platform === "iphone" || platform === "ipad" || platform === "android";

export async function verifyDeviceInstalls(browser: Browser, base: string, artifacts: string) {
  for (const [device, visitor] of Object.entries(platformVisitors)) {
    const platform: InstallPlatform = device === "ipadDesktop" ? "ipad" : device as InstallPlatform;
    const action = installActions[platform];
    // Astro production resolves docs links; this test module runs directly in Bun.
    const href = action.href.replace(/^\/installation$/, "https://docs.phux.sh/installation");
    const handheld = phonePlatform(platform);
    const width = platform === "ipad" ? 768 : 390;
    const context = await browser.newContext({ userAgent: visitor.userAgent, viewport: { width, height: 844 }, hasTouch: visitor.maxTouchPoints > 0, isMobile: handheld });
    await context.addInitScript(points => Object.defineProperty(navigator, "maxTouchPoints", { get: () => points }), visitor.maxTouchPoints);
    await context.routeWebSocket(/wss?:\/\//, socket => socket.close());
    const page = await context.newPage();
    try {
      await page.goto(base);
      await page.waitForFunction(expected => document.documentElement.dataset.installPlatform === expected, platform);
      assert.deepEqual(await page.locator("[data-device-label]").allTextContents(), [action.label, action.label], `${device}: both primary actions match the actual OS`);
      assert.doesNotMatch(action.label, homepageInstallPromise, `${device}: the action label does not name a phone`);
      assert.doesNotMatch((await page.locator(".download-primary [data-device-label]").innerText()).trim(), homepageInstallPromise, `${device}: the rendered action does not name a phone`);
      assert.doesNotMatch((await page.locator(".download-note").innerText()).trim(), homepageInstallPromise, `${device}: the rendered note does not name a phone`);
      assert.equal(await page.locator(".download-primary").getAttribute("href"), href);
      assert.equal(await page.locator(".download-final").getAttribute("href"), href);
      assert.equal(await page.locator(".download-note").innerText(), action.note);
      assert.equal(await page.locator(".closing-command").isHidden(), handheld || platform === "windows");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `${artifacts}/install-${device}.png` });
      await verifyInstallTarget(page, action);
      await page.getByText("All platforms", { exact: true }).first().waitFor();
    } finally {
      await context.close();
    }
  }
}

async function verifyInstallTarget(page: Page, action: Action) {
  if (!action.target) return;
  await page.locator(".download-primary").click();
  assert.equal(await page.locator("#install-options").getAttribute("open"), "");
  assert.equal(await page.locator(`[data-install-target="${action.target}"]`).getAttribute("aria-pressed"), "true");
  if (action.target === "cli") {
    assert.ok(await page.locator(".install-copy").evaluate(node => node === document.activeElement), "Linux opens and focuses its CLI installer");
  }
}
