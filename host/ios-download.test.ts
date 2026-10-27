import { describe, expect, test } from "bun:test";
import { exportPKCS8, generateKeyPair } from "jose";
import { approvedTestFlightLink, iosDownload, IOS_INVITE_FALLBACK, IOS_LOOKUP_DEADLINE_MS, publicTestFlightLink } from "./ios-download";
import type { Fetch, TestFlightEnv } from "./testflight";

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
        { id: "internal", attributes: { name: "Website", isInternalGroup: true, publicLinkEnabled: true, publicLink: link } },
        { id: "public", attributes: { name: "Website", isInternalGroup: false, publicLinkEnabled: true, publicLink: link } },
      ] });
      throw new Error(`unexpected ${path}`);
    });
    expect(result).toBe(link);
    expect(urls).toHaveLength(2);
    const list = new URL(urls[1]!);
    expect(list.pathname).toBe("/v1/apps/app/betaGroups");
    expect(list.searchParams.get("fields[betaGroups]")).toBe("name,isInternalGroup,publicLinkEnabled,publicLink");
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
    expect(post.headers.get("cache-control")).toBe("no-store");
  });
  test("query strings cannot bypass lookup caching and the browser never caches the handoff", async () => {
    let value: Response | undefined;
    let storedKey = "";
    const cache = { match: async () => value?.clone(), put: async (key: Request, response: Response) => { storedKey = key.url; value = response; } };
    await iosDownload(request(), env(), async () => Response.json({ data: { attributes: enabled } }), cache);
    expect(value!.headers.get("cache-control")).toBe("public, max-age=300");
    const cached = await iosDownload(request(), env(), async () => { throw new Error("cached lookup must not fetch"); }, cache);
    expect(storedKey).toBe("https://phux.sh/download/ios");
    expect(cached.headers.get("location")).toBe(link);
    expect(cached.headers.get("cache-control")).toBe("no-store");
  });
  test("a slow Apple lookup finishes after the visitor's redirect and serves the next visitor", async () => {
    let value: Response | undefined;
    const cache = { match: async () => value?.clone(), put: async (_key: Request, response: Response) => { value = response; } };
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } };
    const slow = async () => { await Bun.sleep(50); return Response.json({ data: { attributes: enabled } }); };
    const first = await iosDownload(request(), env(), slow, cache, ctx, 5);
    expect(first.headers.get("location")).toBe(IOS_INVITE_FALLBACK);
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(value!.headers.get("location")).toBe(link);
    expect(value!.headers.get("cache-control")).toBe("public, max-age=300");
    const next = await iosDownload(request(), env(), async () => { throw new Error("cached lookup must not fetch"); }, cache, ctx, 5);
    expect(next.headers.get("location")).toBe(link);
    expect(next.headers.get("cache-control")).toBe("no-store");
  });
  test("a cold lookup answers within the deadline and is not aborted", async () => {
    expect(IOS_LOOKUP_DEADLINE_MS).toBe(4_000);
    let value: Response | undefined;
    const cache = { match: async () => value?.clone(), put: async (_key: Request, response: Response) => { value = response; } };
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } };
    let signal: AbortSignal | undefined;
    let release!: (response: Response) => void;
    const gate = new Promise<Response>(resolve => { release = resolve; });
    const hung = (input: Request) => { signal = input.signal; return gate; };
    const started = performance.now();
    const first = await iosDownload(request(), env(), hung, cache, ctx, 200);
    expect(performance.now() - started).toBeLessThan(1_500);
    expect(first.headers.get("location")).toBe(IOS_INVITE_FALLBACK);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(pending).toHaveLength(1);
    await Bun.sleep(50);
    expect(signal?.aborted).toBe(false);
    release(Response.json({ data: { attributes: enabled } }));
    await Promise.all(pending);
    expect(value!.headers.get("location")).toBe(link);
    expect(value!.headers.get("cache-control")).toBe("public, max-age=300");
  });
  test("a disabled, internal, or failed link is remembered only briefly", async () => {
    const cases: Fetch[] = [
      async () => Response.json({ data: { attributes: { ...enabled, publicLinkEnabled: false } } }),
      async () => Response.json({ data: { attributes: { ...enabled, isInternalGroup: true } } }),
      async () => Response.json({ data: { attributes: { ...enabled, publicLink: "http://testflight.apple.com/join/x" } } }),
      async () => new Response(null, { status: 503 }),
    ];
    for (const fetchImpl of cases) {
      let value: Response | undefined;
      let fetches = 0;
      const cache = { match: async () => value?.clone(), put: async (_key: Request, response: Response) => { value = response; } };
      const counted: Fetch = async (input) => { fetches += 1; return fetchImpl(input); };
      const response = await iosDownload(request(), env(), counted, cache);
      expect(response.headers.get("location")).toBe(IOS_INVITE_FALLBACK);
      expect(value!.headers.get("location")).toBe(IOS_INVITE_FALLBACK);
      expect(value!.headers.get("cache-control")).toBe("public, max-age=60");
      const again = await iosDownload(request(), env(), async () => { throw new Error("cached fallback must not fetch"); }, cache);
      expect(again.headers.get("location")).toBe(IOS_INVITE_FALLBACK);
      expect(again.headers.get("cache-control")).toBe("no-store");
      expect(fetches).toBe(1);
    }
  });
  test("concurrent cold misses share one lookup", async () => {
    let value: Response | undefined;
    const cache = { match: async () => value?.clone(), put: async (_key: Request, response: Response) => { value = response; } };
    let fetches = 0;
    let release!: (response: Response) => void;
    const gate = new Promise<Response>(resolve => { release = resolve; });
    const fetchImpl: Fetch = async () => { fetches += 1; return gate; };
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } };
    const configured = env();
    const calls = Array.from({ length: 8 }, () => iosDownload(request(), configured, fetchImpl, cache, ctx, 5_000));
    for (let i = 0; i < 50 && fetches < 1; i += 1) await Bun.sleep(10);
    await Bun.sleep(20);
    expect(fetches).toBe(1);
    expect(pending).toHaveLength(8);
    release(Response.json({ data: { attributes: enabled } }));
    const responses = await Promise.all(calls);
    expect(fetches).toBe(1);
    for (const response of responses) expect(response.headers.get("location")).toBe(link);
    await Promise.all(pending);
  });
  test("a late failure does not overwrite a cached success", async () => {
    let stored: Response | undefined;
    let puts = 0;
    const cache = {
      match: async () => stored?.clone(),
      put: async (_key: Request, response: Response) => { puts += 1; stored = response; },
    };
    let fetches = 0;
    let release!: (response: Response) => void;
    const gate = new Promise<Response>(resolve => { release = resolve; });
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } };
    const response = iosDownload(request(), env(), () => { fetches += 1; return gate; }, cache, ctx, 5_000);
    for (let i = 0; i < 50 && fetches < 1; i += 1) await Bun.sleep(10);
    expect(fetches).toBe(1);
    stored = new Response(null, { status: 302, headers: { location: link, "cache-control": "public, max-age=300" } });
    release(new Response(null, { status: 429 }));
    expect((await response).headers.get("location")).toBe(IOS_INVITE_FALLBACK);
    await Promise.all(pending);
    expect(puts).toBe(0);
    expect(stored.headers.get("location")).toBe(link);
  });
  test("each waiting host stores the shared lookup on its own cache key", async () => {
    const stored = new Map<string, Response>();
    let matches = 0;
    const cache = {
      match: async (key: Request) => { matches += 1; return stored.get(key.url)?.clone(); },
      put: async (key: Request, response: Response) => { stored.set(key.url, response); },
    };
    let fetches = 0;
    let release!: (response: Response) => void;
    const gate = new Promise<Response>(resolve => { release = resolve; });
    const fetchImpl: Fetch = async () => { fetches += 1; return gate; };
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } };
    const configured = env();
    const first = new Request("https://phux.sh/download/ios");
    const second = new Request("https://preview.phux.sh/download/ios");
    const calls = [first, second].map(input => iosDownload(input, configured, fetchImpl, cache, ctx, 5_000));
    for (let i = 0; i < 50 && (fetches < 1 || matches < 2); i += 1) await Bun.sleep(10);
    expect(fetches).toBe(1);
    expect(matches).toBeGreaterThanOrEqual(2);
    release(Response.json({ data: { attributes: enabled } }));
    const responses = await Promise.all(calls);
    await Promise.all(pending);
    expect(fetches).toBe(1);
    for (const response of responses) expect(response.headers.get("location")).toBe(link);
    expect(stored.get("https://phux.sh/download/ios")!.headers.get("location")).toBe(link);
    expect(stored.get("https://preview.phux.sh/download/ios")!.headers.get("location")).toBe(link);
    expect(stored.get("https://phux.sh/download/ios")!.headers.get("cache-control")).toBe("public, max-age=300");
    expect(stored.get("https://preview.phux.sh/download/ios")!.headers.get("cache-control")).toBe("public, max-age=300");
  });
  test("a late failure fills only the host that does not already have a link", async () => {
    const stored = new Map<string, Response>();
    let matches = 0;
    const cache = {
      match: async (key: Request) => { matches += 1; return stored.get(key.url)?.clone(); },
      put: async (key: Request, response: Response) => { stored.set(key.url, response); },
    };
    let fetches = 0;
    let release!: (response: Response) => void;
    const gate = new Promise<Response>(resolve => { release = resolve; });
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } };
    const configured = env();
    const primary = "https://phux.sh/download/ios";
    const other = "https://preview.phux.sh/download/ios";
    const calls = [primary, other].map(url => iosDownload(new Request(url), configured, () => { fetches += 1; return gate; }, cache, ctx, 5_000));
    for (let i = 0; i < 50 && (fetches < 1 || matches < 2); i += 1) await Bun.sleep(10);
    expect(fetches).toBe(1);
    stored.set(primary, new Response(null, { status: 302, headers: { location: link, "cache-control": "public, max-age=300" } }));
    release(new Response(null, { status: 429 }));
    await Promise.all(calls);
    await Promise.all(pending);
    expect(fetches).toBe(1);
    expect(stored.get(primary)!.headers.get("location")).toBe(link);
    expect(stored.get(primary)!.headers.get("cache-control")).toBe("public, max-age=300");
    expect(stored.get(other)!.headers.get("location")).toBe(IOS_INVITE_FALLBACK);
    expect(stored.get(other)!.headers.get("cache-control")).toBe("public, max-age=60");
  });
  test("logs the rejection cause without the join code or credentials", async () => {
    const logs: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { logs.push(args.map(part => String(part)).join(" ")); };
    try {
      approvedTestFlightLink({ ...enabled, publicLinkEnabled: false });
      approvedTestFlightLink({ ...enabled, isInternalGroup: true });
      approvedTestFlightLink({ ...enabled, publicLink: `${link}?next=1` });
      const miss = () => ({ match: async () => undefined, put: async () => undefined });
      await iosDownload(request(), env(), async () => new Response(null, { status: 401 }), miss());
      await iosDownload(request(), env(), async () => new Response(null, { status: 429 }), miss());
      await iosDownload(request(), env(), async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }, miss());
    } finally {
      console.error = original;
    }
    const text = logs.join("\n");
    expect(text).toContain("public link disabled");
    expect(text).toContain("internal group");
    expect(text).toContain("bad URL");
    expect(text).toContain("HTTP 401");
    expect(text).toContain("HTTP 429");
    expect(text).toContain("timeout");
    expect(text).not.toContain("AbCd1234");
    expect(text).not.toContain("Bearer");
    expect(text).not.toContain("PRIVATE KEY");
  });
});
