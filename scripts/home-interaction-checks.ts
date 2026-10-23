/** Focused browser checks shared by the homepage acceptance entry point. */
import assert from "node:assert/strict";
import type { Page } from "playwright-core";

export async function verifyClientComparison(page: Page) {
  const slider = page.getByRole("slider", { name: "Reveal desktop client" });
  await slider.focus();
  await slider.press("ArrowLeft");
  assert.equal(await slider.inputValue(), "51", "the native slider supports keyboard adjustment");
  await slider.press("Home");
  assert.equal(await slider.inputValue(), "0", "Home reveals the terminal client");
  await slider.press("End");
  assert.equal(await slider.inputValue(), "100", "End reveals the desktop client");
  await page.locator('[data-client-position="0"]').click();
  assert.equal(await slider.inputValue(), "0", "the TUI shortcut reveals the full terminal");
  await page.locator('[data-client-position="100"]').click();
  assert.equal(await slider.inputValue(), "100", "the GUI shortcut reveals the full desktop");
  await slider.fill("50");
  const track = (await slider.boundingBox())!;
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * .75, track.y + track.height / 2, { steps: 12 });
  await page.mouse.up();
  assert.ok(Number(await slider.inputValue()) < 35, "dragging the divider changes the reveal");
  assert.equal(await slider.getAttribute("aria-valuetext"), `${await slider.inputValue()}% desktop client`, "assistive text tracks the actual reveal");
  // The visible divider and native thumb must agree away from the midpoint.
  // Native thumbs have half-thumb end insets; a full-width visual rule does not.
  await slider.fill("90");
  const stage = (await page.locator(".comparison-stage").boundingBox())!;
  const handleX = stage.x + 1 + (stage.width - 2) * .1;
  await page.mouse.move(handleX - 14, track.y + track.height / 2);
  await page.mouse.down();
  assert.equal(await slider.inputValue(), "90", "grabbing the visible handle never jumps onto the range track");
  await page.mouse.move(handleX + 20, track.y + track.height / 2, { steps: 6 });
  await page.mouse.up();
  assert.ok(Number(await slider.inputValue()) < 90, "the off-center handle remains draggable");
  await slider.fill("50");
}

export async function verifyTouchComparison(page: Page, base: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  const slider = page.getByRole("slider", { name: "Reveal desktop client" });
  const box = (await slider.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const touch = (x: number) => [{ x, y: box.y + box.height / 2 }];
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touch(box.x + box.width / 2) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touch(box.x + box.width * .25) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert.ok(Number(await slider.inputValue()) > 60, "the comparison responds to a real touch gesture");
  } finally {
    await cdp.detach();
  }
}

export async function verifyHostedShell(page: Page, base: string, artifacts: string) {
  await page.goto(`${base}/embed`);
  if (await page.locator(".embed-frame").getAttribute("data-configured") !== "true") {
    await page.getByText("Live demo is not configured.", { exact: true }).waitFor();
    return;
  }
  await page.getByRole("heading", { name: "A Linux shell, right here." }).waitFor();
  for (const name of ["Continue with GitHub", "Continue with Google", "Use instant edge shell"]) {
    const action = page.getByRole("button", { name, exact: true });
    assert.ok(await action.isVisible(), `${name}: preserved in the glass shell`);
    assert.ok((await action.boundingBox())!.height >= 44, `${name}: touch target`);
  }
  await page.getByText("Info", { exact: true }).click();
  assert.match(await page.locator(".pterm-info-body").innerText(), /Network.*blocked/s, "the inspector keeps the honest limits");
  await page.getByText("Info", { exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `standalone shell fits at ${width}px`);
    await page.screenshot({ path: `${artifacts}/shell-${width}.png` });
  }
  await page.getByRole("button", { name: "Use instant edge shell", exact: true }).click();
  await page.getByRole("button", { name: "Return to controls", exact: true }).click();
  await page.getByRole("button", { name: "Use instant edge shell", exact: true }).waitFor();
  assert.equal(await page.locator(".pterm").getAttribute("data-status"), "unlock", "a failed edge attempt returns to the native sign-in and no-sign-in escape");
}

export async function verifyWorkspaceResize(page: Page) {
  await page.locator("#home-light iframe").evaluate(frame => frame.setAttribute("data-instance", "retained"));
  // Reproduce a height grown by a stacked workspace before a width change.
  await page.locator("#home-light").evaluate(host => { host.style.height = "1000px"; });
  await page.waitForTimeout(100);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => document.getElementById("home-light")!.getBoundingClientRect().height < 1000);
  await page.waitForTimeout(150);
  assert.ok((await page.locator("#home-light").boundingBox())!.height < 1000, "a width change can shrink a previously expanded workspace");
  assert.equal(await page.locator("#home-light iframe").getAttribute("data-instance"), "retained", "resize never replaces the active session");
}

export async function verifyHomeAuthReturn(page: Page, base: string) {
  await page.goto(`${base}/?auth=error&auth_error=cancelled&hero=light`);
  await page.getByRole("dialog").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /Sign-in was cancelled/, "OAuth returns wake the lazy terminal and retain the error");
  assert.equal(await page.locator("#home-light iframe").count(), 0, "OAuth returns do not also allocate a glass workspace");
  await page.getByRole("button", { name: "Close live terminal" }).click();
}
