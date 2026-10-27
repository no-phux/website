#!/usr/bin/env bun
/** Homepage acceptance against built assets; never uses a production server. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { verifyStaticHome } from "./home-static-checks";
import { verifyFox } from "./home-fox-checks";
import { assertInstallPickerCopy, homepageInstallPromise, verifyHomeContent } from "./home-content-checks";
import { verifyDeviceInstalls } from "./home-platform-checks";
import { platformVisitors } from "./home-platform-fixtures";
import { homeServer } from "./home-server";
import { verifyEmailFallback } from "./home-email-fallback-checks";
import { verifyClientComparison, verifyHomeAuthReturn, verifyHostedShell, verifyTouchComparison, verifyWorkspaceInstallCopy, verifyWorkspaceResize } from "./home-interaction-checks";

const root = resolve(import.meta.dir, "../dist");
const artifacts = resolve(import.meta.dir, "../.home-check");
const server = homeServer(root);
const base = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await mkdir(artifacts, { recursive: true });
  const context = await browser.newContext({ userAgent: platformVisitors.mac.userAgent, viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"], hasTouch: true });
  await context.addInitScript(() => Object.defineProperty(navigator, "maxTouchPoints", { get: () => 0 }));
  // Offline acceptance: never allocate production demo sessions or use real identity.
  await context.routeWebSocket(/wss?:\/\//, socket => socket.close());
  await context.route("**/auth/session", route => route.fulfill({ json: { authenticated: false } }));
  const page = await context.newPage();
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  // The TestFlight form is the one homepage network write; answer it locally.
  const beta: { payload: Record<string, string> | null } = { payload: null };
  await page.route("**/api/beta", async (route) => {
    beta.payload = route.request().postDataJSON() as Record<string, string>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, status: "invited" }),
    });
  });
  await page.goto(`${base}/`);
  await verifyHomeContent(page);
  assert.equal(await page.locator("#home-light iframe").count(), 0, "no live app exists before scrolling");
  assert.ok(await page.locator(".client-comparison").isVisible(), "real product screenshots lead the page");
  assert.equal(await page.locator(".download-primary").getAttribute("href"), "/download/desktop", "the primary action downloads the actual desktop release");
  await page.waitForTimeout(350);
  assert.ok(!requests.some(url => /(?:HeroDemo|PhuxTerminal|VgpuPrototype)[^/]*\.js|\.wasm|\/auth\/session|\/healthz|phux-architecture\.mp4/.test(url)), "first fold does not download React demos, GPU, WASM, film or allocate sessions");
  await verifyFox(page);
  await verifyClientComparison(page, artifacts);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${artifacts}/home-desktop.png` });
  await page.screenshot({ path: `${artifacts}/home-full.png`, fullPage: true });
  assert.equal(await page.locator("#how-it-works").count(), 0, "no homepage explainer");
  assert.equal(await page.locator(".hero-headline, .live-invitation, .features").count(), 0, "the landing carries no slogan block");
  await page.locator(".install-options > summary").click();
  await page.waitForFunction(() => parseFloat(document.querySelector<HTMLElement>(".install-tabs")!.style.getPropertyValue("--pill-width")) > 0);
  const installBox = await page.locator("#install").boundingBox();
  const comparisonBox = await page.locator(".client-comparison").boundingBox();
  assert.ok(installBox && comparisonBox && installBox.y < comparisonBox.y, "install controls lead into the real product");
  assert.equal(await page.locator(".tour").isVisible(), false, "the optional walkthrough stays closed initially");
  assert.equal(await page.locator("#install .install-request").count(), 0, "the homepage picker has no mobile request form");
  assert.equal(await page.locator(".beta, #testflight").count(), 0, "the landing carries no separate TestFlight band");
  assert.equal(await page.locator(".tour").count(), 1, "one product tour");
  assert.equal(await page.locator("body > header").count(), 1, "the landing carries one top bar");
  assert.deepEqual(
    await page.locator("body > header nav[aria-label='Primary navigation']").getByRole("link").evaluateAll(links => links.map(link => link.getAttribute("aria-label") ?? (link as HTMLElement).innerText)),
    ["phux", "Docs", "GitHub — phux source code"],
    "the top bar carries a recognizable GitHub source badge",
  );
  assert.equal(await page.locator(".tour-distant-host").count(), 3, "restrained background hosts");
  await page.locator("#connection-details > summary").click();
  const entry = page.getByRole("link", { name: "Open demo", exact: true });
  await page.locator(".tour").scrollIntoViewIfNeeded();
  await page.locator("astro-island:not([ssr]) .tour-entry").waitFor();
  assert.equal(await page.locator(".tour").getAttribute("data-pace"), "quick", "opens with the quick lap");
  await page.getByRole("button", { name: "Pause tour" }).click();
  const pausedProgress = await page.locator('.tour-chapters button[aria-pressed="true"]').getAttribute("style");
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.tour-chapters button[aria-pressed="true"]').getAttribute("style"), pausedProgress, "pause freezes the quick lap");
  await page.getByRole("button", { name: "Play tour" }).click();
  await page.locator('.tour[data-pace="walkthrough"]').waitFor({ timeout: 12_000 });
  assert.equal(await page.locator('.tour-chapters button[aria-pressed="true"]').innerText(), "01 Attach", "quick lap restarts as an explanatory walkthrough");
  // The playback checks used the mouse. Exercise actual keyboard navigation
  // before asserting :focus-visible, rather than relying on browser modality.
  await entry.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".tour-open")!).opacity === "1");
  assert.equal(await page.locator(".tour-open").evaluate((node) => getComputedStyle(node).opacity), "1", "keyboard focus reveals the demo");
  assert.equal(await page.locator(".tour-open").evaluate((node) => getComputedStyle(node).backdropFilter), "none", "the invitation never blurs or covers the illustration");
  assert.equal((await page.locator(".tour-open").innerText()).trim(), "Open demo");
  assert.equal(await page.locator("dialog[open]").count(), 0, "discovery does not launch a session");
  await entry.hover();
  assert.equal(await page.locator("dialog[open]").count(), 0, "hover only prepares the client");
  const chapters = page.getByRole("group", { name: "Tour chapters" }).getByRole("button");
  assert.equal(await chapters.count(), 4, "four tour chapters");
  await chapters.nth(2).click();
  assert.equal(await chapters.nth(2).getAttribute("aria-pressed"), "true", "chapter selection");
  assert.equal(await page.locator(".tour").getAttribute("data-pace"), "walkthrough", "manual chapter selection uses readable pacing");
  await page.getByRole("button", { name: "Pause tour" }).click();
  assert.ok(await page.getByRole("button", { name: "Play tour" }).isVisible(), "tour pauses");
  await page.getByRole("button", { name: "Copy install command" }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "curl -fsSL https://phux.sh/install | sh");
  assert.equal(await page.getByRole("status").innerText(), "Install command copied.");
  // The hero switcher swaps the command on hover, focus, click, and arrows,
  // and turns Desktop into a download. There is no mobile target.
  const command = page.locator("#install-command");
  const line = page.locator("#install .install-line");
  const target = (name: string) => page.locator(`#install [data-install-target="${name}"]`);
  assert.deepEqual(await page.locator("#install .install-tabs button").allInnerTexts(), ["CLI", "Desktop"], "two install targets");
  await assertInstallPickerCopy(page);
  const tabs = page.locator("#install [data-install-target]");
  for (let index = 0; index < await tabs.count(); index++) {
    await tabs.nth(index).click();
    assert.doesNotMatch((await page.locator("#install-note").innerText()).trim(), homepageInstallPromise, "each install tab note stays off the phone");
  }
  await target("cli").click();
  const download = page.locator("#install-download");
  await target("desktop").hover();
  assert.ok(await download.isVisible(), "hover swaps to the desktop download");
  assert.equal(await command.isHidden(), true, "Desktop leads with the download, not a command");
  assert.equal(await download.getAttribute("href"), "/download/desktop", "the download is the worker's stable Mac archive redirect");
  assert.equal((await page.locator("#install-note").innerText()).trim(), "First open: macOS asks to confirm an app downloaded from the internet. Choose Open.", "the first-open line stays until a real Mac confirms it");
  assert.equal(await page.locator(".linux-desktop-note").count(), 0);
  await target("desktop").focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(await line.isVisible(), true, "arrow keys move the target back to CLI");
  assert.equal(await download.isHidden(), true, "CLI restores the command line");
  await page.keyboard.press("ArrowRight");
  assert.ok(await download.isVisible(), "arrow keys move the target on to Desktop");
  await page.getByRole("button", { name: "Copy install command" }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "curl -fsSL https://phux.sh/install-desktop | sh", "Desktop keeps its installer on the copy button");
  // Regression: a content-sized dock widened with the command and slid the
  // targets out from under the pointer. The dock and its targets are pinned.
  const box = (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
    });
  const dock = await box("#install");
  const cliTarget = await box('#install [data-install-target="cli"]');
  for (const name of ["desktop", "cli"]) {
    await target(name).hover();
    assert.deepEqual(await box("#install"), dock, `the dock keeps its box while ${name} is previewed`);
    assert.deepEqual(await box('#install [data-install-target="cli"]'), cliTarget, `targets stay pinned while ${name} is previewed`);
  }
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 600 ? 740 : 900 });
    await page.locator(".install-options").evaluate((node: HTMLDetailsElement) => { node.open = false; });
    await page.evaluate(() => window.scrollTo(0, 0));
    const preview = (await page.locator(".client-comparison").boundingBox())!;
    assert.ok(preview.y < (width < 600 ? 740 : 650), `the fox and real product begin within the first screen at ${width}px`);
    const downloadBox = (await page.locator(".download-primary").boundingBox())!;
    assert.ok(downloadBox.y + downloadBox.height < preview.y, "the primary download is visible before the reveal");
    assert.ok(downloadBox.y + downloadBox.height < (width < 600 ? 500 : 600), "install is reachable without scrolling");
    await page.locator(".install-options > summary").click();
    for (const name of ["desktop", "cli"]) {
      await target(name).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow with ${name} at ${width}px`);
    }
    assert.ok(await page.locator("#install code").evaluate((code) => code.scrollWidth <= code.clientWidth), `full install command readable at ${width}px`);
    assert.equal(await page.locator("#beta-note").innerText(), "", "changing install targets clears unrelated signup/copy feedback");
    await page.locator("#install-command").evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
    await page.locator(".install-options > summary").click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${artifacts}/home-${width}.png` });
  }
  await page.getByRole("link", { name: "Open demo", exact: true }).click();
  await page.locator("dialog[open]").waitFor();
  assert.equal(await page.locator(".tour").getAttribute("data-playing"), "false", "live demo suspends the illustrated tour");
  await page.getByRole("button", { name: "Close live terminal" }).click();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.ok(await page.getByRole("link", { name: "Open demo", exact: true }).evaluate((link) => link === document.activeElement), "closing restores focus");
  await page.goto(`${base}/more`);
  assert.equal(await page.getByRole("link", { name: /Built for automation/ }).getAttribute("href"), "https://docs.phux.sh/agents");
  assert.ok(await page.locator("#testflight form").isHidden(), "email is optional and does not summon a keyboard");
  await page.locator("#testflight [data-email-invite] > summary").click();
  await page.locator("#testflight input[name=email]").fill("more@example.com");
  await page.locator("#testflight button[type=submit]").click();
  await page.waitForFunction(() => document.querySelector("#beta-note")?.textContent?.includes("Invite sent") ?? false);
  assert.equal(beta.payload?.email, "more@example.com", "/more still posts the TestFlight request");
  assert.ok(await page.locator("#beta form").isVisible(), "release signup is preserved");
  assert.equal(await page.locator("[data-copy]").count(), 2, "alternate installers preserved");
  const macDesktop = await page.locator(".desktop-install p").innerText();
  assert.match(macDesktop, /macOS 26 or later/);
  assert.match(macDesktop, /The app includes the phux CLI and server/);
  assert.match(macDesktop, /Developer ID signed and Apple-notarized/);
  assert.doesNotMatch(macDesktop, /macOS 27|ad-hoc|not Apple-notarized|Homebrew/i);
  await page.goto(`${base}/privacy`);
  assert.equal(await page.getByRole("link", { name: "join the beta" }).getAttribute("href"), "/more#beta");
  assert.equal(await page.getByRole("link", { name: "request access to phux for iPhone" }).getAttribute("href"), "/more#testflight");
  await page.goto(`${base}/telemetry`);
  assert.equal(await page.getByRole("link", { name: "release mailing list" }).getAttribute("href"), "/more#beta");
  // Legacy live links now scroll to an inline workspace; neither hides the hero
  // nor allocates anything until the workspace itself is visible.
  await page.goto(`${base}/?hero=light`);
  const live = page.frameLocator("#home-light iframe");
  const hookLine = live.locator(".install-hook-line code");
  await hookLine.waitFor();
  const stillness = async () => page.locator("#home-light").evaluate((node) => Math.round(node.getBoundingClientRect().height));
  const settled = await stillness();
  await page.waitForTimeout(1500);
  assert.equal(await stillness(), settled, "the hero frame stays stable while its terminals connect");
  await verifyWorkspaceResize(page);
  await verifyWorkspaceInstallCopy(page);
  assert.equal(await live.locator(".install-hook-lede, .install-hook-proof, .live-session-hint").count(), 0, "the live hero has no surrounding marketing prose");
  assert.deepEqual(await live.locator(".install-hook-tabs button").allInnerTexts(), ["CLI", "Desktop"], "the live install hook has no mobile target");
  assert.doesNotMatch(await live.locator(".install-hook").innerText(), homepageInstallPromise, "the live install hook does not name a phone");
  assert.ok(await page.locator(".hero").isVisible(), "the live workspace never replaces the product introduction");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => !document.querySelector("#home-light iframe"));
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#home-light iframe").count(), 0, "scrolling away releases the iframe, GPU and disposable connection");
  await page.getByRole("link", { name: "Open the browser demo", exact: true }).click();
  await page.locator("#home-light iframe").waitFor();
  await page.frameLocator("#home-light iframe").locator(".install-hook").waitFor();
  assert.equal(await page.locator("#home-light iframe").count(), 1, "returning creates exactly one fresh workspace");

  await verifyTouchComparison(page, base, artifacts);
  await verifyHostedShell(page, base, artifacts);
  await verifyHomeAuthReturn(page, base);
  assert.deepEqual(errors, [], "no browser exceptions");
  await context.close();
  await verifyDeviceInstalls(browser, base, artifacts);
  await verifyEmailFallback(browser, base);
  await verifyStaticHome(browser, base);
  console.log(`PASS home: real workspace captures, pointer/touch/keyboard reveal and enlargement, first-fold install, optional walkthrough, lazy workspace lifecycle, install/copy/beta, tour chapters/pause/focus, glass shell auth/failure recovery, mobile/tablet/desktop, reduced motion, no-JS, idle resource budget. Screenshots: ${artifacts}`);
} finally {
  await browser.close();
  server.stop(true);
}
