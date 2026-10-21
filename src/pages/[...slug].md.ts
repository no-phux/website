import { getCollection, type CollectionEntry } from "astro:content";
import type { APIRoute } from "astro";
import { pageMarkdown } from "../lib/page-markdown";

// Publish the same collection as HTML, without converting rendered UI chrome.
export async function getStaticPaths() {
  return (await getCollection("docs")).map((page) => ({
    params: { slug: page.id },
    props: { page },
  }));
}

export const GET: APIRoute = ({ props }) => {
  return new Response(pageMarkdown(props.page as CollectionEntry<"docs">), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
