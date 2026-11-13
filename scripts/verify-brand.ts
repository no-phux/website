#!/usr/bin/env bun
/** Exercise the public brand kit and its exact release download on built assets. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright-core";
import { monoWordmarkUrl } from "../src/lib/brand";

const root = resolve(import.meta.dir, "../dist");
const lock = await Bun.file(resolve(import.meta.dir, "../brand.lock.json")).json();
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  async fetch(request) {
    const pathname = new URL(request.url).pathname.replace(/^\/$/, "/index.html");
    let path = resolve(root, `.${pathname}`);
    if (!path.startsWith(`${root}/`)) return new Response(null, { status: 403 });
    if (!(await Bun.file(path).exists()) && !extname(path)) path += ".html";
    const file = Bun.file(path);
    if (!(await file.exists())) return new Response(null, { status: 404 });
    return new Response(file);
  },
});
const base = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
  headless: true,
});
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
  for (const record of Object.values(lock.files) as { destination: string; sha256: string }[]) {
    if (!record.destination.startsWith("public/brand/images/")) continue;
    const asset = await fetch(`${base}/${record.destination.slice("public/".length)}?v=${lock.version}`);
    assert.equal(asset.status, 200, record.destination);
    assert.equal(createHash("sha256").update(Buffer.from(await asset.arrayBuffer())).digest("hex"), record.sha256, `${record.destination}: served canonical bytes`);
  }
  await page.getByText("Verify this download", { exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.ok(await page.locator("details").evaluate(element => element instanceof HTMLDetailsElement && element.open), "checksum disclosure works from the keyboard");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["/", "/overview", "/embed", "/concepts/vgpu", "/concepts/vgpu?variant=machine", "/concepts/vgpu?variant=observatory", "/concepts/vgpu?variant=combo"]) {
      await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
      const logo = page.locator(".phux-wordmark:visible").first();
      await logo.waitFor();
      const bounds = await logo.boundingBox();
      assert.ok(bounds && bounds.width > 0 && bounds.height > 0, `${route}: visible wordmark`);
      for (const mark of await page.locator(".phux-wordmark:visible").all()) {
        assert.ok(await mark.evaluate(element => getComputedStyle(element).maskImage !== "none"), `${route}: canonical artwork mask`);
        const image = mark.locator("img");
        assert.equal(await image.getAttribute("src"), monoWordmarkUrl());
        assert.ok(await image.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0), `${route}: release SVG loads`);
        const box = await mark.boundingBox();
        assert.ok(box && box.width >= 108 && Math.abs(box.width / box.height - 17 / 7) < .02, `${route}: minimum size and intrinsic 17:7 ratio`);
        assert.ok(await mark.evaluate(element => getComputedStyle(element).backgroundColor === getComputedStyle(element).color), `${route}: artwork follows surrounding ink`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route}: no horizontal overflow`);
      await page.screenshot({ path: resolve(artifactRoot, `wordmark-${route.replace(/\W/g, "") || "home"}-${width}.png`) });
      if (route === "/overview") {
        await page.evaluate(() => document.documentElement.classList.add("dark"));
        await page.screenshot({ path: resolve(artifactRoot, `wordmark-overview-dark-${width}.png`) });
        await page.emulateMedia({ forcedColors: "active" });
        assert.ok(await logo.evaluate(element => getComputedStyle(element).maskImage !== "none"), "forced-colors keeps canonical glyphs");
        await page.emulateMedia({ forcedColors: "none" });
      }
    }
  }
  await page.setViewportSize({ width: 680, height: 600 });
  await page.setContent(`<main style="margin:0;font:16px sans-serif">
    <section style="padding:24px;background:#171a1e;color:#e7e2da">Dark surface<br>
      <img alt="PHUX light SVG" src="${base}/brand/images/wordmark-light.svg?v=${lock.version}" width="272" height="112">
      <img alt="PHUX light PNG" src="${base}/brand/images/wordmark-light-512.png?v=${lock.version}" width="272" height="112">
    </section>
    <section style="padding:24px;background:#e7e2da;color:#090a0c">Light surface<br>
      <img alt="PHUX dark SVG" src="${base}/brand/images/wordmark-dark.svg?v=${lock.version}" width="272" height="112">
      <img alt="PHUX dark PNG" src="${base}/brand/images/wordmark-dark-512.png?v=${lock.version}" width="272" height="112">
    </section></main>`, { waitUntil: "networkidle" });
  assert.ok(await page.locator("img").evaluateAll(elements => elements.every(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)), "external embed SVG and PNG variants load");
  await page.screenshot({ path: resolve(artifactRoot, "wordmark-embeds.png") });
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`PASS brand kit: responsive previews, keyboard disclosure, retained release, and SHA-256 ${checksum}`);
} finally {
  await browser.close();
  server.stop(true);
}
