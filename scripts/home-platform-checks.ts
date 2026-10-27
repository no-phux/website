import assert from "node:assert/strict";
import type { Browser } from "playwright-core";
import { platformVisitors } from "./home-platform-fixtures";
import { hidesClosingCommand, installActions, type InstallPlatform } from "../src/lib/home-platform";

export async function verifyDeviceInstalls(browser: Browser, base: string, artifacts: string) {
  for (const [device, visitor] of Object.entries(platformVisitors)) {
    const platform: InstallPlatform = device === "ipadDesktop" ? "ipad" : device as InstallPlatform;
    const action = installActions[platform];
    // Astro production resolves docs links; this test module runs directly in Bun.
    const href = action.href.replace(/^\/installation$/, "https://docs.phux.sh/installation");
    const width = platform === "ipad" ? 768 : 390;
    const context = await browser.newContext({ userAgent: visitor.userAgent, viewport: { width, height: 844 }, hasTouch: visitor.maxTouchPoints > 0, isMobile: hidesClosingCommand(platform) && platform !== "windows" });
    await context.addInitScript(points => Object.defineProperty(navigator, "maxTouchPoints", { get: () => points }), visitor.maxTouchPoints);
    await context.routeWebSocket(/wss?:\/\//, socket => socket.close());
    const page = await context.newPage();
    let payload: { platform?: string; email?: string } = {};
    await page.route("**/api/beta", async route => {
      payload = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, status: "invited" } });
    });
    try {
      await page.goto(base);
      await page.waitForFunction(expected => document.documentElement.dataset.installPlatform === expected, platform);
      assert.deepEqual(await page.locator("[data-device-label]").allTextContents(), [action.label, action.label], `${device}: both primary actions match the actual OS`);
      assert.equal(await page.locator(".download-primary").getAttribute("href"), href);
      assert.equal(await page.locator(".download-final").getAttribute("href"), href);
      assert.equal(await page.locator(".download-note").innerText(), action.note);
      assert.doesNotMatch(action.note, /iPhone|Android|TestFlight|phone/i, `${device}: platform line`);
      assert.doesNotMatch(await page.locator("body").innerText(), /iPhone|Android|TestFlight/, `${device}: homepage`);
      assert.equal(await page.locator(".closing-command").isHidden(), hidesClosingCommand(platform));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `${artifacts}/install-${device}.png` });
      if (action.target) {
        if (action.phone) await page.locator(".download-primary").tap();
        else await page.locator(".download-primary").click();
        assert.equal(await page.locator("#install-options").getAttribute("open"), "");
        assert.equal(await page.locator(`[data-install-target="${action.target}"]`).getAttribute("aria-pressed"), "true");
        if (action.target === "cli") {
          assert.ok(await page.locator(".install-copy").evaluate(node => node === document.activeElement), "Linux opens and focuses its CLI installer");
        }
      }
      if (action.phone) {
        const form = page.locator("#beta-form");
        assert.ok(await form.isVisible(), `${device}: one tap reveals access, not a Mac download`);
        assert.equal(await form.getAttribute("data-phone"), action.phone);
        assert.ok(await form.locator("input[name=email]").evaluate(node => node === document.activeElement));
        assert.ok(await form.locator("input[name=email]").evaluate(node => parseFloat(getComputedStyle(node).fontSize) >= 16), "mobile email entry avoids focus zoom, including desktop-mode iPad");
        await form.locator("input[name=email]").fill(`${device}@example.com`);
        await form.locator("button[type=submit]").click();
        await page.locator("#beta-note").filter({ hasText: /Invite sent|Request received/ }).waitFor();
        assert.equal(payload.platform, action.phone);
        assert.equal(payload.email, `${device}@example.com`);
        assert.ok(await page.locator(".closing-command").isHidden(), "phone visitors are not told to run a desktop shell installer");
        await page.locator("#beta-phone").click();
        await page.locator(".download-final").focus();
        await page.locator(".download-final").press("Enter");
        assert.equal(await form.getAttribute("data-phone"), action.phone, "the closing action reopens access for the advertised device");
      }
      await page.getByText("All platforms", { exact: true }).first().waitFor();
    } finally {
      await context.close();
    }
  }
}
