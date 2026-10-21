import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { flattenTree } from "fumadocs-core/page-tree";
import { pageBody, pageUrl } from "../lib/page-markdown";
import { source } from "../lib/source";
import { SITE } from "../lib/site";

/** Every documentation page as one Markdown file, in sidebar order. */
export const GET: APIRoute = async () => {
  const pages = new Map((await getCollection("docs")).map((page) => [`/${page.id}`, page]));
  const ordered = flattenTree(source.getPageTree().children)
    .map((item) => pages.get(item.url))
    .filter((page) => page !== undefined);
  // Pages outside the navigation still publish; keep them, after the tree.
  const listed = new Set(ordered);
  ordered.push(...[...pages.values()].filter((page) => !listed.has(page)));

  const header = `# ${SITE.name} documentation

> ${SITE.description}

Every page of ${SITE.docsUrl} in navigation order, as Markdown. Each page
starts with its URL and exact source. A single page is also available at its
URL plus \`.md\`; the index is ${SITE.docsUrl}/llms.txt.`;

  const sections = ordered.map((page) => {
    const { sourceBase, sourceRevision, sourcePath } = page.data;
    const sourceUrl = `${sourceBase ?? SITE.github}/blob/${sourceRevision}/${sourcePath}`;
    return `URL: ${pageUrl(page)}\nSource: ${sourceUrl}\n\n${pageBody(page).trim()}`;
  });

  return new Response(`${[header, ...sections].join("\n\n---\n\n")}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
