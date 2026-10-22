/**
 * GET /search.json — keyword search over docs sections, for agents.
 *
 * `?q=<query>` answers with the ten best-matching sections, best first, as a
 * JSON array of `{ url, markdown, page, heading, text }` (`url` and
 * `markdown` deep-link to the section's anchor; `text` is a snippet). Without
 * `q` it answers with every section. The section index is the static
 * `api/sections.json` that scripts/build-search.mjs emits beside the Fumadocs
 * index, so this is a read-only ranking over a build artifact: no state, no
 * credentials.
 */

export const SEARCH_PATH = "/search.json";
export const SECTIONS_ASSET = "/api/sections.json";
/** Longer queries are refused rather than silently truncated. */
export const MAX_QUERY_LENGTH = 200;
export const MAX_RESULTS = 10;
/** Distinct terms considered; the rest of a long query is ignored. */
export const MAX_TERMS = 16;
export const SNIPPET_LENGTH = 320;

const CACHE_CONTROL = "public, max-age=300";

export interface Section {
  url: string;
  markdown: string;
  page: string;
  heading: string;
  text: string;
}

export interface SearchEnv {
  ASSETS: { fetch(input: Request): Promise<Response> };
}

interface IndexedSection {
  section: Section;
  heading: string[];
  page: string[];
  text: string[];
}

const WEIGHTS = { heading: 6, page: 3, text: 1 } as const;
/** One section cannot win on a word repeated many times. */
const MAX_TEXT_HITS = 3;

/** Lowercased words; punctuation, `_`, and `-` separate them. */
export function words(value: string): string[] {
  return value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Words too common to rank by, dropped unless the query has nothing else. */
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "how",
  "i", "in", "is", "it", "my", "of", "on", "or", "the", "to", "what", "when", "with",
]);

/** The distinct query terms, in order, without stopwords, capped at MAX_TERMS. */
export function searchTerms(query: string): string[] {
  const all = [...new Set(words(query))];
  const meaningful = all.filter((term) => !STOPWORDS.has(term));
  return (meaningful.length > 0 ? meaningful : all).slice(0, MAX_TERMS);
}

export function indexSections(sections: Section[]): IndexedSection[] {
  return sections.map((section) => ({
    section,
    heading: words(section.heading),
    page: words(section.page),
    text: words(section.text),
  }));
}

/** Short terms ("ls", "d") match whole words only; longer ones match prefixes too. */
const MIN_PREFIX_LENGTH = 3;

/** Whether `word` matches `term` ("pane" matches "panes"). */
function matches(word: string, term: string): boolean {
  return term.length < MIN_PREFIX_LENGTH ? word === term : word.startsWith(term);
}

function hits(field: string[], term: string): number {
  let count = 0;
  for (const word of field) if (matches(word, term)) count++;
  return count;
}

/** Whether `phrase` occurs as consecutive words of `field`. */
function containsPhrase(field: string[], phrase: string[]): boolean {
  if (phrase.length < 2) return false;
  outer: for (let at = 0; at + phrase.length <= field.length; at++) {
    for (let i = 0; i < phrase.length; i++) {
      if (!matches(field[at + i]!, phrase[i]!)) continue outer;
    }
    return true;
  }
  return false;
}

interface Score {
  matched: number;
  weight: number;
}

function scoreSection(entry: IndexedSection, terms: string[]): Score {
  let matched = 0;
  let weight = 0;
  for (const term of terms) {
    const heading = hits(entry.heading, term);
    const page = hits(entry.page, term);
    const text = Math.min(hits(entry.text, term), MAX_TEXT_HITS);
    if (heading + page + text > 0) matched++;
    weight += WEIGHTS.heading * Math.min(heading, 1) + WEIGHTS.page * Math.min(page, 1) + WEIGHTS.text * text;
  }
  if (containsPhrase(entry.heading, terms)) weight += 10;
  else if (containsPhrase(entry.text, terms)) weight += 4;
  return { matched, weight };
}

/**
 * The best `limit` sections for `query`: sections matching more distinct
 * terms first, then by weight (heading over page title over body text), then
 * index order. Sections matching no term are dropped.
 */
export function rankSections(
  index: IndexedSection[],
  query: string,
  limit = MAX_RESULTS,
): Section[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  return index
    .map((entry, order) => ({ entry, order, ...scoreSection(entry, terms) }))
    .filter((scored) => scored.matched > 0)
    .sort((a, b) => b.matched - a.matched || b.weight - a.weight || a.order - b.order)
    .slice(0, limit)
    .map(({ entry }) => ({ ...entry.section, text: snippet(entry.section.text, terms) }));
}

/** Up to SNIPPET_LENGTH characters of `text`, opening near the first term it contains. */
export function snippet(text: string, terms: string[]): string {
  if (text.length <= SNIPPET_LENGTH) return text;
  const lower = text.toLowerCase();
  const first = Math.min(
    ...terms.map((term) => lower.indexOf(term)).filter((at) => at >= 0),
  );
  let start = Number.isFinite(first) ? Math.max(0, first - SNIPPET_LENGTH / 4) : 0;
  if (start > 0) {
    const space = text.indexOf(" ", start);
    start = space === -1 || space > first ? start : space + 1;
  }
  let end = Math.min(text.length, start + SNIPPET_LENGTH);
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space > start) end = space;
  }
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

let cachedIndex: IndexedSection[] | null = null;

async function loadIndex(request: Request, env: SearchEnv): Promise<IndexedSection[] | null> {
  if (cachedIndex) return cachedIndex;
  const asset = await env.ASSETS.fetch(new Request(new URL(SECTIONS_ASSET, request.url)));
  if (!asset.ok) return null;
  cachedIndex = indexSections((await asset.json()) as Section[]);
  return cachedIndex;
}

/** Test hook: forget the per-isolate index. */
export function resetSearchIndex(): void {
  cachedIndex = null;
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-max-age": "86400",
  };
}

function json(request: Request, body: unknown, status: number, cache: string): Response {
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
    },
  });
}

export async function handleSearchRequest(request: Request, env: SearchEnv): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("GET only", {
      status: 405,
      headers: { ...corsHeaders(), allow: "GET, HEAD, OPTIONS" },
    });
  }
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length > MAX_QUERY_LENGTH) {
    return json(request, { error: `q is longer than ${MAX_QUERY_LENGTH} characters` }, 400, "no-store");
  }
  const index = await loadIndex(request, env);
  if (!index) return json(request, { error: "search index unavailable" }, 503, "no-store");
  const results = query ? rankSections(index, query) : index.map((entry) => entry.section);
  return json(request, results, 200, CACHE_CONTROL);
}
