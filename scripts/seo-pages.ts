/** The published docs corpus, and the code checks and Jev questions run over it. */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseFrontmatter } from "./docs-catalog";
import { pageTitle } from "../src/lib/site";
import { band, mapLimit, noul, type Judge, type Question } from "./seo-jev";

export const SYNCED = resolve(import.meta.dir, "../src/content/docs/_synced");

// ── corpus: the published docs, as synced ─────────────────────────────────
export interface Page {
  slug: string;
  title: string;
  description: string;
  body: string;
  /** Internal docs slugs this page links to (deduplicated, no self). */
  links: string[];
}

function unquote(value = ""): string {
  if (!value.startsWith('"')) return value;
  try {
    return JSON.parse(value) as string;
  } catch {
    return value;
  }
}

/** Internal docs links: `](/slug)`, `](/slug#x)`, or absolute docs.phux.sh URLs. */
export function internalLinks(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(/\]\((?:https:\/\/docs\.phux\.sh)?\/([a-z0-9/-]*)(?:[#?][^)]*)?\)/g)) {
    found.add(match[1].replace(/\/+$/, ""));
  }
  return [...found];
}

export function pageFromMarkdown(slug: string, raw: string): Page {
  const { meta, body } = parseFrontmatter(raw);
  return {
    slug,
    title: unquote(meta.title),
    description: unquote(meta.description || meta.summary),
    body,
    links: internalLinks(body).filter((link) => link !== slug),
  };
}

export function slugFor(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/\.md$/, "").replace(/\/index$/, "");
}

export async function loadCorpus(dir = SYNCED): Promise<Page[]> {
  const files: string[] = [];
  const walk = async (current: string) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else if (entry.name.endsWith(".md")) files.push(abs);
    }
  };
  try {
    await walk(dir);
  } catch {
    throw new Error(`no synced docs at ${dir}; run \`bun run sync-docs\` first`);
  }
  const pages = await Promise.all(
    files.map(async (abs) => pageFromMarkdown(slugFor(relative(dir, abs)), await readFile(abs, "utf8"))),
  );
  return pages.sort((a, b) => a.slug.localeCompare(b.slug));
}

// ── audit: code counts ────────────────────────────────────────────────────
export const MIN_INBOUND = 3;
/** The same <title> src/pages/[...slug].astro renders. */
export const titleTag = (page: Page) => pageTitle(page.title);

export interface AuditRow {
  slug: string;
  inbound: number;
  outbound: number;
  titleTag: string;
  descriptionChars: number;
  issues: string[];
}

export function audit(pages: Page[]): AuditRow[] {
  const inbound = new Map<string, number>();
  for (const page of pages) for (const link of page.links) inbound.set(link, (inbound.get(link) ?? 0) + 1);
  return pages.map((page) => {
    const tag = titleTag(page);
    const issues: string[] = [];
    const n = inbound.get(page.slug) ?? 0;
    if (n < MIN_INBOUND) issues.push(`${n} inbound docs links (floor ${MIN_INBOUND})`);
    if (page.title.split(/\s+/).length < 3) issues.push(`title "${page.title}" is a nav label, not a search phrase`);
    if (tag.length > 60) issues.push(`title tag ${tag.length} chars (>60 truncates)`);
    if (!page.description) issues.push("no meta description");
    else if (page.description.endsWith("...")) issues.push("meta description is a truncated sentence");
    return { slug: page.slug, inbound: n, outbound: page.links.length, titleTag: tag, descriptionChars: page.description.length, issues };
  });
}

// ── gate: the questions a good editor asks, the same way every time ──────
const STATE_BODY_CHARS = 40_000; // stays well inside Jev's 32k-token context

export const GATE_QUESTIONS: Record<string, Question> = {
  delivers: {
    type: "noul",
    instructions: "The page body delivers what its `title` and `description` promise to a reader.",
    criteria: {
      true: "A reader who arrived from the title and description finds that exact task or answer in the body.",
      false: "The body is about something else, stops short, or buries the promised answer.",
    },
  },
  supported: {
    type: "noul",
    instructions: "Every concrete claim in the body about performance, compatibility, comparisons, or numbers is backed by a command, measurement, link, or named source on the page.",
    criteria: {
      true: "Claims can be checked from what the page shows or links.",
      false: "At least one figure, comparison, or compatibility claim is asserted with nothing to check it against.",
    },
  },
  observable: {
    type: "noul",
    instructions: "The page tells the reader what they should see when the task worked.",
    criteria: {
      true: "There is expected output, a visible result, or a verification command.",
      false: "Steps end without saying how to tell success from failure.",
    },
  },
  next_step: {
    type: "noul",
    instructions: "The page ends by pointing the reader to a next useful task or a deeper reference.",
  },
};

export interface GateRow {
  slug: string;
  answers: Record<string, number>;
  failing: string[];
}

export async function gate(pages: Page[], judge: Judge, concurrency = 8): Promise<GateRow[]> {
  return mapLimit(pages, concurrency, async (page) => {
    const state = { title: page.title, description: page.description, body: page.body.slice(0, STATE_BODY_CHARS) };
    const raw = await judge(state, GATE_QUESTIONS);
    const answers = Object.fromEntries(Object.keys(GATE_QUESTIONS).map((id) => [id, noul(raw, id)]));
    const failing = Object.entries(answers).filter(([, p]) => band(p) === "review").map(([id]) => id);
    return { slug: page.slug, answers, failing };
  });
}

// ── links: code pre-filters, Jev picks, the writer writes ────────────────
const STOP = new Set("a an and the for to of in on with your you phux how what from into by or is are be it this that".split(" "));

export function terms(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [])].filter((word) => !STOP.has(word));
}

export interface LinkCandidate {
  source: string;
  overlap: number;
  excerpt: string;
}

/** Pages on the same topic that don't already link to the target. */
export function linkCandidates(target: Page, pages: Page[], limit = 15): LinkCandidate[] {
  const wanted = terms(`${target.title} ${target.description}`);
  return pages
    .filter((page) => page.slug !== target.slug && !page.links.includes(target.slug))
    .map((page) => {
      const paragraphs = page.body.split(/\n{2,}/).filter((p) => !p.startsWith("```"));
      const scored = paragraphs.map((p) => ({ p, hits: wanted.filter((word) => p.toLowerCase().includes(word)).length }));
      scored.sort((a, b) => b.hits - a.hits);
      const best = scored.slice(0, 3).filter((s) => s.hits > 0);
      return { source: page.slug, overlap: best.reduce((n, s) => n + s.hits, 0), excerpt: best.map((s) => s.p).join("\n\n").slice(0, 4_000) };
    })
    .filter((candidate) => candidate.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit);
}

export async function judgeLinks(target: Page, candidates: LinkCandidate[], judge: Judge, concurrency = 8) {
  const rows = await mapLimit(candidates, concurrency, async (candidate) => {
    const raw = await judge(
      { source_page: candidate.source, source_excerpt: candidate.excerpt, target: { slug: target.slug, title: target.title, description: target.description } },
      {
        fits: {
          type: "noul",
          instructions: "A reader of `source_excerpt` would benefit from an in-sentence link to the `target` page at this point in the text.",
          criteria: {
            true: "The excerpt discusses the target's topic, so a link there answers a question the reader is likely to have next.",
            false: "The overlap is incidental wording; a link here would be a detour.",
          },
        },
      },
    );
    return { ...candidate, fits: noul(raw, "fits") };
  });
  return rows.sort((a, b) => b.fits - a.fits);
}

