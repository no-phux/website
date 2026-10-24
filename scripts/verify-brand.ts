#!/usr/bin/env bun
/** Exercise the public brand kit and its exact release download on built assets. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dir, "../dist");
const lock = await Bun.file(resolve(import.meta.dir, "../brand.lock.json")).json();
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    let path = resolve(root, `.${pathname}`);
    if (!path.startsWith(`${root}/`)) return new Response(null, { status: 403 });
    if (!(await Bun.file(path).exists()) && !extname(path)) path += ".html";
    const file = Bun.file(path);
    if (!(await file.exists())) return new Response(null, { status: 404 });
    return new Response(file);
  },
});
const base = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const artifactRoot = resolve(import.meta.dir, "../.home-check");
  await mkdir(artifactRoot, { recursive: true });
  const context = await browser.newContext();
  await context.route("**/api/**", route => route.fulfill({ status: 204 }));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/brand`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Made for PHUX." }).waitFor();
    assert.equal(await page.locator("footer a[href='/brand']").count(), 1);
    const images = await page.locator("article img").evaluateAll(elements =>
      elements.every(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0),
    );
    assert.ok(images, "all brand previews load");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal overflow");
    await page.screenshot({ path: resolve(artifactRoot, `brand-${width}.png`), fullPage: true });
  }
  const download = page.getByRole("link", { name: `Download PHUX brand ${lock.version}` });
  const href = await download.getAttribute("href");
  assert.equal(href, `/brand/releases/${lock.version}/phux-brand.zip`);
  const response = await fetch(`${base}${href}`);
  assert.equal(response.status, 200);
  const checksum = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
  assert.equal(checksum, lock.sha256, "the served archive is the pinned private release");
  const sumsResponse = await fetch(`${base}/brand/releases/${lock.version}/SHA256SUMS`);
  assert.equal(sumsResponse.status, 200);
  const sums = await sumsResponse.text();
  assert.equal(sums, `${checksum}  phux-brand.zip\n`);
  await page.getByText("Verify this download", { exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.ok(await page.locator("details").evaluate(element => element instanceof HTMLDetailsElement && element.open), "checksum disclosure works from the keyboard");
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`PASS brand kit: responsive previews, keyboard disclosure, retained release, and SHA-256 ${checksum}`);
} finally {
  await browser.close();
  server.stop(true);
}
