import assert from "node:assert/strict";
import type { Browser } from "playwright-core";
import { platformVisitors } from "./home-platform-fixtures";

export async function verifyEmailFallback(browser: Browser, base: string) {
  const context = await browser.newContext({ userAgent: platformVisitors.android.userAgent, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.routeWebSocket(/wss?:\/\//, socket => socket.close());
  const page = await context.newPage();
  await page.route("**/api/beta", route => route.fulfill({ status: 503, json: { ok: false, error: "Please try again" } }));
  try {
    await page.goto(`${base}/more?phone=ios&testflight=unavailable#testflight`);
    const root = page.locator("#testflight");
    assert.ok(await root.locator("[data-testflight-link]").isHidden(), "an unavailable public link cannot send visitors into a redirect loop");
    assert.ok(await root.locator("[data-testflight-unavailable]").isVisible());
    assert.equal(await root.locator("form").getAttribute("data-phone"), "ios", "fallback preserves the requested beta, not the browser's default");
    assert.ok(await root.locator("form").isHidden(), "even a failed native handoff never forces the keyboard");
    await root.locator("[data-email-invite] > summary").tap();
    const field = root.locator('input[name="email"]');
    assert.ok(await field.evaluate(node => node !== document.activeElement));
    await field.fill("retry@example.com");
    await root.locator('button[type="submit"]').tap();
    await page.locator("#beta-note").filter({ hasText: "Could not request access" }).waitFor();
    assert.equal(await field.inputValue(), "retry@example.com", "a failed email request preserves the address for retry");
    assert.ok(await field.evaluate(node => node !== document.activeElement), "the response is readable without a keyboard covering it");
  } finally {
    await context.close();
  }
}
