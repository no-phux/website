// /performance serves the measurements already published in docs/compare.md.
// There is no separate benchmark page in no-phux/phux.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { phuxRoot } from "../../scripts/phux-root";
import { SITE } from "./site";

export const PERFORMANCE_DESCRIPTION = "Measurements published with the comparison of phux, tmux, Herdr, and cmux.";

export function measurementsSection(markdown: string): string | undefined {
  const match = markdown.match(/## Measurements\n+([\s\S]*?)(?=\n## |$)/);
  const body = match?.[1]?.trim();
  return body || undefined;
}

/** Escape text, then restore http(s) and site-relative links as anchors. */
export function inlineMarkdown(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
    if (!/^(https:\/\/|\/)/.test(href) || /["<>]/.test(href)) return label;
    return `<a href="${href}">${label}</a>`;
  });
}

export function loadCompareMarkdown(siteRoot: string): string | undefined {
  try {
    return readFileSync(join(phuxRoot(siteRoot), "docs/compare.md"), "utf8");
  } catch {
    return undefined;
  }
}

export function performanceSource(revision: string | undefined): string {
  const ref = revision && /^[0-9a-f]{40}$/i.test(revision) ? revision : "main";
  return `${SITE.github}/blob/${ref}/docs/compare.md`;
}

export function performanceMarkdown(measurements: string | undefined, source: string): string {
  const body = measurements ?? "Measurements are published with the comparison.";
  return `---
title: "Performance"
url: "${SITE.docsUrl}/performance"
source: "${source}"
---

# Performance

${PERFORMANCE_DESCRIPTION}

## Measurements

${body}

[phux vs tmux, Herdr, and cmux](/compare)
`;
}
