import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { monoWordmarkUrl } from "../src/lib/brand";
import { Wordmark } from "../src/components/Wordmark";

describe("release-aware wordmark", () => {
  test("does not request artwork missing from the pin", () => {
    expect(monoWordmarkUrl({ version: "1.4.0", files: {} })).toBeUndefined();
  });

  test("uses only the installed canonical destination and cache-busts releases", () => {
    expect(monoWordmarkUrl({
      version: "1.5.0",
      files: { "logos/approved-name.svg": { destination: "public/brand/images/mono-wordmark.svg" } },
    })).toBe("/brand/images/mono-wordmark.svg?v=1.5.0");
  });

  test("has an accessible standalone name", () => {
    const html = renderToStaticMarkup(createElement(Wordmark));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="PHUX"');
  });

  test("can be decorative inside an explicitly named home link", () => {
    const html = renderToStaticMarkup(createElement(Wordmark, { decorative: true }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain("aria-label");
  });
});
