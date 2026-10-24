import type { APIRoute } from "astro";
import sharp from "sharp";
import { resolve } from "node:path";
import { SITE } from "../lib/site";

const xml = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[char]!));

// Keep the share preview on the same real product captures as the homepage.
export const GET: APIRoute = async () => {
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#0b0b0d"/>
    <g font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
      <text x="36" y="54" fill="#c4f48b" font-size="26" font-weight="700">${xml(SITE.name)}</text>
      <text x="36" y="122" fill="#ededee" font-size="48" font-weight="600" letter-spacing="-2">${xml(SITE.tagline)}</text>
      <text x="36" y="594" fill="#aebbc2" font-size="22">Agents, shells, and machines. One place to run the whole show.</text>
    </g>
  </svg>`);
  const desktop = resolve("public/product/desktop-workspace.webp");
  const tui = resolve("public/product/tui-workspace.webp");
  const [desktopImage, tuiImage] = await Promise.all([
    sharp(desktop).resize(552, 352, { fit: "contain", background: "#080d10" }).png().toBuffer(),
    sharp(tui).resize(552, 352, { fit: "contain", background: "#080d10" }).png().toBuffer(),
  ]);
  const image = await sharp(header).composite([
    { input: desktopImage, left: 36, top: 170 },
    { input: tuiImage, left: 612, top: 170 },
  ]).png().toBuffer();
  return new Response(image, { headers: { "content-type": "image/png" } });
};
