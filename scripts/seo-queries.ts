/** Search Console triage, the 50-row calibration, and CSV in/out. */
import { band, choice, mapLimit, noul, type Band, type Judge, type Question } from "./seo-jev";

// ── queries: a Search Console export, every row ──────────────────────────
export interface QueryRow {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

/** RFC 4180-ish: quoted fields, doubled quotes, commas inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

/** Accepts the Search Console UI export (Queries.csv) or the API's column names. */
export function parseQueries(text: string): QueryRow[] {
  const [header, ...rows] = parseCsv(text);
  const find = (...names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));
  const q = find("top queries", "query", "queries");
  const c = find("clicks");
  const i = find("impressions");
  const p = find("position");
  if (q < 0 || i < 0) throw new Error(`unrecognized Search Console CSV header: ${header.join(",")}`);
  const num = (value = "") => Number(value.replace(/[,%]/g, "")) || 0;
  return rows.map((r) => ({ query: r[q], clicks: num(r[c]), impressions: num(r[i]), position: num(r[p]) }));
}

export const BUSINESS = "phux is an open-source programmable terminal runtime: a background server keeps shells running, and a terminal UI, desktop app, iPhone app, browser, scripts, and coding agents (Claude Code, Codex, etc.) attach to the same terminals locally or on other machines over SSH/QUIC. It competes with tmux, zellij, screen, cmux, and Herdr.";

export const CATEGORIES: Record<string, string> = {
  tmux_alternative: "Looking for a replacement or alternative to tmux, screen, zellij, or another multiplexer",
  versus: "Comparing two named terminal tools, e.g. 'tmux vs zellij'",
  agent_terminals: "Running, watching, or coordinating AI coding agents in terminals",
  remote_sessions: "Keeping shells alive on, or reaching terminals of, another machine",
  multiplexer_howto: "How to do a specific task in tmux or a similar multiplexer",
  terminal_api: "Controlling terminals programmatically: APIs, protocols, embedding, automation",
  other: "None of the above",
};

export const QUERY_QUESTIONS: Record<string, Question> = {
  user: {
    type: "noul",
    instructions: { business: BUSINESS, question: "Someone typing `query` could start using the product in `business` to solve what they searched for." },
    criteria: {
      true: "They want a tool, an alternative, a comparison, or a way to do something this product does.",
      false: "They want something unrelated: a different meaning of the words, a job, a definition with no tool need, or another product's account issue.",
    },
  },
  category: {
    type: "choice",
    instructions: "Which search category does `query` belong to?",
    criteria: CATEGORIES,
  },
};

const BRAND = /\bphux\b/i;
export const isBrand = (query: string) => BRAND.test(query);
/** Already ranks 5–20 with real impressions: the fastest traffic on the site. */
export const isQuickWin = (row: QueryRow, minImpressions = 20) =>
  row.position >= 5 && row.position <= 20 && row.impressions >= minImpressions;

export async function triageQueries(rows: QueryRow[], judge: Judge, concurrency = 8) {
  return mapLimit(rows, concurrency, async (row) => {
    if (isBrand(row.query)) return { ...row, user: 1, band: "act" as Band, category: "brand", confidence: 1, quickWin: isQuickWin(row) };
    const raw = await judge({ query: row.query }, QUERY_QUESTIONS);
    const user = noul(raw, "user");
    const picked = choice(raw, "category");
    return { ...row, user, band: band(user), category: picked.value, confidence: picked.confidence, quickWin: isQuickWin(row) };
  });
}

// ── calibrate: the 50-row rule ────────────────────────────────────────────
/** labels.csv: key,label. Booleans compare by band (yes = act|check). */
export function calibrate(labels: string[][], results: Record<string, string>[], keyColumn: string, column: string) {
  const byKey = new Map(results.map((r) => [r[keyColumn], r[column]]));
  const disagreements: { key: string; label: string; got: string }[] = [];
  let compared = 0;
  for (const [key, label] of labels.slice(1)) {
    const got = byKey.get(key);
    if (got === undefined) continue;
    compared++;
    const numeric = Number(got);
    const verdict = Number.isFinite(numeric) && got !== "" ? (numeric >= 0.5 ? "yes" : "no") : got;
    if (verdict.toLowerCase() !== label.trim().toLowerCase()) disagreements.push({ key, label, got });
  }
  const n = disagreements.length;
  const advice = n < 5 ? "trust the high-confidence band" : n > 10 ? "rewrite the question, not the threshold" : "read every disagreement before trusting it";
  return { compared, disagreements, advice };
}

// ── output ────────────────────────────────────────────────────────────────
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const cell = (value: unknown) => {
    const s = Array.isArray(value) ? value.join("; ") : typeof value === "number" ? String(Math.round(value * 1000) / 1000) : String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((row) => keys.map((k) => cell(row[k])).join(","))].join("\n") + "\n";
}

