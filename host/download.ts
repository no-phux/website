/**
 * GET /download/desktop — the stable Apple-silicon Phux Desktop archive.
 *
 * Redirects to the version phux's stable channel manifest names, so the link
 * never waits on a site rebuild. Like phux's own clients, only the version is
 * read from the manifest; the asset URL is derived from it. Any failure falls
 * back to the releases page rather than an error.
 */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const RELEASES = "https://github.com/no-phux/phux/releases";
const MANIFEST = `${RELEASES}/download/channels/stable.json`;
const FRESH_MS = 5 * 60_000;

let cached: { version: string; at: number } | null = null;

export function desktopArchiveUrl(version: string): string {
  return `${RELEASES}/download/desktop-v${version}/phux-desktop-${version}-macos-arm64.zip`;
}

export async function desktopDownload(
  fetchImpl: Fetch = (input, init) => fetch(input, init),
  now = Date.now(),
): Promise<Response> {
  const version = await stableDesktopVersion(fetchImpl, now);
  return new Response(null, {
    status: 302,
    headers: {
      location: version ? desktopArchiveUrl(version) : RELEASES,
      "cache-control": "no-store",
    },
  });
}

async function stableDesktopVersion(fetchImpl: Fetch, now: number): Promise<string | null> {
  if (cached && now - cached.at < FRESH_MS) return cached.version;
  try {
    const response = await fetchImpl(MANIFEST, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return cached?.version ?? null;
    const manifest = (await response.json()) as { channel?: unknown; products?: { desktop?: { version?: unknown } } };
    const version = manifest.products?.desktop?.version;
    if (manifest.channel !== "stable" || typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
      return cached?.version ?? null;
    }
    cached = { version, at: now };
    return version;
  } catch {
    return cached?.version ?? null;
  }
}

/** Tests only: forget the remembered version. */
export function resetDesktopDownload(): void {
  cached = null;
}
