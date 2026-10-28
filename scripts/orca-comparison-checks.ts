import assert from "node:assert/strict";
import type { Browser } from "playwright-core";

/** The comparison is real reader content, not just a matching source string. */
export async function verifyOrcaComparison(browser: Browser, base: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${base}/compare#phux-vs-orca`);
    const heading = page.getByRole("heading", { level: 2, name: "phux vs Orca", exact: true });
    const table = page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Category", exact: true }) });
    assert.equal(await table.getByRole("row").count(), 17, "sixteen comparison categories plus headers");
    assert.match(await table.innerText(), /native Windows x64 desktop with a required WSL 2 coordinator/);
    assert.match(await table.innerText(), /This is not a phux-only feature/);
    assert.match(await table.innerText(), /No speed or memory winner is asserted/);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      assert.ok(await heading.isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `comparison stays inside reader at ${width}px`);
    }
    assert.ok(await table.getByRole("link", { name: "Changes", exact: true }).isVisible());
    const source = table.getByRole("link", { name: "README", exact: true }).first();
    assert.match(await source.getAttribute("href") ?? "", /stablyai\/orca\/blob\/[a-f0-9]{40}\/README.md/);
  } finally {
    await context.close();
  }
  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  try {
    const staticPage = await staticContext.newPage();
    await staticPage.goto(`${base}/compare#phux-vs-orca`);
    assert.ok(await staticPage.getByRole("heading", { name: "phux vs Orca", exact: true }).isVisible());
    assert.match(await staticPage.locator("main").innerText(), /Choose Orca/);
  } finally {
    await staticContext.close();
  }
}
