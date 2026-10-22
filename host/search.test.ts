import { beforeEach, describe, expect, test } from "bun:test";
import handler from "./index";
import {
  MAX_QUERY_LENGTH,
  MAX_RESULTS,
  MAX_TERMS,
  SNIPPET_LENGTH,
  handleSearchRequest,
  indexSections,
  rankSections,
  resetSearchIndex,
  searchTerms,
  snippet,
  type Section,
} from "./search";
import { pageSections } from "../scripts/build-search.mjs";

function section(page: string, heading: string, text: string, anchor = heading.toLowerCase()): Section {
  const route = `/${page.toLowerCase().replace(/\s+/g, "-")}`;
  return {
    url: `https://docs.phux.sh${route}#${anchor}`,
    markdown: `https://docs.phux.sh${route}.md#${anchor}`,
    page,
    heading,
    text,
  };
}

const SECTIONS: Section[] = [
  section("Concepts", "Server", "The server owns every terminal and keeps it running."),
  section("Remote", "Pairing", "Pair a client with phux pair, then attach to the remote session."),
  section("Getting started", "Detach", "Press Ctrl-A then d to detach. The session keeps running."),
  section("Troubleshooting", "Sessions", "A detached session is still listed by phux ls."),
  section("Keys", "Prefix", "The prefix key starts every binding; nothing else does."),
];

