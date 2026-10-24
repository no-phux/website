/** Focused browser checks shared by the homepage acceptance entry point. */
import assert from "node:assert/strict";
import type { Page } from "playwright-core";

export async function verifyClientComparison(page: Page) {
  const images = page.locator("[data-product-image] img");
  assert.equal(await images.count(), 2, "two real product screenshots");
  for (const image of await images.all()) {
    assert.ok(await image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth >= 1400), "the full-resolution product capture loaded");
    assert.match(await image.getAttribute("src") ?? "", /^\/product\/.+\.webp$/);
  }
  const desktop = page.getByRole("link", { name: "Enlarge Desktop screenshot" });
  await desktop.focus();
  await desktop.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Product screenshot" });
  assert.ok(await dialog.isVisible(), "keyboard opens a full-size screenshot");
  assert.match(await dialog.locator("img").getAttribute("src") ?? "", /desktop\.webp$/);
  await page.keyboard.press("Escape");
  assert.equal(await dialog.isVisible(), false, "Escape closes the screenshot");
  assert.ok(await desktop.evaluate(node => node === document.activeElement), "closing returns focus to the screenshot link");
  await page.getByRole("link", { name: "Enlarge TUI screenshot" }).click();
  assert.ok(await dialog.isVisible());
  await page.getByRole("button", { name: "Close screenshot", exact: true }).click();
  assert.equal(await dialog.isVisible(), false, "the close button dismisses the screenshot");
}

export async function verifyTouchComparison(page: Page, base: string, artifacts: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.screenshot({ path: `${artifacts}/home-mobile.png` });
  await page.getByRole("link", { name: "Enlarge Desktop screenshot" }).tap();
  assert.ok(await page.getByRole("dialog", { name: "Product screenshot" }).isVisible(), "touch opens the real desktop capture");
  await page.getByRole("button", { name: "Close screenshot", exact: true }).tap();
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

export async function verifyWorkspaceInstallCopy(page: Page) {
  const live = page.frameLocator("#home-light iframe");
  const hookLine = live.locator(".install-hook-line code");
  assert.equal(await live.locator(".live-primary > .install-hook").count(), 1, "install controls follow their terminal rather than an external CTA slot");
  assert.equal(await hookLine.innerText(), "curl -fsSL https://phux.sh/install | sh", "the live hero leads with the CLI install");
  // Keep the clipboard asynchronous so reading before copy completion fails reliably.
  await hookLine.evaluate(() => {
    const writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async (text) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await writeText(text);
    };
  });
  await live.locator(".install-hook-copy").click();
  await live.locator(".install-hook-status").filter({ hasText: /^Copied\.$/ }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "curl -fsSL https://phux.sh/install | sh", "the hook copies from inside the frame");
  assert.equal(await live.locator(".install-hook-status").innerText(), "Copied.", "copy keeps concise accessible feedback");
}

export async function verifyHomeAuthReturn(page: Page, base: string) {
  await page.goto(`${base}/?auth=error&auth_error=cancelled&hero=light`);
  await page.getByRole("dialog").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /Sign-in was cancelled/, "OAuth returns wake the lazy terminal and retain the error");
  assert.equal(await page.locator("#home-light iframe").count(), 0, "OAuth returns do not also allocate a glass workspace");
  await page.getByRole("button", { name: "Close live terminal" }).click();
}
