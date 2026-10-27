# Deploying phux-site

Two production deploys provide a native shell with an edge fallback:

| Piece                                                                                                          | Cloudflare product | Cost                                      |
| -------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------- |
| The static site (`dist/`, incl. the committed wasm client) — a Workers static-assets worker (`infra/alchemy.run.ts`) | **Workers**        | free                                      |
| Edge fallback (`SessionDO` running **phux-edge**), `infra/demo.run.ts` | **Workers / Durable Objects** | low/free-tier usage; no container |
| Production `?mode=native` (`PhuxSessionContainer`) | **Workers Containers** | Workers Paid + `lite` runtime/build storage |

The fallback runs the phux server itself as WASM inside a Durable Object, so it
adds no container runtime cost. Native requires Workers Paid. The site also
works without the backend (`PUBLIC_PHUX_DEMO_WS` empty → the terminal shows
"coming online").

Both deploy on push to `main` via GitHub Actions (below). Both Workers are
declared with [Alchemy](https://alchemy.run) in `infra/` (`alchemy.run.ts`
for the site, `demo.run.ts` for the demo); see `infra/README.md`.

---

## 1. The site → Workers static assets

A Workers static-assets worker (`phux-site`, declared in
`infra/alchemy.run.ts`) with a small host router (`host/index.ts`). Deploys
via `.github/workflows/site-deploy.yml`, or manually with `bun run deploy`
(`alchemy deploy --stage prod --profile phux`; see `infra/README.md`). Build
`bun run build`, output `dist`; the wasm client is committed under
`src/lib/phux-web/`, so no Rust/Zig is needed. Custom domains `phux.sh`
(product) and `docs.phux.sh` (documentation) are declared on the Worker. The
worker runs first (`run_worker_first`) so a docs path on `phux.sh` 301s to
the same path on `docs.phux.sh`, and `docs.phux.sh/` 301s to `/overview`.

### Agent discovery surface

The worker and `public/` together publish the machine-readable agent surface
(maintained in-repo): markdown negotiation for every HTML page (`Accept:
text/markdown`), a read-only MCP endpoint at `POST /mcp` (`host/mcp.ts`, card
at `/.well-known/mcp/server-card.json`), RFC 9727 `/.well-known/api-catalog`,
ARD `/.well-known/ai-catalog.json`, an agent-skills index rebuilt from
`.agents/skills/` by `scripts/sync-agent-skills.ts` on every build (product
skills only; the same allowlist is mirrored to `no-phux/skills` for
`npx skills add no-phux/skills`), `llms.txt`,
`auth.md`, Content Signals + `Agentmap` in `robots.txt`, and RFC 8288 `Link`
headers on HTML responses.

Documentation pages also publish a static `.md` URL from the same Astro content
collection (`src/pages/[...slug].md.ts`); `public/_headers` serves these files as
`text/markdown`. The hosted MCP prefers that source representation for docs.
After building, run `bun run verify:docs` for discovery and browser acceptance.
For WebKit clipboard coverage without pre-granted permissions, install the
Playwright WebKit browser and run `bun run verify:docs --webkit`.

Two DNS facts are NOT managed by this repo: DNSSEC is enabled (registrar is
Cloudflare, so the DS record is published automatically), and the DNS-AID
records `_mcp._agents` (SVCB+HTTPS, pointing at the hosted MCP endpoint) and
`_index._agents` (TXT, pointing at the ARD catalog) are declared in the
private `no-phux/ops` Alchemy stack.

### Telemetry (`/telemetry`)

`host/telemetry.ts` records passive aggregate counters (hourly buckets keyed
by user-agent class, country, host, agent signal, status, demo session) into
a `TelemetryDO` Durable Object. Page views and installer hits also count an
allowlisted `ref` query tag and a referrer channel (hostname only, mapped to
a known set). No IPs, no raw URLs, no full referrers, no cookies —
edge-only, and it catches AI crawlers that JavaScript analytics is blind to.
The public dashboard is `/telemetry`; its JSON API is `/api/telemetry`.
Static assets and the dashboard's own polling are excluded.

The demo worker has no Durable Object of its own for this: it forwards
session events to `POST /api/telemetry/ingest` on the site worker
(`TELEMETRY_INGEST_URL` var). Both workers share the `TELEMETRY_INGEST_KEY`
secret (`wrangler secret put TELEMETRY_INGEST_KEY --name phux-site` and
`--name phux-demo`); without it on either side, telemetry silently stops —
the demo door is never affected.

### Privacy-respecting analytics (private ops repo)

