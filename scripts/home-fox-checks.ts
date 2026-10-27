import assert from "node:assert/strict";
import type { Page } from "playwright-core";

export async function verifyFox(page: Page) {
  const fox = page.locator("[data-fox]");
  const eye = fox.locator("[data-fox-eye]").first();
  const position = () => eye.getAttribute("transform");
  assert.ok(await fox.isVisible(), "the lean fox is rendered in the hero");
  await page.mouse.move(1400, 100);
  await page.waitForFunction(() => {
    const value = document.querySelector("[data-fox-eye]")!.getAttribute("transform") ?? "";
    return Number(value.match(/translate\(([-.\d]+)/)?.[1]) > 0.1;
  });
  await page.mouse.move(20, 100);
  await page.waitForFunction(() => {
    const value = document.querySelector("[data-fox-eye]")!.getAttribute("transform") ?? "";
    return Number(value.match(/translate\(([-.\d]+)/)?.[1]) < -0.1;
  });
  await page.waitForTimeout(700);
  const settled = await position();
  await page.waitForTimeout(100);
  assert.equal(await position(), settled, "gaze stops repainting once settled");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => document.querySelector("[data-fox-eye]")!.getAttribute("transform") === "translate(0 0)");
  await page.mouse.move(1400, 800);
  await page.waitForTimeout(100);
  assert.equal(await position(), "translate(0 0)", "reduced motion disables tracking");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // MediaQueryList's change event is delivered on the next rendering turn.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.mouse.move(20, 100);
  await page.waitForTimeout(700);
  const beforeTouch = await position();
  assert.notEqual(beforeTouch, "translate(0 0)", "mouse tracking resumes after reduced motion is turned off");
  await fox.dispatchEvent("pointermove", { pointerType: "touch", clientX: 1400, clientY: 800, bubbles: true });
  await page.waitForTimeout(300);
  assert.equal(await position(), beforeTouch, "touch scrolling never pulls the gaze");
  await page.locator("html").dispatchEvent("pointerleave");
  await page.waitForTimeout(700);
  const resting = await eye.evaluate((node: SVGGElement) => {
    const matrix = node.transform.baseVal.consolidate()!.matrix;
    return { e: matrix.e, f: matrix.f };
  });
  assert.ok(Math.abs(resting.e) < .01 && Math.abs(resting.f) < .01, "pointer exit gently returns to center");
  await page.mouse.move(1400, 100);
  await page.waitForTimeout(300);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  assert.equal(await position(), "translate(0 0)", "tab visibility changes settle the fox");
  await page.locator(".workflow-proof").scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await page.mouse.move(20, 200);
  await page.waitForTimeout(200);
  assert.equal(await position(), "translate(0 0)", "offscreen art ignores pointer movement");
  await page.evaluate(() => window.scrollTo(0, 0));
}
