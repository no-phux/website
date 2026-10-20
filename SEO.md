# Search and AI discovery

How phux.sh and docs.phux.sh earn search and assistant traffic. Read this
before any SEO task. [CONTENT.md](CONTENT.md) still governs what the site may
claim; nothing here relaxes it.

## Context

phux is an open-source programmable terminal runtime: a background server keeps
shells running; the TUI, desktop, iPhone, browser, scripts and coding agents
attach to the same terminals, locally or across machines. The alternatives
people already search for are tmux, zellij, screen, cmux and Herdr.

Baseline from phux-ops on 2026-10-19 (30 days): 12 Google-referred visits,
2,454 AI-crawler hits, 1,684 coding-agent evaluators, 533 CLI install fetches,
5 member signups. Search is not yet a channel, and nothing has been measured
from it. Agents and AI assistants already are.

Search categories to test, in priority order. They are hypotheses until
Search Console data confirms or kills them:

1. **tmux alternative**: "tmux alternative", "tmux for AI agents", "modern tmux".
2. **versus**: "tmux vs zellij", "zellij vs phux", "cmux alternative". Honest
   tables with exact versions, per CONTENT.md; publish losses.
3. **agent terminals**: "run claude code in background", "watch coding agents",
   "persistent terminal for codex".
4. **remote sessions**: "keep ssh session alive", "reattach terminal from
   phone", "terminal on another machine".

## Four roles, never mixed

| Role | Who | Examples |
|---|---|---|
| Finds | Real data | Search Console and Bing exports, phux-ops traffic, synced docs, the live results page |
| Counts | Code (`scripts/seo.ts`) | positions, impressions, inbound link counts, title length, "did it go up" |
| Judges | Jev, one narrow question per row | "could this searcher use phux?", "does this page deliver its title?", "should this page link there?" |
| Writes | The reasoning agent | titles, briefs, link sentences, comparison pages, the weekly report |

Jev never counts, compares numbers or dates, or makes a call that cannot be
undone. Its output is a probability; code and people hold the veto.

## Commands

```sh
bun run sync-docs                       # the corpus every command reads
bun run seo audit                       # code only: inbound links, titles, descriptions
bun run seo gate [slug...] [--strict]   # Jev: delivers / supported / observable / next_step
bun run seo links <slug>                # code pre-filters, Jev ranks link sources
bun run seo queries Queries.csv         # Jev triage of a Search Console export
bun run seo calibrate labels.csv .seo/queries.csv user
```

Jev commands need `TYPESAFE_API_KEY` from the shell-secret cache
(`dot-secrets-sync`, then a fresh shell). Reports land in `.seo/`, which is
gitignored because query exports are private data.

Thresholds: act alone at 0.9 or above, act carefully from 0.5, send anything
lower to a person. These are starting values; the 50-row check sets the real
ones.

## Rules

The agent may, without asking:

- run every command above and file the findings as beads;
- open a PR that adds in-sentence internal links (anchor = the target's exact
  title), fixes a truncated description, or rewords a nav-label title, on pages
  with no Search Console clicks in the last 90 days.

The agent must ask before:

- changing a title, URL or heading on a page that has search clicks;
- any redirect, merge or deletion; a merge means a redirect;
- publishing a comparison or performance claim, which also needs the evidence
  CONTENT.md requires;
- editing a page changed for search in the last 90 days. Rankings take about
  three months to settle after a real change; a re-edit restarts the clock.

Never:

- write a Jev question that is negated ("is this NOT relevant?"), double
  ("buyer AND ranking?"), or asks it to count or compare numbers;
- trust a Jev workflow before hand-labelling 50 real rows: under 5
  disagreements, trust the high band; over 10, rewrite the question;
- optimize for keyword density, word count, "content scores", or toxic-link
  cleanup. Google ignores bad links;
- rank phux first in a list phux publishes, or buy placement in someone
  else's.

Docs text lives in `no-phux/phux` under `docs/` and reaches this site through
`sync-docs`; fix wording there. Title-tag templates and marketing pages live
here.

## The loop

Once: verify phux.sh and docs.phux.sh in Google Search Console and Bing
Webmaster Tools. Bing's AI Performance report shows the queries assistants
actually typed. Without these, the find role runs blind.

Every Monday:

1. Export 90 days of Search Console queries; `bun run seo queries`.
2. Code lists quick wins: positions 5–20 with real impressions.
3. Pick **one** page. Brief it from the top 3 results, then `seo gate` it.
4. `seo links` on it; add 3–5 in-sentence links from same-topic pages.
5. Run 3–5 real evaluation prompts ("best tmux alternative for agents") in a
   private assistant window and note whether phux is cited.

First Monday of the month: re-label 50 rows and run `seo calibrate`.

## Decisions

Every "no" a reviewer gives an SEO change, and every standing call, becomes a
line here.

- 2026-10-19: docs and demo title tags lead with the topic, not the brand.
  The home page keeps the brand first.