Beyond the public aggregates, both workers forward a minimal event envelope
to `phux-ops-analytics` in the private `no-phux/ops` repo over a same-account
Cloudflare service binding. No analytics ingest credential crosses workers or
repositories. The envelope forwards only the request path, referrer hostname,
and allowlisted, 80-byte-capped `utm_source`, `utm_medium`, and `utm_campaign`
fields — never a raw URL query or referrer URL. Schema, storage, and dashboards
live in the private repo. Anonymous visits are daily-rotated hashes with no
cookies; the only identified dataset is the voluntary join-the-beta list
(`POST /api/join`, with `MEMBER_KEY` used only for stable member identity),
where members opt a device in via a seven-day personal link. Claim links use
the independently rotatable `MEMBER_CLAIM_KEY`; during rotation the site may
also hold `MEMBER_CLAIM_KEY_PREVIOUS`. The private MCP operator surface uses
`OPS_MCP_KEY`; the service-bound producer receives no operator credential. All
of this is disclosed on `/telemetry`.

### Pairing a phone (`/session/pair`, `?attach=`)

The hosted demo shell can be driven from a second screen without an install or a
sign-in. The landing's dialog receives one single-use **attach code** in its
session envelope and shows it as a QR for `https://phux.sh/phone#CODE`; the phone
attaches to the same session through `wss://shell.phux.sh/session?attach=CODE`.

- Worker side: `GET /session/pair?code=…` answers "has this code been spent yet?"
  for the pairing panel. It sets CORS only for the origins in `ALLOWED_ORIGINS`
  (the one list the websocket handshake also checks), answers `no-store`, and
  leaks nothing a code holder could not do anyway.
- Session side: the code is single-use, lives at most five minutes, never
  outlives its session, and is spent inside the session object's
  single-threaded window. An attachment reserves no slot, so pairing consumes no
  capacity, no native admission, and no launch or daily budget.
- Scope: a pairing code is an `attach`-scoped token and cannot open a session; a
  session token cannot attach. `worker/src/token.test.ts` pins both directions.
- Logs: the code is in the pairing page's URL fragment (never sent to a server)
  but does appear in the websocket upgrade's query string, which this Worker's
  invocation logs persist. That is the same bearer-in-URL trade the CLI's
  `phux pair` link makes; single-use, a five-minute life, and attach-only scope
  bound it. Do not extend the code's lifetime without revisiting this.
- Native sessions refuse an attach (`pairing covers the edge shell only`), so a
  future container offering must add its own path rather than inherit this one.
- `bun run verify:pair [origin]` drives the whole thing in a browser against a
  live site: the pairing panel, the phone page, the linked state, and a pane
  spawned on each screen showing up on the other. It talks to the deployed demo
  Worker, so it only passes where the pairing surface is actually serving.

### TestFlight access requests (`/api/beta`)

`/download/ios` reads the same external group's enabled public link with the
existing ASC credentials, then redirects to Apple. It never enables a link or
changes distribution. Lookup caching is bounded to 60 seconds; a missing,
disabled, or failed link falls back to `/more` with optional email access.
Enable/share the public link in App Store Connect → TestFlight → external group
to allow joining without email entry. Apple owns acceptance and installation.

The "phux for iPhone" request is the landing's third install target (`Mobile`)
and the form on `/more`; both post to `/api/beta`
(`host/testflight.ts`). The Worker adds the address to an external TestFlight
group of `dev.phux.mobile` through the App Store Connect API, and Apple emails
the invite. It reuses the phux-mobile release lane's team API key, set as
Worker secrets:

```bash
printf %s "$KEY_ID" | bunx wrangler secret put ASC_KEY_ID --name phux-site
printf %s "$ISSUER_ID" | bunx wrangler secret put ASC_ISSUER_ID --name phux-site
bunx wrangler secret put ASC_PRIVATE_KEY --name phux-site < ~/.appstoreconnect/private_keys/AuthKey_$KEY_ID.p8
```

The first external group is used unless `ASC_BETA_GROUP` (a group name) or
`ASC_BETA_GROUP_ID` pins one. Every request is also recorded on the member
list with source `testflight:<outcome>`; `testflight:failed` and
`testflight:unconfigured` rows are the manual-invite queue. Without the
secrets the form still records requests.

### App update check (`/api/ios/release`)

phux-mobile's update prompt on TestFlight builds reads `GET /api/ios/release`
(`host/app-release.ts`): the app's Apple ID and the newest build internal and
external testers can each install (`IN_BETA_TESTING`), read from App Store
Connect with the same secrets. Answers are edge-cached for five minutes,
keyed without the query string. Without the secrets it answers 503 and the app
simply offers no TestFlight update; App Store builds use Apple's public lookup
and never call it.

### The curl installers