function envOf(sections: Section[] = SECTIONS) {
  const requested: string[] = [];
  return {
    requested,
    ASSETS: {
      fetch: async (input: Request) => {
        requested.push(new URL(input.url).pathname);
        if (new URL(input.url).pathname !== "/api/sections.json") {
          return new Response("not found", { status: 404 });
        }
        return new Response(JSON.stringify(sections), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  };
}

beforeEach(() => resetSearchIndex());

describe("ranking", () => {
  const index = indexSections(SECTIONS);

  test("a heading match outranks the same word in body text", () => {
    const [first] = rankSections(index, "detach");
    expect(first?.heading).toBe("Detach");
  });

  test("sections matching more distinct terms come first", () => {
    const results = rankSections(index, "remote session attach");
    expect(results[0]?.heading).toBe("Pairing");
    expect(results.map((r) => r.heading)).toContain("Sessions");
  });

  test("terms match word prefixes, case-insensitively", () => {
    expect(rankSections(index, "SESSION").map((r) => r.heading)).toContain("Sessions");
    // "ls" must not match inside "else": only word prefixes count.
    expect(rankSections(index, "ls").map((r) => r.heading)).toEqual(["Sessions"]);
  });

  test("an exact phrase lifts a section over scattered matches", () => {
    const scattered = section("A", "Keys", "running terminal keeps here and session there");
    const phrase = section("B", "Other", "the session keeps running");
    const [first] = rankSections(indexSections([scattered, phrase]), "session keeps");
    expect(first?.page).toBe("B");
  });

  test("ties keep index order", () => {
    const twins = [section("A", "One", "alpha"), section("B", "Two", "alpha")];
    expect(rankSections(indexSections(twins), "alpha").map((r) => r.page)).toEqual(["A", "B"]);
  });

  test("no matching term, or no terms at all, finds nothing", () => {
    expect(rankSections(index, "zebra")).toEqual([]);
    expect(rankSections(index, "  -- ")).toEqual([]);
  });

  test("never more than ten results", () => {
    const many = Array.from({ length: 25 }, (_, i) => section(`P${i}`, `H${i}`, "pane"));
    expect(rankSections(indexSections(many), "pane")).toHaveLength(MAX_RESULTS);
  });

  test("results keep url, markdown, page, and heading", () => {
    const [first] = rankSections(index, "prefix");
    expect(first).toEqual(SECTIONS[4]!);
  });

  test("short terms match whole words only", () => {
    const short = [section("A", "One", "attach a pane"), section("B", "Two", "an answer")];
    expect(rankSections(indexSections(short), "an").map((r) => r.page)).toEqual(["B"]);
  });

  test("query terms are deduplicated, stopword-free, and capped", () => {
    expect(searchTerms("Pane pane PANES")).toEqual(["pane", "panes"]);
    expect(searchTerms("how to send keys to a pane")).toEqual(["send", "keys", "pane"]);
    expect(searchTerms("the")).toEqual(["the"]);
    const long = Array.from({ length: 40 }, (_, i) => `t${i}`).join(" ");
    expect(searchTerms(long)).toHaveLength(MAX_TERMS);
  });
});

describe("snippet", () => {
  test("short text is returned whole", () => {
    expect(snippet("short text", ["text"])).toBe("short text");
  });

  test("long text is cut near the first match on word boundaries", () => {
    const text = `${"lead ".repeat(200)}needle ${"tail ".repeat(200)}`.trim();
    const cut = snippet(text, ["needle"]);
    expect(cut.length).toBeLessThanOrEqual(SNIPPET_LENGTH + 2);
    expect(cut).toContain("needle");
    expect(cut.startsWith("…lead")).toBe(true);
    expect(cut.endsWith("tail…")).toBe(true);
  });
});

describe("GET /search.json", () => {
  test("q answers with the best sections as JSON, CORS-readable and cacheable", async () => {
    const response = await handleSearchRequest(
      new Request("https://docs.phux.sh/search.json?q=detach"),
      envOf(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    const body = (await response.json()) as Section[];
    expect(body[0]?.url).toBe("https://docs.phux.sh/getting-started#detach");
    expect(Object.keys(body[0]!).sort()).toEqual(["heading", "markdown", "page", "text", "url"]);
  });

  test("without q, or with a blank q, answers with every section", async () => {
    for (const path of ["/search.json", "/search.json?q=%20%20"]) {
      const response = await handleSearchRequest(new Request(`https://docs.phux.sh${path}`), envOf());
      expect(await response.json()).toEqual(SECTIONS);
    }
  });

  test("an over-long q is refused", async () => {
    const q = "a".repeat(MAX_QUERY_LENGTH + 1);
    const response = await handleSearchRequest(
      new Request(`https://docs.phux.sh/search.json?q=${q}`),
      envOf(),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("preflight and HEAD are answered; writes are not", async () => {
    const preflight = await handleSearchRequest(
      new Request("https://docs.phux.sh/search.json", { method: "OPTIONS" }),
      envOf(),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("GET");

    const head = await handleSearchRequest(
      new Request("https://docs.phux.sh/search.json?q=detach", { method: "HEAD" }),
      envOf(),
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");

    const post = await handleSearchRequest(
      new Request("https://docs.phux.sh/search.json", { method: "POST", body: "{}" }),
      envOf(),
    );
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  test("a missing index is a 503, not an empty answer", async () => {
    const env = { ASSETS: { fetch: async () => new Response("", { status: 404 }) } };
    const response = await handleSearchRequest(new Request("https://docs.phux.sh/search.json?q=x"), env);
    expect(response.status).toBe(503);
  });

  test("the index is loaded once per isolate", async () => {
    const env = envOf();
    await handleSearchRequest(new Request("https://docs.phux.sh/search.json?q=a"), env);
    await handleSearchRequest(new Request("https://docs.phux.sh/search.json?q=b"), env);
    expect(env.requested).toEqual(["/api/sections.json"]);
  });

  test("the host worker routes /search.json on the docs host and bounces phux.sh", async () => {
    const env = envOf();
    const docs = await handler.fetch(new Request("https://docs.phux.sh/search.json?q=prefix"), env);
    expect(((await docs.json()) as Section[])[0]?.heading).toBe("Prefix");
    const site = await handler.fetch(new Request("https://phux.sh/search.json?q=prefix"), env);
    expect(site.status).toBe(301);
    expect(site.headers.get("location")).toBe("https://docs.phux.sh/search.json?q=prefix");
  });
});

describe("build-time sections", () => {
  test("one record per heading plus the intro (a title heading folds into it), anchored and stripped of markup", () => {
    const records = pageSections("Concepts", "/concepts", {
      headings: [
        { id: "concepts", content: "Concepts" },
        { id: "server", content: "The `server`" },
        { id: "empty", content: "Empty" },
      ],
      contents: [
        { heading: undefined, content: "Intro with a [link](/x)." },
        { heading: "concepts", content: "More intro." },
        { heading: "server", content: "Owns **every** terminal." },
        { heading: "server", content: "Press <kbd>C-a</kbd> d." },
      ],
    });
    expect(records).toEqual([
      {
        url: "https://docs.phux.sh/concepts",
        markdown: "https://docs.phux.sh/concepts.md",
        page: "Concepts",
        heading: "Concepts",
        text: "Intro with a link. More intro.",
      },
      {
        url: "https://docs.phux.sh/concepts#server",
        markdown: "https://docs.phux.sh/concepts.md#server",
        page: "Concepts",
        heading: "The server",
        text: "Owns every terminal. Press C-a d.",
      },
      {
        url: "https://docs.phux.sh/concepts#empty",
        markdown: "https://docs.phux.sh/concepts.md#empty",
        page: "Concepts",
        heading: "Empty",
        text: "",
      },
    ]);
  });
});
