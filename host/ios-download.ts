/** Read the existing beta group's public link. Never enables or changes distribution. */
import { ascClient, ascConfigured, resolveGroup, type Fetch, type TestFlightEnv } from "./testflight";

export const IOS_DOWNLOAD_PATH = "/download/ios";
export const IOS_INVITE_FALLBACK = "/more?phone=ios&testflight=unavailable#testflight";
type EdgeCache = { match(key: Request): Promise<Response | undefined>; put(key: Request, response: Response): Promise<void> };

export function approvedTestFlightLink(attributes: { publicLinkEnabled?: boolean; publicLink?: unknown; isInternalGroup?: boolean }): string | null {
  if (!attributes.publicLinkEnabled || attributes.isInternalGroup !== false) return null;
  const url = parseLink(attributes.publicLink);
  if (!url) return null;
  return isAppleJoinLink(url) ? url.href : null;
}

function parseLink(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isAppleJoinLink(url: URL): boolean {
  if (url.origin !== "https://testflight.apple.com" || url.username || url.password) return false;
  if (!/^\/join\/[A-Za-z0-9]+\/?$/.test(url.pathname) || url.search || url.hash) return false;
  return true;
}

export async function publicTestFlightLink(env: TestFlightEnv, fetchImpl: Fetch): Promise<string | null> {
  const asc = ascClient(env, fetchImpl);
  const groupId = env.ASC_BETA_GROUP_ID || await resolveGroup(env, asc);
  const response = await asc(`/betaGroups/${encodeURIComponent(groupId)}?fields[betaGroups]=publicLinkEnabled,publicLink,isInternalGroup`);
  const group = await response.json() as { data: { attributes: Parameters<typeof approvedTestFlightLink>[0] } };
  return approvedTestFlightLink(group.data.attributes);
}

/** A normal navigation preserves Apple's native handoff; no popup, email, or JS redirect. */
export async function iosDownload(
  request: Request,
  env: TestFlightEnv,
  fetchImpl: Fetch = input => fetch(input),
  cache: EdgeCache | undefined = (globalThis as { caches?: { default?: EdgeCache } }).caches?.default,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("GET only", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const key = new Request(new URL(IOS_DOWNLOAD_PATH, request.url));
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) {
    const response = new Response(null, { status: 302, headers: cached.headers });
    response.headers.set("cache-control", "no-store");
    return response;
  }
  let link: string | null = null;
  try {
    if (ascConfigured(env)) {
      // One deadline covers all cold lookups, not eight seconds per Apple request.
      const deadline = AbortSignal.timeout(4_000);
      const bounded: Fetch = input => fetchImpl(new Request(input, { signal: AbortSignal.any([input.signal, deadline]) }));
      link = await publicTestFlightLink(env, bounded);
    }
  } catch (error) {
    console.error("TestFlight public link unavailable", error);
  }
  const response = new Response(null, {
    status: 302,
    headers: {
      location: link ?? IOS_INVITE_FALLBACK,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
  // Cache only the server-side lookup, not the browser's redirect; revocation stays bounded.
  const remembered = new Response(null, { status: 302, headers: response.headers });
  remembered.headers.set("cache-control", "public, max-age=60");
  await cache?.put(key, remembered).catch(() => undefined);
  return response;
}
