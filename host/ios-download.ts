/** Read the existing beta group's public link. Never enables or changes distribution. */
import { AscError, ascClient, ascConfigured, externalBetaGroup, type Fetch, type TestFlightEnv } from "./testflight";

export const IOS_DOWNLOAD_PATH = "/download/ios";
export const IOS_INVITE_FALLBACK = "/more?phone=ios&testflight=unavailable#testflight";
type EdgeCache = { match(key: Request): Promise<Response | undefined>; put(key: Request, response: Response): Promise<void> };

export function approvedTestFlightLink(attributes: { publicLinkEnabled?: boolean; publicLink?: unknown; isInternalGroup?: boolean }): string | null {
  const reason = linkRejection(attributes);
  if (reason) {
    console.error("TestFlight public link rejected", reason);
    return null;
  }
  return parseLink(attributes.publicLink)!.href;
}

/** A stable cause. Never the link, the join code, or request credentials. */
function linkRejection(attributes: { publicLinkEnabled?: boolean; publicLink?: unknown; isInternalGroup?: boolean }): string | null {
  if (!attributes.publicLinkEnabled) return "public link disabled";
  if (attributes.isInternalGroup !== false) return "internal group";
  const url = parseLink(attributes.publicLink);
  if (!url || !isAppleJoinLink(url)) return "bad URL";
  return null;
}

function failureReason(error: unknown): string {
  if (error instanceof AscError) return `HTTP ${error.status}`;
  if (isTimeout(error)) return "timeout";
  return "request failed";
}

function isTimeout(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "TimeoutError";
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
  if (!env.ASC_BETA_GROUP_ID) {
    const group = await externalBetaGroup(env, asc);
    return approvedTestFlightLink(group.attributes);
  }
  const response = await asc(`/betaGroups/${encodeURIComponent(env.ASC_BETA_GROUP_ID)}?fields[betaGroups]=publicLinkEnabled,publicLink,isInternalGroup`);
  const group = await response.json() as { data: { attributes: Parameters<typeof approvedTestFlightLink>[0] } };
  return approvedTestFlightLink(group.data.attributes);
}

/** Visitors wait at most this long for Apple before taking the email path. */
export const IOS_LOOKUP_DEADLINE_MS = 4_000;
/** How long the edge remembers Apple's answer. A failure is remembered briefly so Apple is not hammered. */
const LINK_TTL_SECONDS = 300;
const FALLBACK_TTL_SECONDS = 60;
type WaitUntil = { waitUntil(promise: Promise<unknown>): void };
/** One cold lookup per isolate. Concurrent misses await this, then it is cleared. */
let inflight: Promise<string | null> | undefined;

function startLookup(
  env: TestFlightEnv,
  fetchImpl: Fetch,
  remember: (location: string, seconds: number) => Promise<void>,
): Promise<string | null> {
  if (inflight) return inflight;
  const run = publicTestFlightLink(env, fetchImpl).then(
    async link => {
      await remember(link ?? IOS_INVITE_FALLBACK, link ? LINK_TTL_SECONDS : FALLBACK_TTL_SECONDS);
      return link;
    },
    async (error: unknown) => {
      console.error("TestFlight public link unavailable", failureReason(error));
      await remember(IOS_INVITE_FALLBACK, FALLBACK_TTL_SECONDS);
      return null;
    },
  );
  inflight = run;
  void run.finally(() => {
    if (inflight === run) inflight = undefined;
  });
  return run;
}

function redirect(location: string, cacheControl = "no-store"): Response {
  return new Response(null, {
    status: 302,
    headers: { location, "cache-control": cacheControl, "referrer-policy": "no-referrer" },
  });
}

/**
 * A normal navigation preserves Apple's native handoff; no popup, email, or JS redirect.
 *
 * A cold App Store Connect lookup can take longer than a visitor should wait
 * (several sequential calls). The deadline only bounds the visitor's wait: the
 * lookup keeps running (via `ctx.waitUntil`) and stores Apple's link, so the
 * next visitor is sent straight to TestFlight. Aborting it instead meant every
 * cold lookup failed and the email fallback was cached for everyone.
 */
export async function iosDownload(
  request: Request,
  env: TestFlightEnv,
  fetchImpl: Fetch = input => fetch(input),
  cache: EdgeCache | undefined = (globalThis as { caches?: { default?: EdgeCache } }).caches?.default,
  ctx?: WaitUntil,
  deadlineMs: number = IOS_LOOKUP_DEADLINE_MS,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("GET only", { status: 405, headers: { allow: "GET, HEAD", "cache-control": "no-store" } });
  }
  const key = new Request(new URL(IOS_DOWNLOAD_PATH, request.url));
  const cached = await cache?.match(key).catch(() => undefined);
  const cachedLocation = cached?.headers.get("location");
  // A cached link or fallback stands until its TTL. Refreshing a fallback hit
  // would call Apple again inside that window, so the next lookup waits for expiry.
  if (cachedLocation) return redirect(cachedLocation);
  if (!ascConfigured(env)) return redirect(IOS_INVITE_FALLBACK);

  // Cache only the server-side lookup, not the browser's redirect; revocation stays bounded.
  const remember = async (location: string, seconds: number) => {
    if (location === IOS_INVITE_FALLBACK) {
      const current = await cache?.match(key).catch(() => undefined);
      const currentLocation = current?.headers.get("location");
      // A late 429 or timeout must not replace a link another lookup already stored.
      if (currentLocation && currentLocation !== IOS_INVITE_FALLBACK) return;
    }
    await cache?.put(key, redirect(location, `public, max-age=${seconds}`)).catch(() => undefined);
  };
  const lookup = startLookup(env, fetchImpl, remember);
  ctx?.waitUntil(lookup);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), deadlineMs); });
  try {
    const link = await Promise.race([lookup, deadline]);
    return redirect(link ?? IOS_INVITE_FALLBACK);
  } finally {
    clearTimeout(timer);
  }
}