`https://phux.sh/install` and `https://phux.sh/install.sh` serve the repo's
`scripts/install.sh` byte for byte; `https://phux.sh/install-desktop` and
`https://phux.sh/install-desktop.sh` serve `scripts/install-desktop.sh`, which
installs the GPUI `Phux.app` from `desktop-vX.Y.Z` releases.
`scripts/sync-docs.ts` copies both into `public/` on every build and all
four destinations are gitignored, so a published installer cannot drift from
the script the release tests exercise.
Two real files per installer rather than a redirect, because
`curl https://phux.sh/install` has to work without `-L`.

The installers and homepage badges compare numeric component versions across
the bounded recent release index. They do not trust GitHub's list order:
an older alpha can appear before a newer one, including alpha.9 before alpha.10.

Three things keep that honest. `scripts/check-publish.sh` pins the copy and the
cache headers in this repo. no-phux/phux `.github/workflows/website-dispatch.yml`
lists the installer paths, so an installer change dispatches this repo instead
of leaving phux.sh on the old script. `sync-docs.ts` refuses to publish a
script whose shebang is not `#!/bin/sh`, and `_headers` caps all four routes at
five minutes of edge cache so a fix propagates while somebody is still running
the broken one.

## 2. The backend → Worker + Durable Objects

`site-deploy-worker.yml` deploys it on relevant worker, package, lockfile, and smoke
script changes. The committed **phux-edge** WASM still needs no Rust build. With
the container binding,
Alchemy also needs a working Docker daemon to build and upload the linux/amd64
image to the existing `phux-demo-phuxsessioncontainer` application. Do not deploy native configuration until the Cloudflare account is on
Workers Paid and Containers is enabled.

The shell that runs in the DO is `phux-edge` (`edge/`, Rust→WASM). Rebuild it
when that crate changes:

```sh
bun run build:edge        # needs rust 1.99 + wasm-pack (phux nix devshell), → worker/edge/
```

---

## Push-to-deploy (GitHub Actions)

Site workflows live in this repo (`.github/workflows/site-*.yml`). Docs and
installers live in no-phux/phux. A push there that changes them dispatches
`phux-content` at this repo, which checks phux out and rebuilds.

- **`site-deploy.yml`** → site (Workers static assets on phux.sh) on every push
  to this repo, on `phux-content`, and on the Monday cron. Manual dispatch is
  available.
- **`site-deploy-worker.yml`** → validates, records the prior version, deploys, then
  exercises native and same-IP edge fallback.
- **`site-native-monitor.yml`** → six-hour exact-wire native synthetic; manual dispatch
  can run an on-demand probe or exercise graceful fallback.
- **`site-native-control.yml`** → private `workflow_dispatch` kill-switch deployment.
- **`site-rollback-worker.yml`** → private version-ID rollback.

### One-time setup

See [One-time deployment setup](DEPLOY_SETUP.md) for Cloudflare permissions,
domains, repository and Worker secrets, OAuth callbacks, and native prerequisites.

### Optional read-only GitHub App for portfolio discovery

Until this is configured, the Worker deliberately keeps using GitHub's
unauthenticated public repository API. Configure both bindings together: if only
one is present, portfolio discovery fails closed. The private key belongs only in
Cloudflare Worker secrets, not this repository or GitHub Actions.

1. In GitHub, open **Settings → Developer settings → GitHub Apps → New GitHub
   App**. Use any unique name and homepage URL `https://phux.sh`; disable
   the webhook, leave callback URLs empty, and do not request user authorization
   during installation. Choose **Only on this account** for installation scope.
   Set repository permission **Actions: Read-only**. GitHub's
   mandatory **Metadata: Read-only** permission is sufficient for repository
   discovery; grant no other repository, organization, or account permissions.
2. Create the App, note its numeric **App ID**, generate a private key, and
   install it on the `phall1` account for **All repositories**. All-repository
   installation is what lets future public repositories appear without a
   deploy; the exact `phall-showcase` topic remains the publication boundary.
3. Convert the downloaded key to unencrypted PKCS#8. Then upload both bindings
   to Cloudflare in one atomic bulk operation and remove the converted file.
   The App ID is not sensitive, but storing it in the same operation prevents a
   partially configured deployment:

   ```sh
   openssl pkcs8 -topk8 -nocrypt -in ~/Downloads/<app-name>.*.private-key.pem -out /tmp/phux-github-app.pkcs8.pem
   jq -n --arg app_id '<numeric app id>' --rawfile private_key /tmp/phux-github-app.pkcs8.pem \
     '{GITHUB_APP_ID:$app_id,GITHUB_APP_PRIVATE_KEY:$private_key}' \
     | bunx wrangler secret bulk --name phux-demo
   rm /tmp/phux-github-app.pkcs8.pem
   ```

