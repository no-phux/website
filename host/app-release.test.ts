import { describe, expect, test } from "bun:test";
import { handleAppRelease } from "./app-release";
import type { TestFlightEnv } from "./testflight";

async function privateKeyPem(): Promise<string> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const base64 = btoa(String.fromCharCode(...der));
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
}

const PEM = await privateKeyPem();
let issuers = 0;

/** Fresh issuer per test so the isolate-level token and app-id caches never leak. */
function env(): TestFlightEnv {
  issuers += 1;
  return { ASC_KEY_ID: "KEY123", ASC_ISSUER_ID: `release-${issuers}`, ASC_PRIVATE_KEY: PEM };
}

function build(id: string, number: string, version: string, internal: string, external: string) {
  return {
    data: {
      type: "builds",
      id,
      attributes: { version: number },
      relationships: {
        preReleaseVersion: { data: { type: "preReleaseVersions", id: `v-${version}` } },
        buildBetaDetail: { data: { type: "buildBetaDetails", id: `d-${id}` } },
      },
    },
    included: [
      { type: "preReleaseVersions", id: `v-${version}`, attributes: { version } },
      {
        type: "buildBetaDetails",
        id: `d-${id}`,
        attributes: { internalBuildState: internal, externalBuildState: external },
      },
    ],
  };
}

function page(...builds: ReturnType<typeof build>[]) {
  return {
    data: builds.map((entry) => entry.data),
    // ASC de-duplicates included resources shared by several builds.
    included: [...new Map(builds.flatMap((entry) => entry.included).map((item) => [`${item.type}:${item.id}`, item])).values()],
  };
}

function fakeAsc(builds: unknown, status = 200) {
  const paths: string[] = [];
  const fetchImpl = async (request: Request) => {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname + url.search).replace("/v1", "");
    paths.push(path);
    if (path.startsWith("/apps?")) return Response.json({ data: [{ id: "6740000001", attributes: {} }] });
    if (path.startsWith("/builds?")) return Response.json(builds, { status });
    return new Response("unexpected", { status: 500 });
  };
  return { paths, fetchImpl };
}

class MemoryCache {
  readonly entries = new Map<string, Response>();
  async match(request: Request) {
    return this.entries.get(request.url)?.clone();
  }
  async put(request: Request, response: Response) {
    this.entries.set(request.url, response);
  }
}

const get = (path = "/api/ios/release") => new Request(`https://phux.sh${path}`);

describe("handleAppRelease", () => {
  test("is unavailable without the API key secrets", async () => {
    const { paths, fetchImpl } = fakeAsc(page());
    const response = await handleAppRelease(get(), {}, fetchImpl, new MemoryCache());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unconfigured" });
    expect(paths).toHaveLength(0);
  });

  test("answers the newest installable build for each TestFlight audience", async () => {
    const { paths, fetchImpl } = fakeAsc(
      page(
        build("b4", "202610200900", "0.3.138", "PROCESSING", "PROCESSING"),
        build("b3", "202610192236", "0.3.137", "IN_BETA_TESTING", "READY_FOR_BETA_SUBMISSION"),
        build("b2", "202610191335", "0.3.136", "IN_BETA_TESTING", "IN_BETA_TESTING"),
        build("b1", "202610180900", "0.3.135", "IN_BETA_TESTING", "IN_BETA_TESTING"),
      ),
    );
    const response = await handleAppRelease(get(), env(), fetchImpl, new MemoryCache());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await response.json()).toEqual({
      bundleId: "dev.phux.mobile",
      appId: "6740000001",
      testflight: {
        internal: { version: "0.3.137", build: "202610192236" },
        external: { version: "0.3.136", build: "202610191335" },
      },
    });
    const builds = paths.find((path) => path.startsWith("/builds?"))!;
    expect(builds).toContain("filter[app]=6740000001");
    expect(builds).toContain("filter[processingState]=VALID");
    expect(builds).toContain("filter[expired]=false");
    expect(builds).toContain("sort=-uploadedDate");
  });

  test("reports no external build when none is approved", async () => {
    const { fetchImpl } = fakeAsc(
      page(build("b1", "202610192236", "0.3.137", "IN_BETA_TESTING", "READY_FOR_BETA_SUBMISSION")),
    );
    const body = await (await handleAppRelease(get(), env(), fetchImpl, new MemoryCache())).json();
    expect(body.testflight).toEqual({
      internal: { version: "0.3.137", build: "202610192236" },
      external: null,
    });
  });

  test("serves one cached answer whatever the query string", async () => {
    const { paths, fetchImpl } = fakeAsc(page(build("b1", "1", "1.0.0", "IN_BETA_TESTING", "IN_BETA_TESTING")));
    const cache = new MemoryCache();
    const config = env();
    await handleAppRelease(get(), config, fetchImpl, cache);
    const calls = paths.length;
    const again = await handleAppRelease(get("/api/ios/release?bust=1"), config, fetchImpl, cache);

    expect(again.status).toBe(200);
    expect((await again.json()).testflight.internal.build).toBe("1");
    expect(paths).toHaveLength(calls);
    expect([...cache.entries.keys()]).toEqual(["https://phux.sh/api/ios/release"]);
  });

  test("turns an App Store Connect failure into an uncached 502", async () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      const { fetchImpl } = fakeAsc({ errors: [] }, 503);
      const cache = new MemoryCache();
      const response = await handleAppRelease(get(), env(), fetchImpl, cache);
      expect(response.status).toBe(502);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(cache.entries.size).toBe(0);
    } finally {
      console.error = quiet;
    }
  });

  test("refuses anything but GET and HEAD", async () => {
    const { fetchImpl } = fakeAsc(page());
    const response = await handleAppRelease(
      new Request("https://phux.sh/api/ios/release", { method: "POST" }),
      env(),
      fetchImpl,
    );
    expect(response.status).toBe(405);
  });
});
