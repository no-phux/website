import assert from "node:assert/strict";
import type { Browser, Page } from "playwright-core";
import { platformVisitors } from "./home-platform-fixtures";
import { installActions, type InstallPlatform } from "../src/lib/home-platform";
import type { Phone } from "../src/lib/beta";

type Submission = { platform?: string; email?: string };
type Action = (typeof installActions)[InstallPlatform];

export async function verifyDeviceInstalls(browser: Browser, base: string, artifacts: string) {
  for (const [device, visitor] of Object.entries(platformVisitors)) {
    const platform: InstallPlatform = device === "ipadDesktop" ? "ipad" : device as InstallPlatform;
    const action = installActions[platform];
    // Astro production resolves docs links; this test module runs directly in Bun.
    const href = action.href.replace(/^\/installation$/, "https://docs.phux.sh/installation");
    const width = platform === "ipad" ? 768 : 390;
    const context = await browser.newContext({ userAgent: visitor.userAgent, viewport: { width, height: 844 }, hasTouch: visitor.maxTouchPoints > 0, isMobile: Boolean(action.phone) });
    await context.addInitScript(points => Object.defineProperty(navigator, "maxTouchPoints", { get: () => points }), visitor.maxTouchPoints);
    await context.routeWebSocket(/wss?:\/\//, socket => socket.close());
    const page = await context.newPage();
    const payload: Submission = {};
    await page.route("**/api/beta", async route => {
      Object.assign(payload, route.request().postDataJSON());
      await route.fulfill({ json: { ok: true, status: "invited" } });
    });
    try {
      await page.goto(base);
      await page.waitForFunction(expected => document.documentElement.dataset.installPlatform === expected, platform);
      assert.deepEqual(await page.locator("[data-device-label]").allTextContents(), [action.label, action.label], `${device}: both primary actions match the actual OS`);
      assert.equal(await page.locator(".download-primary").getAttribute("href"), href);
      assert.equal(await page.locator(".download-final").getAttribute("href"), href);
      assert.equal(await page.locator(".download-note").innerText(), action.note);
      assert.equal(await page.locator(".closing-command").isHidden(), Boolean(action.phone) || platform === "windows");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `${artifacts}/install-${device}.png` });
      if (action.phone === "ios") {
        await page.locator(".download-primary").tap();
        await page.waitForURL(new URL("/__testflight_join", base).href);
        assert.deepEqual(payload, {}, "native TestFlight handoff never asks us for an email");
        await page.goto(base);
        await page.locator(".install-options > summary").click();
        await page.locator('[data-install-target="mobile"]').click();
        assert.ok(await page.locator("#beta-form").isHidden(), "optional iOS email entry stays closed");
        await page.locator("[data-email-invite] > summary").click();
      }
      await verifyInstallTarget(page, action);
      if (action.phone) {
        await verifyEmailSubmission(page, device, action.phone, payload);
      }
      await page.getByText("All platforms", { exact: true }).first().waitFor();
    } finally {
      await context.close();
    }
  }
}

async function verifyInstallTarget(page: Page, action: Action) {
  if (!action.target) return;
  if (action.phone) await page.locator(".download-primary").tap();
  else await page.locator(".download-primary").click();
  assert.equal(await page.locator("#install-options").getAttribute("open"), "");
  assert.equal(await page.locator(`[data-install-target="${action.target}"]`).getAttribute("aria-pressed"), "true");
  if (action.target === "cli") {
    assert.ok(await page.locator(".install-copy").evaluate(node => node === document.activeElement), "Linux opens and focuses its CLI installer");
  }
}

async function verifyEmailSubmission(page: Page, device: string, phone: Phone, payload: Submission) {
  const form = page.locator("#beta-form");
  const email = form.locator("input[name=email]");
  assert.ok(await form.isVisible(), `${device}: optional email access is available`);
  assert.equal(await form.getAttribute("data-phone"), phone);
  assert.ok(await email.evaluate(node => node !== document.activeElement), "opening access does not force the keyboard");
  assert.ok(await email.evaluate(node => parseFloat(getComputedStyle(node).fontSize) >= 16), "email entry avoids focus zoom");
  await email.fill(`${device}@example.com`);
  await verifyKeyboardViewport(page);
  await form.locator("button[type=submit]").click();
  await page.locator("#beta-note").filter({ hasText: /Invite sent|Request received/ }).waitFor();
  assert.equal(payload.platform, phone);
  assert.equal(payload.email, `${device}@example.com`);
  assert.ok(await email.evaluate(node => node !== document.activeElement), "success dismisses the email keyboard");
  assert.ok(await page.locator(".closing-command").isHidden());
  if (phone === "android") {
    await page.locator("#beta-phone").click();
    await page.locator(".download-final").focus();
    await page.locator(".download-final").press("Enter");
    assert.equal(await form.getAttribute("data-phone"), phone, "closing action retains its advertised phone");
  }
}

async function verifyKeyboardViewport(page: Page) {
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
  await page.evaluate(height => {
    Object.defineProperty(visualViewport, "height", { value: height, configurable: true });
    visualViewport!.dispatchEvent(new Event("resize"));
  }, normalHeight);
}