4. Verify
   `https://shell.phux.sh/healthz`. The Worker creates a
   short-lived App JWT, resolves the `phall1` installation, and caches only the
   installation token and expiry in isolate memory. Edge snapshot cache entries
   contain only the public display schema.

Onboard or remove any public repository in one command; no deploy is required:

```sh
gh repo edit phall1/<repo> --add-topic phall-showcase
gh repo edit phall1/<repo> --remove-topic phall-showcase
```

After that: **push to `main` → it deploys.** Free.

---

## Lifecycle / abuse guardrails (server-side)

`infra/demo.run.ts` (tuning vars) + the DOs: secret-keyed per-IP rate-limit objects, a
global concurrency cap,
and the DO self-closes on idle (2 min) / hard-max (10 min). Generous, because a
session is ~free (a DO holding a WebSocket — no container).

Native requires a verified GitHub or Google identity. It uses the same origin
and global admission, plus a soft limit of 25 active containers, 30 `lite`
platform instances, one active shell per account, six launches per rolling hour
per account, 30 minutes per UTC day per account, one active shell per IP, and two
launches per IP per minute. It has a five-minute hard maximum and 15-second
post-disconnect sleep.
No Worker secret is forwarded into the image. `enableInternet = false` is the
Cloudflare-enforced egress control.

Native startup has an eight-second deadline. Failure atomically becomes the edge
portfolio shell, never a queue or closed upgrade. The default circuit opens after
three startup/pre-upgrade failures in 60 seconds, stays open 60 seconds, and
allows one cooldown probe. Capacity fallback does not trip it. `/healthz`
exposes only aggregate diagnostics.

### Kill switch

`NATIVE_ENABLED` is parked: an unset value means `false`, so native admission
stays off until it is deliberately turned back on and no ordinary deploy can
silently restore it. While parked, every native request routes to the edge shell
and the client reports "Native shells are paused."

Turn it back on with the repository variable the worker deploy passes through:

```sh
gh variable set PHUX_NATIVE_ENABLED --body true    # persists across deploys
```

The `native-control` workflow overrides the value for one deploy
(`enabled=true|false`) and prints the `gh variable set` line for persistence.
Setting a variable or deploying a Worker version is never a public endpoint;
workflow history is the audit trail.

Use the kill switch, not a pre-auth Worker rollback, for emergency containment.
`site-rollback-worker.yml` requires an explicit confirmation that the target version
preserves authenticated native admission and verifies `/auth/session` after the
rollback. A version from before the auth boundary is not a valid rollback target.

---

## Local dev

```sh
bun run dev:worker        # alchemy dev — the Worker + DOs (edge only) at :8787
#   optional infra/.env: SESSION_TOKEN_SECRET=…, AUTH_COOKIE_SECRET=…
#                        (dev values otherwise); ALLOWED_ORIGINS defaults to http://localhost:4321
PUBLIC_PHUX_DEMO_WS=ws://localhost:8787/session bun run dev   # the site, pointed at it
```

(Or `bun run dev:live` to run the **real** native phux server instead of the
edge shell — for developing the client against real phux.)

### Native image

```sh
docker buildx build --platform linux/amd64 --load -t phux-site-native:test worker
docker run --rm --platform linux/amd64 -p 127.0.0.1:8080:8080 \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,uid=10001,gid=10001 \
  --security-opt no-new-privileges --pids-limit 64 --memory 384m --cpus .5 \
  phux-site-native:test
```

Connect protocol tooling to `ws://127.0.0.1:8080/`. Confirm `HELLO`/`ATTACH`,
the greeting, `echo PHUX_NATIVE_OK`, `phui --version`, and a clean restart.

### Smoke, image activation, and rollback

Run the private `native-monitor` workflow with `exercise_fallback=true` before
merging a native image change. It consumes two starts from the runner IP, holds
one native session, verifies the second gets an edge 101 and honest greeting,
then closes both. The scheduled probe uses one start every six hours, below the
two/minute limit. Neither path logs frame contents.

Every deployment records the previous Cloudflare Worker version in its Actions
summary. Roll back that exact version with the private `rollback-worker`
workflow, which creates a 100% deployment of it through the Cloudflare API.
The next deploy from `main` rolls forward again.

Cloudflare Versions can split Worker traffic, but container image rollout and
per-IP admission make an unattended canary unsafe here. There is no automatic
rollback. Use the manual pre-activation smoke and explicit version rollback. No
native container data is durable. Alchemy derives Durable Object migrations
from the Worker's `alchemy:dos` tag, keyed by the `env` binding name: never
rename a DO binding or class in `infra/demo.run.ts` without its
`transferredFrom`/rename semantics, or the class's data is deleted.
