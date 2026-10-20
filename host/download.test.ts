import { beforeEach, describe, expect, test } from "bun:test";
import { desktopDownload, resetDesktopDownload, type Fetch } from "./download";

const manifest = (version: unknown, channel = "stable") =>
  Response.json({ schema_version: 1, channel, products: { desktop: { version, artifacts: {} } } });

describe("GET /download/desktop", () => {
  beforeEach(resetDesktopDownload);

  test("redirects to the archive derived from the stable manifest's version", async () => {
    const urls: string[] = [];
    const fetchImpl: Fetch = async (url) => {
      urls.push(url);
      return manifest("0.40.0");
    };
    const response = await desktopDownload(fetchImpl, 0);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://github.com/no-phux/phux/releases/download/desktop-v0.40.0/phux-desktop-0.40.0-macos-arm64.zip",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(urls).toEqual(["https://github.com/no-phux/phux/releases/download/channels/stable.json"]);
  });

  test("remembers the version for five minutes", async () => {
    let calls = 0;
    const fetchImpl: Fetch = async () => {
      calls += 1;
      return manifest(calls === 1 ? "0.40.0" : "0.41.0");
    };
    await desktopDownload(fetchImpl, 0);
    expect((await desktopDownload(fetchImpl, 60_000)).headers.get("location")).toContain("0.40.0");
    expect(calls).toBe(1);
    expect((await desktopDownload(fetchImpl, 5 * 60_000)).headers.get("location")).toContain("0.41.0");
  });

  test("falls back to the last good version, then to the releases page", async () => {
    await desktopDownload(async () => manifest("0.40.0"), 0);
    const failing: Fetch = async () => new Response("nope", { status: 503 });
    expect((await desktopDownload(failing, 10 * 60_000)).headers.get("location")).toContain("desktop-v0.40.0");
    resetDesktopDownload();
    for (const fetchImpl of [
      failing,
      (async () => { throw new Error("offline"); }) as Fetch,
      async () => manifest("0.40"),
      async () => manifest("../../evil"),
      async () => manifest("0.40.0", "next"),
    ]) {
      expect((await desktopDownload(fetchImpl, 0)).headers.get("location")).toBe("https://github.com/no-phux/phux/releases");
    }
  });
});
