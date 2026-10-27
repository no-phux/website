import { describe, expect, test } from "bun:test";
import { exportPKCS8, generateKeyPair } from "jose";
import { approvedTestFlightLink, iosDownload, IOS_INVITE_FALLBACK, publicTestFlightLink } from "./ios-download";
import type { TestFlightEnv } from "./testflight";

const pair = await generateKeyPair("ES256", { extractable: true });
const pem = await exportPKCS8(pair.privateKey);
const env = (extra: Partial<TestFlightEnv> = {}): TestFlightEnv => ({ ASC_KEY_ID: "KEY", ASC_ISSUER_ID: crypto.randomUUID(), ASC_PRIVATE_KEY: pem, ASC_BETA_GROUP_ID: "external", ...extra });
const link = "https://testflight.apple.com/join/AbCd1234";
const request = () => new Request("https://phux.sh/download/ios?cachebuster=ignored");
const enabled = { publicLinkEnabled: true, publicLink: link, isInternalGroup: false };

describe("native TestFlight handoff", () => {
  test("only accepts enabled, external, exact Apple join links", () => {
    expect(approvedTestFlightLink(enabled)).toBe(link);
    expect(approvedTestFlightLink({ ...enabled, publicLinkEnabled: false })).toBeNull();
    expect(approvedTestFlightLink({ ...enabled, isInternalGroup: true })).toBeNull();
    for (const publicLink of [null, "invalid", "javascript:alert(1)", "http://testflight.apple.com/join/x", "https://testflight.apple.com.evil.test/join/x", "https://user@testflight.apple.com/join/x", `${link}?next=https://evil.test`, `${link}#secret`]) {
      expect(approvedTestFlightLink({ ...enabled, publicLink })).toBeNull();
    }
  });
  test("reads the existing configured group without changing distribution or creating a tester", async () => {
    const calls: Request[] = [];
    expect(await publicTestFlightLink(env(), async input => {
      calls.push(input);
      return Response.json({ data: { attributes: enabled } });
    })).toBe(link);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("GET");
    expect(new URL(calls[0]!.url).pathname).toBe("/v1/betaGroups/external");
    expect(calls[0]!.headers.get("authorization")).toStartWith("Bearer ");
  });
  test("can resolve the same named external group as the existing email-invite flow", async () => {
    const urls: string[] = [];
    const result = await publicTestFlightLink(env({ ASC_BETA_GROUP_ID: undefined, ASC_BETA_GROUP: "Website" }), async input => {
      urls.push(input.url);
      const path = new URL(input.url).pathname;
      if (path === "/v1/apps") return Response.json({ data: [{ id: "app" }] });
      if (path === "/v1/apps/app/betaGroups") return Response.json({ data: [
        { id: "internal", attributes: { name: "Website", isInternalGroup: true } },
        { id: "public", attributes: { name: "Website", isInternalGroup: false } },
      ] });
      return Response.json({ data: { attributes: enabled } });
    });
    expect(result).toBe(link);
    expect(urls.at(-1)).toContain("/betaGroups/public?");
  });
  test("normal GET/HEAD navigation redirects to Apple without asking for email", async () => {
    for (const method of ["GET", "HEAD"]) {
      const response = await iosDownload(new Request(request(), { method }), env(), async () => Response.json({ data: { attributes: enabled } }));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(link);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(await response.text()).toBe("");
    }
  });
  test("missing credentials, disabled links, and Apple errors keep an optional email escape path", async () => {
    const missing = await iosDownload(request(), {}, async () => { throw new Error("must not reach Apple"); });
    expect(missing.headers.get("location")).toBe(IOS_INVITE_FALLBACK);
    const disabled = await iosDownload(request(), env(), async () => Response.json({ data: { attributes: { ...enabled, publicLinkEnabled: false } } }));
    expect(disabled.headers.get("location")).toBe(IOS_INVITE_FALLBACK);
    const failed = await iosDownload(request(), env(), async () => new Response(null, { status: 503 }));
    expect(failed.headers.get("location")).toBe(IOS_INVITE_FALLBACK);
    const post = await iosDownload(new Request(request(), { method: "POST" }), {});
    expect(post.status).toBe(405);
  });
  test("query strings cannot bypass lookup caching and the browser never caches the handoff", async () => {
    let value: Response | undefined;
    let storedKey = "";
    const cache = { match: async () => value?.clone(), put: async (key: Request, response: Response) => { storedKey = key.url; value = response; } };
    await iosDownload(request(), env(), async () => Response.json({ data: { attributes: enabled } }), cache);
    expect(value!.headers.get("cache-control")).toBe("public, max-age=60");
    const cached = await iosDownload(request(), env(), async () => { throw new Error("cached lookup must not fetch"); }, cache);
    expect(storedKey).toBe("https://phux.sh/download/ios");
    expect(cached.headers.get("location")).toBe(link);
    expect(cached.headers.get("cache-control")).toBe("no-store");
  });
});
