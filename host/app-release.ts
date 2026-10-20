/**
 * The newest phux-mobile TestFlight builds, for the app's update prompt.
 *
 * GET /api/ios/release answers which build each TestFlight audience can
 * install right now, read from App Store Connect with the same team API key
 * host/testflight.ts invites testers with. Apple offers no public lookup for
 * TestFlight (the iTunes lookup the App Store build uses covers only released
 * versions), so the key stays here and the app reads facts, never a URL: it
 * builds the itms-beta:// link from the numeric app id itself.
 *
 * Responses are cached at the edge for five minutes so a release day of app
 * launches costs App Store Connect a handful of calls.
 */
import {
  ascClient,
  ascConfigured,
  resolveAppId,
  type Fetch,
  type Resource,
  type TestFlightEnv,
} from "./testflight";

export const APP_RELEASE_PATH = "/api/ios/release";

const CACHE_SECONDS = 300;
/** ASC's page ceiling: ~40 days of builds at the release cadence, inside TestFlight's 90-day expiry. */
const BUILD_WINDOW = 200;
/** The only beta state in which testers of that audience can install the build. */
const INSTALLABLE = "IN_BETA_TESTING";

export interface TestFlightBuild {
  /** Marketing version (CFBundleShortVersionString). */
  version: string;
  /** Build number (CFBundleVersion). */
  build: string;
}

export interface AppRelease {
  bundleId: string;
  /** Apple ID of the app, the id in App Store and TestFlight links. */
  appId: string;
  testflight: {
    /** Newest build internal testers (the App Store Connect team) can install. */
    internal: TestFlightBuild | null;
    /** Newest build external testers can install; null when none is approved. */
    external: TestFlightBuild | null;
  };
}

interface BuildAttributes {
  version?: string;
}

interface BuildResource extends Resource<BuildAttributes> {
  relationships?: {
    preReleaseVersion?: { data?: { id: string } | null };
    buildBetaDetail?: { data?: { id: string } | null };
  };
}

interface Included extends Resource<Record<string, unknown>> {
  type: string;
}

/** Read the newest installable build per TestFlight audience. Throws on any ASC failure. */
export async function latestRelease(env: TestFlightEnv, fetchImpl: Fetch): Promise<AppRelease> {
  const asc = ascClient(env, fetchImpl);
  const appId = await resolveAppId(env, asc);
  const query = [
    `filter[app]=${appId}`,
    "filter[preReleaseVersion.platform]=IOS",
    "filter[processingState]=VALID",
    "filter[expired]=false",
    "sort=-uploadedDate",
    `limit=${BUILD_WINDOW}`,
    "include=preReleaseVersion,buildBetaDetail",
    "fields[builds]=version,preReleaseVersion,buildBetaDetail",
    "fields[preReleaseVersions]=version",
    "fields[buildBetaDetails]=internalBuildState,externalBuildState",
  ].join("&");
  const page = (await (await asc(`/builds?${query}`)).json()) as {
    data: BuildResource[];
    included?: Included[];
  };
  const included = new Map((page.included ?? []).map((item) => [`${item.type}:${item.id}`, item.attributes]));
  const newest = (state: "internalBuildState" | "externalBuildState"): TestFlightBuild | null => {
    for (const build of page.data) {
      const detailId = build.relationships?.buildBetaDetail?.data?.id;
      const detail = detailId ? included.get(`buildBetaDetails:${detailId}`) : undefined;
      if (detail?.[state] !== INSTALLABLE) continue;
      const versionId = build.relationships?.preReleaseVersion?.data?.id;
      const version = versionId ? included.get(`preReleaseVersions:${versionId}`)?.version : undefined;
      if (typeof version !== "string" || typeof build.attributes.version !== "string") continue;
      return { version, build: build.attributes.version };
    }
    return null;
  };
  return {
    bundleId: "dev.phux.mobile",
    appId,
    testflight: { internal: newest("internalBuildState"), external: newest("externalBuildState") },
  };
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/** Answer GET /api/ios/release. Never throws: failures are a 5xx the app ignores. */
export async function handleAppRelease(
  request: Request,
  env: TestFlightEnv,
  fetchImpl: Fetch = (input) => fetch(input),
  cache: EdgeCache | undefined = (globalThis as { caches?: { default?: EdgeCache } }).caches?.default,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("get only", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  if (!ascConfigured(env)) return failure("unconfigured", 503);
  // One cache entry whatever the query string, so a cache-buster cannot reach ASC.
  const key = new Request(new URL(APP_RELEASE_PATH, request.url).href);
  const cached = await cache?.match(key);
  if (cached) return cached;
  try {
    const response = Response.json(await latestRelease(env, fetchImpl), {
      headers: { "cache-control": `public, max-age=${CACHE_SECONDS}` },
    });
    await cache?.put(key, response.clone());
    return response;
  } catch (error) {
    console.error("app release lookup failed", error);
    return failure("unavailable", 502);
  }
}

function failure(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}
