import { describe, expect, test } from "bun:test";
import {
  classifyRef,
  classifyReferrer,
  classifyRequest,
  classifySignal,
  classifyUserAgent,
  shouldSkipPath,
} from "./telemetry";

function htmlResponse(accept?: string) {
  const headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" };
  if (accept) headers["content-type"] = "text/markdown; charset=utf-8";
  return new Response("<html></html>", { status: 200, headers });
}

function requestFor(path: string, init: RequestInit = {}) {
  return new Request(`https://phux.sh${path}`, init);
}

describe("classifyUserAgent", () => {
  test("names the well-known AI crawlers", () => {
    expect(classifyUserAgent("Mozilla/5.0 (compatible; ClaudeBot/1.0)")).toBe("ai:anthropic-bot");
    expect(classifyUserAgent("Mozilla/5.0 (compatible; GPTBot/1.2)")).toBe("ai:openai-bot");
    expect(classifyUserAgent("ChatGPT-User/1.0")).toBe("ai:openai");
    expect(classifyUserAgent("Claude-User")).toBe("ai:anthropic");
    expect(classifyUserAgent("PerplexityBot/1.0")).toBe("ai:perplexity-bot");
    expect(classifyUserAgent("Google-Extended")).toBe("ai:google");
  });

  test("separates search crawlers from browsers and CLI tools", () => {
    expect(classifyUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe("search:google");
    expect(classifyUserAgent("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120")).toBe("browser");
    expect(classifyUserAgent("curl/8.5.0")).toBe("tool:cli-http");
    expect(classifyUserAgent("python-requests/2.31")).toBe("tool:cli-http");
    expect(classifyUserAgent(null)).toBe("other");
    expect(classifyUserAgent("TotallyUnknownThing/9.9")).toBe("other");
  });
});

describe("classifySignal", () => {
  test("marks markdown negotiation", () => {
    const request = new Request("https://phux.sh/", {
      headers: { accept: "text/markdown" },
    });
    const response = new Response("# x", {
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
    expect(classifySignal(request, response, "/", "other")).toBe("markdown");
  });

  test("marks well-known discovery probes and agent docs", () => {
    const request = requestFor("/");
    const html = htmlResponse();
    expect(classifySignal(request, html, "/.well-known/api-catalog", "other")).toBe("well-known:api-catalog");
    expect(classifySignal(request, html, "/.well-known/agent-skills/index.json", "other")).toBe("well-known:agent-skills");
    expect(classifySignal(request, html, "/llms.txt", "other")).toBe("doc:llms-txt");
    expect(classifySignal(request, html, "/auth.md", "other")).toBe("doc:auth-md");
    expect(classifySignal(request, html, "/install", "other")).toBe("installer");
    expect(classifySignal(request, html, "/", "other")).toBe("page");
    expect(classifySignal(request, html, "/concepts", "other")).toBe("page");
  });

  test("marks MCP calls and scanner robots fetches", () => {
    const mcp = new Request("https://phux.sh/mcp", { method: "POST" });
    expect(classifySignal(mcp, new Response("{}"), "/mcp", "other")).toBe("mcp:call");
    const preflight = new Request("https://phux.sh/mcp", { method: "OPTIONS" });
    expect(classifySignal(preflight, new Response(null, { status: 204 }), "/mcp", "other")).toBe("mcp:preflight");
    const robots = requestFor("/robots.txt");
    expect(classifySignal(robots, new Response("u"), "/robots.txt", "scanner:isitagentready")).toBe("robots:scanner");
    expect(classifySignal(robots, new Response("u"), "/robots.txt", "ai:anthropic-bot")).toBeNull();
  });
});

describe("classifyRequest", () => {
  test("produces dimension events for a page view", () => {
    const request = Object.assign(
      new Request("https://docs.phux.sh/protocol", {
        headers: { "user-agent": "ClaudeBot/1.0" },
      }),
      { cf: { country: "DE" } },
    );
    const events = classifyRequest(request, htmlResponse());
    const dims = Object.fromEntries(events.map((e) => [e.dim, e.key]));
    expect(dims.status).toBe("2xx");
    expect(dims.host).toBe("docs.phux.sh");
    expect(dims.ua).toBe("ai:anthropic-bot");
    expect(dims.country).toBe("DE");
    expect(dims.signal).toBe("page");
  });

  test("appends extra events and records 404 misses", () => {
    const request = requestFor("/nope", { headers: { "user-agent": "curl/8" } });
    const events = classifyRequest(request, new Response("nf", { status: 404 }), [
      { dim: "session", key: "demo:edge" },
    ]);
    expect(events).toContainEqual({ dim: "session", key: "demo:edge" });
    expect(events).toContainEqual({ dim: "miss", key: "/nope" });
    expect(events).toContainEqual({ dim: "status", key: "4xx" });
  });
});

describe("classifyRef", () => {
  test("keeps the allowlist, lowercased", () => {
    for (const ref of ["x", "hn", "reddit", "lobsters", "mastodon", "bsky", "gh", "newsletter"]) {
      expect(classifyRef(ref.toUpperCase())).toBe(ref);
      expect(classifyRef(`  ${ref}  `)).toBe(ref);
    }
  });

  test("counts any other present value as other and drops a missing one", () => {
    expect(classifyRef("facebook")).toBe("other");
    expect(classifyRef("hn-extra")).toBe("other");
    expect(classifyRef("x".repeat(200))).toBe("other");
    expect(classifyRef("newsletter-october")).toBe("other");
    expect(classifyRef(null)).toBeNull();
    expect(classifyRef("")).toBeNull();
    expect(classifyRef("   ")).toBeNull();
  });
});

describe("classifyReferrer", () => {
  test("normalises known hosts and drops the path and query", () => {
    const cases: Array<[string, string]> = [
      ["https://t.co/abc123", "x"],
      ["https://x.com/someone/status/1?s=1", "x"],
      ["https://twitter.com/someone", "x"],
      ["https://mobile.twitter.com/someone", "x"],
      ["https://WWW.X.com/home", "x"],
      ["https://news.ycombinator.com/item?id=12345&secret=abc", "hn"],
      ["https://news.ycombinator.com:443/item?id=9", "hn"],
      ["https://reddit.com/r/programming/comments/abc?utm=1", "reddit"],
      ["https://old.reddit.com/r/programming", "reddit"],
      ["https://www.reddit.com/", "reddit"],
      ["https://np.reddit.com/r/programming", "reddit"],
      ["https://lobste.rs/s/abc?token=secret", "lobsters"],
      ["https://github.com/no-phux/phux/pull/1?diff=1", "github"],
      ["https://user:pass@github.com/no-phux/phux?token=secret", "github"],
      ["https://www.github.com/", "github"],
      ["https://gist.github.com/user/abc", "github"],
      ["https://www.google.com/search?q=phux+terminal", "google"],
      ["https://google.co.uk/search?q=phux", "google"],
      ["https://www.google.de/search?q=phux", "google"],
      ["https://google.com.au/search?q=phux", "google"],
      ["https://www.google.co.uk./search?q=phux", "google"],
      ["https://news.google.com/articles/abc?hl=en", "google"],
      ["https://WWW.Google.COM/search?q=secret", "google"],
      ["https://duckduckgo.com/?q=phux+terminal&ia=web", "duckduckgo"],
      ["https://html.duckduckgo.com/html/?q=phux", "duckduckgo"],
      ["https://www.bing.com/search?q=phux", "bing"],
      ["https://phux.sh/install?ref=secret", "self"],
      ["https://docs.phux.sh/protocol?x=1", "self"],
      ["https://www.phux.sh/", "self"],
      ["https://shell.phux.sh/", "self"],
    ];
    for (const [referer, channel] of cases) {
      expect(classifyReferrer(referer)).toBe(channel);
    }
  });

  test("counts unknown hosts as other and records nothing when there is no host", () => {
    expect(classifyReferrer("https://example.com/page?q=secret")).toBe("other");
    expect(classifyReferrer("https://news.ycombinator.com.evil.com/item?id=1")).toBe("other");
    expect(classifyReferrer("https://notreddit.com/r/programming")).toBe("other");
    expect(classifyReferrer("https://ycombinator.com/")).toBe("other");
    expect(classifyReferrer("https://google.evil.com/search?q=phux")).toBe("other");
    expect(classifyReferrer("https://githubusercontent.com/file")).toBe("other");
    expect(classifyReferrer("http://203.0.113.9/admin?token=secret")).toBe("other");
    expect(classifyReferrer("http://[2001:db8::1]/path?q=1")).toBe("other");
    expect(classifyReferrer(null)).toBeNull();
    expect(classifyReferrer("")).toBeNull();
    expect(classifyReferrer("not a url")).toBeNull();
    expect(classifyReferrer("about:blank")).toBeNull();
  });
});

describe("channel attribution", () => {
  test("records allowlisted ref and normalised referrer on a page view", () => {
    const request = requestFor("/protocol?ref=HN&token=secret", {
      headers: { referer: "https://news.ycombinator.com/item?id=12345&secret=abc" },
    });
    const events = classifyRequest(request, htmlResponse());
    expect(events).toContainEqual({ dim: "signal", key: "page" });
    expect(events).toContainEqual({ dim: "ref", key: "hn" });
    expect(events).toContainEqual({ dim: "referrer", key: "hn" });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("12345");
    expect(serialized).not.toContain("item");
    expect(serialized).not.toContain("token");
  });

  test("counts unknown refs and referrers as other without keeping the raw value", () => {
    const request = requestFor("/?ref=facebook", {
      headers: { referer: "https://example.com/landing?utm=launch" },
    });
    const events = classifyRequest(request, htmlResponse());
    expect(events).toContainEqual({ dim: "ref", key: "other" });
    expect(events).toContainEqual({ dim: "referrer", key: "other" });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("facebook");
    expect(serialized).not.toContain("example.com");
    expect(serialized).not.toContain("landing");
    expect(serialized).not.toContain("utm");
  });

  test("records nothing for a missing ref or Referer", () => {
    const refOnly = classifyRequest(requestFor("/?ref=gh"), htmlResponse());
    expect(refOnly).toContainEqual({ dim: "ref", key: "gh" });
    expect(refOnly.find((event) => event.dim === "referrer")).toBeUndefined();

    const neither = classifyRequest(requestFor("/"), htmlResponse());
    const withReferrer = classifyRequest(
      new Request("https://phux.sh/", { headers: { referer: "https://github.com/no-phux/phux" } }),
      htmlResponse(),
    );
    expect(neither.find((event) => event.dim === "ref" || event.dim === "referrer")).toBeUndefined();
    expect(withReferrer.find((event) => event.dim === "ref")).toBeUndefined();
    expect(withReferrer).toContainEqual({ dim: "referrer", key: "github" });
  });

  test("attributes installer hits and skips assets and other signals", () => {
    const installer = classifyRequest(
      requestFor("/install?ref=Newsletter", {
        headers: { referer: "https://www.google.co.uk/search?q=phux+install" },
      }),
      new Response("#!/bin/sh"),
    );
    expect(installer).toContainEqual({ dim: "signal", key: "installer" });
    expect(installer).toContainEqual({ dim: "ref", key: "newsletter" });
    expect(installer).toContainEqual({ dim: "referrer", key: "google" });

    const asset = classifyRequest(
      requestFor("/app.css?ref=hn", {
        headers: { referer: "https://news.ycombinator.com/item?id=1" },
      }),
      htmlResponse(),
    );
    expect(asset).toEqual([]);

    const script = classifyRequest(
      requestFor("/install.sh?ref=gh", {
        headers: { referer: "https://github.com/no-phux/phux" },
      }),
      new Response("#!/bin/sh"),
    );
    expect(script).toEqual([]);

    const dashboard = classifyRequest(
      requestFor("/api/telemetry?ref=x", {
        headers: { referer: "https://phux.sh/telemetry" },
      }),
      new Response("{}", { headers: { "content-type": "application/json" } }),
    );
    expect(dashboard).toEqual([]);

    const mcp = classifyRequest(
      new Request("https://phux.sh/mcp?ref=hn", {
        method: "POST",
        headers: { referer: "https://github.com/no-phux/phux" },
      }),
      new Response("{}"),
    );
    expect(mcp).toContainEqual({ dim: "signal", key: "mcp:call" });
    expect(mcp.find((event) => event.dim === "ref" || event.dim === "referrer")).toBeUndefined();

    const doc = classifyRequest(
      requestFor("/llms.txt?ref=hn", {
        headers: { referer: "https://lobste.rs/s/abc" },
      }),
      new Response("docs"),
    );
    expect(doc).toContainEqual({ dim: "signal", key: "doc:llms-txt" });
    expect(doc.find((event) => event.dim === "ref" || event.dim === "referrer")).toBeUndefined();

    const htmlMiss = classifyRequest(
      requestFor("/missing?ref=bsky", { headers: { referer: "https://example.com/post/1" } }),
      new Response("missing", { status: 404, headers: { "content-type": "text/html" } }),
    );
    expect(htmlMiss).toContainEqual({ dim: "signal", key: "page" });
    expect(htmlMiss).toContainEqual({ dim: "ref", key: "bsky" });
    expect(htmlMiss).toContainEqual({ dim: "referrer", key: "other" });
    expect(htmlMiss).toContainEqual({ dim: "miss", key: "/missing" });
    expect(JSON.stringify(htmlMiss)).not.toContain("example.com");

    const plainMiss = classifyRequest(
      requestFor("/missing?ref=bsky", { headers: { referer: "https://github.com/no-phux/phux" } }),
      new Response("missing", { status: 404 }),
    );
    expect(plainMiss.find((event) => event.dim === "ref" || event.dim === "referrer")).toBeUndefined();
    expect(plainMiss).toContainEqual({ dim: "miss", key: "/missing" });
  });

  test("does not keep an IP address or full referrer on an unknown host", () => {
    const events = classifyRequest(
      requestFor("/?ref=mastodon", {
        headers: { referer: "http://203.0.113.9/admin?token=secret" },
      }),
      htmlResponse(),
    );
    expect(events).toContainEqual({ dim: "ref", key: "mastodon" });
    expect(events).toContainEqual({ dim: "referrer", key: "other" });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("203.0.113.9");
    expect(serialized).not.toContain("admin");
    expect(serialized).not.toContain("secret");
  });
});

describe("shouldSkipPath", () => {
  test("skips static assets and the dashboard API", () => {
    expect(shouldSkipPath("/app.css")).toBe(true);
    expect(shouldSkipPath("/lib/phux_web_bg.wasm")).toBe(true);
    expect(shouldSkipPath("/og.png")).toBe(true);
    expect(shouldSkipPath("/api/telemetry")).toBe(true);
    expect(shouldSkipPath("/api/search.json")).toBe(true);
  });

  test("keeps pages and agent documents", () => {
    expect(shouldSkipPath("/")).toBe(false);
    expect(shouldSkipPath("/protocol")).toBe(false);
    expect(shouldSkipPath("/llms.txt")).toBe(false);
    expect(shouldSkipPath("/auth.md")).toBe(false);
    expect(shouldSkipPath("/.well-known/api-catalog")).toBe(false);
    expect(shouldSkipPath("/robots.txt")).toBe(false);
  });
});
