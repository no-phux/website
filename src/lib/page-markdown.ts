import type { CollectionEntry } from "astro:content";
import { SITE } from "./site";

export function pageUrl(page: CollectionEntry<"docs">): string {
  return `${SITE.docsUrl}/${page.id}`;
}

/** One page as published Markdown: provenance frontmatter, title, summary, body. */
export function pageMarkdown(page: CollectionEntry<"docs">): string {
  const { title, summary, sourcePath, sourceBase, sourceRevision, projectVersion, protocolVersion, stability } = page.data;
  const metadata = {
    title,
    url: pageUrl(page),
    source: `${sourceBase ?? SITE.github}/blob/${sourceRevision}/${sourcePath}`,
    projectVersion,
    protocolVersion,
    stability,
  };
  const frontmatter = Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
  return `---\n${frontmatter}\n---\n\n${pageBody(page)}`;
}

/** Title, summary and body; the custom overview's source already includes its title and summary. */
export function pageBody(page: CollectionEntry<"docs">): string {
  const { title, summary } = page.data;
  return page.id === "overview" ? page.body ?? "" : `# ${title}\n\n${summary}\n\n${page.body ?? ""}`;
}
