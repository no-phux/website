import assert from "node:assert/strict";
import type { Page } from "playwright-core";

/** Make a real privacy choice before testing controls the delayed card can cover. */
export async function declineAnalytics(page: Page) {
  await page.getByRole("button", { name: "No thanks", exact: true }).click();
  assert.ok(await page.locator("#phux-consent").isHidden(), "the privacy choice leaves the controls unobstructed");
  assert.equal((await page.context().cookies()).find(cookie => cookie.name === "phux_consent")?.value, "denied", "the real privacy choice is recorded");
}
