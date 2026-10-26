// Public identity lives here. Commands, package names and protocol identifiers
// are separate contracts; changing the display name does not rename them.
const name = "phux";

export const SITE = {
  name,
  domain: "phux.sh",
  url: "https://phux.sh",
  docsDomain: "docs.phux.sh",
  docsUrl: "https://docs.phux.sh",
  category: "Programmable terminal runtime",
  tagline: "Run the whole show.",
  description:
    `${name} brings agents, shells, and machines into one programmable workspace. See what needs you, keep work running, and take control from the TUI, desktop, or CLI.`,
  github: "https://github.com/no-phux/phux",
  // One switch for the visual system. Mode tokens live in global.css.
  designMode: "terminal",
  // Names the /og.png artwork. Link previews cache by URL, so change this
  // whenever src/pages/og.png.ts draws a different picture.
  previewArtwork: "sculptural-workspace",
  // Set when the WS demo backend is deployed. When empty the terminal island
  // renders the static poster + a "coming online" state instead of dialing out.
  demoWsUrl: import.meta.env.PUBLIC_PHUX_DEMO_WS ?? "",
} as const;

/** Content-page <title>: the topic leads (it is what people search); the brand trails once. */
export function pageTitle(topic: string): string {
  return new RegExp(`\\b${SITE.name}\\b`, "i").test(topic) ? topic : `${topic} — ${SITE.name}`;
}

// Shared by the visible docs landing and its searchable Markdown representation.
export const OVERVIEW = {
  title: "Overview",
  summary: "A terminal multiplexer whose server you can drive from code.",
  pitch: {
    text:
      "A background server owns the terminal. The TUI, desktop, and agents connect to it.",
  },
  continuity: "Detach leaves it running. A server crash or reboot ends it.",
  model: "Sessions own resources. Arrangements place them. Views show them.",
  firstRun: [
    { label: "Start", action: "phux", detail: "Open a shell." },
    { label: "Detach", action: "Ctrl-A, then d", detail: "Leave it running." },
    { label: "Return", action: "phux", detail: "Same shell, same output." },
  ],
  paths: [
    { href: "/agents", title: "Coding agents", text: "Connect your agent host and see what its agents are doing." },
    { href: "/remote", title: "Remote machines", text: "Reach another machine's server with one command." },
    { href: "/getting-started", title: "Getting started", text: "First session, keys, and the tmux differences." },
  ],
} as const;

// The visible handoff and the overview's Markdown/search representation agree.
export const AGENT_START = {
  prompt: "Read https://docs.phux.sh/llms.txt and help me get started with phux. Choose the setup for my agent host, check my installed version, and verify a read before sending input. Use exact pane targets and bounded waits. Ask before interrupting or destroying existing work.",
  // GET /search.json (host/search.ts); llms.txt documents the same contract.
  search: {
    example: `${SITE.docsUrl}/search.json?q=detach+session`,
    text: "Search the docs as JSON: the ten best-matching sections, each with its url, markdown, page, heading, and text. Without q, every section.",
  },
} as const;

/**
 * Absolute docs origin in production builds so marketing chrome lands on
 * docs.phux.sh instead of bouncing through a same-host 301. `astro dev`
 * stays same-origin so the local tree is clickable.
 *
 * Override with PUBLIC_DOCS_ORIGIN when previewing a split locally.
 */
export const DOCS_ORIGIN =
  import.meta.env.PUBLIC_DOCS_ORIGIN ?? (import.meta.env.PROD ? SITE.docsUrl : "");

export function docsHref(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return DOCS_ORIGIN ? `${DOCS_ORIGIN}${normalized}` : normalized;
}

export const MARKETING_NAV = [
  { href: docsHref("/overview"), label: "Docs" },
  { href: "/demos", label: "Demos" },
  { href: docsHref("/clients"), label: "Apps" },
  { href: docsHref("/agents"), label: "Agents" },
  { href: SITE.github, label: "GitHub", external: true },
] as const;

export const NAV = MARKETING_NAV;
