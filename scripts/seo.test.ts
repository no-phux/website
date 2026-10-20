import { describe, expect, test } from "bun:test";
import {
  audit, band, calibrate, gate, internalLinks, isBrand, isQuickWin, jevJudge, linkCandidates,
  pageFromMarkdown, parseCsv, parseQueries, slugFor, toCsv, triageQueries, type Answer, type Judge, type Page,
} from "./seo";

const page = (slug: string, title: string, body: string, links: string[] = []): Page => ({ slug, title, description: `${title} guide.`, body, links });

describe("corpus", () => {
  test("parses synced frontmatter and internal links without self links", () => {
    const raw = `---\ntitle: "Remote machines"\ndescription: "Reach a host."\n---\nSee [cli](/reference/cli#host), [docs](https://docs.phux.sh/agents), [self](/remote), [gh](https://github.com/x).\n`;
    const parsed = pageFromMarkdown("remote", raw);
    expect(parsed.title).toBe("Remote machines");
    expect(parsed.description).toBe("Reach a host.");
    expect(parsed.links.sort()).toEqual(["agents", "reference/cli"]);
  });
  test("section index files keep the bare slug", () => {
    expect(slugFor("reference/index.md")).toBe("reference");
    expect(slugFor("reference/cli.md")).toBe("reference/cli");
    expect(internalLinks("[a](/a) [a again](/a#x)")).toEqual(["a"]);
  });
});

describe("audit", () => {
  test("counts inbound links and flags nav-label titles and truncated descriptions", () => {
    const pages = [
      page("remote", "Remote machines", "", []),
      page("agents", "Run coding agents in persistent terminals", "", ["remote"]),
      { ...page("install", "Install", "", ["remote", "agents"]), description: "Install phux on macOS or Linux and..." },
    ];
    const rows = Object.fromEntries(audit(pages).map((r) => [r.slug, r]));
    expect(rows.remote.inbound).toBe(2);
    expect(rows.remote.titleTag).toBe("Remote machines — phux");
    expect(rows.install.issues.some((i) => i.includes("nav label"))).toBe(true);
    expect(rows.install.issues.some((i) => i.includes("truncated"))).toBe(true);
    expect(rows.agents.issues.some((i) => i.includes("nav label"))).toBe(false);
  });
});

describe("links", () => {
  test("pre-filters same-topic pages that do not already link to the target", () => {
    const target = { ...page("remote", "Remote machines", ""), description: "Reach another machine over SSH." };
    const pages = [
      target,
      page("agents", "Agents", "Run agents.\n\nAgents on another machine over SSH keep running."),
      page("config", "Config", "Keybindings and themes."),
      page("scripting", "Scripting", "Scripts on a remote machine.", ["remote"]),
    ];
    const candidates = linkCandidates(target, pages);
    expect(candidates.map((c) => c.source)).toEqual(["agents"]);
    expect(candidates[0].excerpt).toContain("SSH");
  });
});

describe("queries", () => {
  test("parses Search Console exports with quoted commas and percent cells", () => {
    const csv = 'Top queries,Clicks,Impressions,CTR,Position\r\n"tmux, but for agents",3,"1,204",0.25%,7.5\r\nphux,10,40,25%,1.1\r\n';
    expect(parseQueries(csv)).toEqual([
      { query: "tmux, but for agents", clicks: 3, impressions: 1204, position: 7.5 },
      { query: "phux", clicks: 10, impressions: 40, position: 1.1 },
    ]);
    expect(parseCsv('a,"b ""c"""\n')).toEqual([["a", 'b "c"']]);
    expect(() => parseQueries("foo,bar\n1,2\n")).toThrow(/unrecognized/);
  });
  test("brand rows skip the judge; quick wins are code, not Jev", async () => {
    expect(isBrand("phux install")).toBe(true);
    expect(isBrand("ux design")).toBe(false);
    expect(isQuickWin({ query: "", clicks: 0, impressions: 50, position: 8 })).toBe(true);
    expect(isQuickWin({ query: "", clicks: 0, impressions: 50, position: 3 })).toBe(false);
    const states: unknown[] = [];
    const judge: Judge = async (state) => {
      states.push(state);
      return { user: { type: "noul", noul: 0.95 }, category: { type: "choice", choice: "tmux_alternative", probabilities: {}, confidence: 0.8 } };
    };
    const rows = await triageQueries([
      { query: "phux docs", clicks: 1, impressions: 5, position: 1 },
      { query: "tmux alternative", clicks: 0, impressions: 90, position: 12 },
    ], judge);
    expect(states).toEqual([{ query: "tmux alternative" }]);
    expect(rows[0].category).toBe("brand");
    expect(rows[1]).toMatchObject({ band: "act", category: "tmux_alternative", quickWin: true });
  });
});

describe("gate and judge", () => {
  test("bands probabilities and reports failing questions", async () => {
    expect([band(0.95), band(0.6), band(0.2)]).toEqual(["act", "check", "review"]);
    const judge: Judge = async () => ({
      delivers: { type: "noul", noul: 0.97 }, supported: { type: "noul", noul: 0.31 },
      observable: { type: "noul", noul: 0.7 }, next_step: { type: "noul", noul: 0.92 },
    });
    const [row] = await gate([page("remote", "Remote", "body")], judge);
    expect(row.failing).toEqual(["supported"]);
  });
  test("fails closed without a key and sends the documented request shape", async () => {
    expect(() => jevJudge("")).toThrow(/TYPESAFE_API_KEY/);
    let sent: { url: string; init: RequestInit } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ model: "jev-1.13", answers: { q: { type: "noul", noul: 0.4 } } }));
    }) as unknown as typeof fetch;
    const answers: Record<string, Answer> = await jevJudge("k", fake)({ query: "x" }, { q: { type: "noul", instructions: "?" } });
    expect(answers.q).toEqual({ type: "noul", noul: 0.4 });
    expect(sent!.url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(JSON.parse(String(sent!.init.body))).toEqual({ model: "jev-latest", state: { query: "x" }, questions: { q: { type: "noul", instructions: "?" } } });
    const failing = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(jevJudge("k", failing)({}, {})).rejects.toThrow(/typesafe 401/);
  });
});

describe("calibrate", () => {
  test("counts disagreements against hand labels", () => {
    const labels = [["query", "label"], ["a", "yes"], ["b", "no"], ["c", "yes"], ["missing", "no"]];
    const results = [{ query: "a", user: "0.93" }, { query: "b", user: "0.71" }, { query: "c", user: "0.2" }];
    const report = calibrate(labels, results, "query", "user");
    expect(report.compared).toBe(3);
    expect(report.disagreements.map((d) => d.key)).toEqual(["b", "c"]);
    expect(report.advice).toBe("trust the high-confidence band");
    expect(calibrate([["k", "l"], ["a", "versus"]], [{ k: "a", cat: "versus" }], "k", "cat").disagreements).toEqual([]);
  });
  test("round-trips CSV output", () => {
    const csv = toCsv([{ q: 'say "hi", ok', p: 0.12345, tags: ["a", "b"] }]);
    expect(parseCsv(csv)).toEqual([["q", "p", "tags"], ['say "hi", ok', "0.123", "a; b"]]);
  });
});
