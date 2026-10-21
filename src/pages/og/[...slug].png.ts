import { getCollection, type CollectionEntry } from "astro:content";
import type { APIRoute } from "astro";
import sharp from "sharp";
import { SITE } from "../../lib/site";

// Per-page social cards: the reader's paper and ink, the page title and summary.
export async function getStaticPaths() {
  return (await getCollection("docs")).map((page) => ({
    params: { slug: page.id },
    props: { page },
  }));
}

const W = 1200;
const H = 630;
const PAD = 80;
const SANS = `-apple-system, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif`;
const MONO = `'SF Mono', Menlo, 'DejaVu Sans Mono', monospace`;

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const xml = (value: string) => value.replace(/[&<>"']/g, (char) => entities[char]!);

/** Greedy wrap by an average glyph width; the last kept line ends in an ellipsis when cut. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= maxChars) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/[\s.,;:]+$/, "")}…`;
  return kept;
}

function tspans(lines: string[], x: number, lineHeight: number) {
  return lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${xml(line)}</tspan>`).join("");
}

export const GET: APIRoute = async ({ props }) => {
  const page = props.page as CollectionEntry<"docs">;
  const title = wrap(page.data.title, 26, 2);
  const summary = wrap(page.data.summary || page.data.description || SITE.description, 60, 3);
  const titleY = 250;
  const summaryY = titleY + (title.length - 1) * 78 + 86;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f5f5f3"/>
  <rect x="${PAD}" y="${PAD + 4}" width="14" height="14" rx="3" fill="#8a6a43"/>
  <text x="${PAD + 28}" y="${PAD + 18}" font-family="${SANS}" font-size="28" fill="#1b1c19" font-weight="600">${xml(SITE.name)}<tspan dx="9" fill="#6b6c66" font-weight="400">docs</tspan></text>
  <text x="${PAD}" y="${titleY}" font-family="${SANS}" font-size="68" fill="#1b1c19" font-weight="500" letter-spacing="-1.4">${tspans(title, PAD, 78)}</text>
  <text x="${PAD}" y="${summaryY}" font-family="${SANS}" font-size="30" fill="#5d5e58">${tspans(summary, PAD, 42)}</text>
  <path d="M${PAD} ${H - PAD - 34}H${W - PAD}" stroke="#1b1c19" stroke-opacity="0.12" stroke-width="2"/>
  <text x="${PAD}" y="${H - PAD + 6}" font-family="${MONO}" font-size="24" fill="#6b6c66">${xml(`${SITE.docsDomain}/${page.id}`)}</text>
</svg>`;
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(image), { headers: { "content-type": "image/png" } });
};
