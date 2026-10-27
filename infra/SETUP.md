# One-time deployment setup

These commands run from the repository root unless specified. Return to
[the deployment guide](../DEPLOY.md#push-to-deploy-github-actions) for the release lanes.

1. **Cloudflare API token** (My Profile → API Tokens → Create Custom Token).
   Exact recipe — a token's permissions cannot be edited from the API later,
   only in the dashboard, so get this right at creation:
   - Account (this account): **Workers Scripts : Edit**, **Containers : Write**
   - Zone `phux.sh`: **Workers Routes : Edit** (the demo deploy reconciles
     its `phux.sh/auth/*` route on every deploy)
   - Zone Resources: Include → `phux.sh`
   Verify before wiring CI: `bun run plan` and `bun run plan:demo` in
   `infra/` with that token (and `CLOUDFLARE_ACCOUNT_ID`) in the environment
   should pass. Grab your **Account ID**.
2. **Repo secrets** (Settings → Secrets and variables → Actions):
   ```
   CLOUDFLARE_API_TOKEN   = <token>
   CLOUDFLARE_ACCOUNT_ID  = <account id>
   ```
3. **Custom domains** attach once (`phux.sh` and `docs.phux.sh` on the site
   worker, `shell.phux.sh` on the demo worker — declared in
   `infra/alchemy.run.ts` and `infra/demo.run.ts`, so `bun run deploy` /
   `bun run worker:deploy` attach them; the zone must live in the same
   account).

   **Pages-migration wart, learned the hard way:** deleting a Pages project
   does not reliably remove the zone CNAME its custom domain created. The
   record becomes invisible to the DNS list API but still blocks Workers
   custom-domain attaches (`code 100117`, "externally managed DNS records").
   Verify with a BIND export (`GET /zones/{id}/dns_records/export`) before
   reattaching a hostname, and delete the stale record in the dashboard (DNS →
   Records) if it lingers — API deletion of Pages-managed records is not
   reliable. The `phux.phall.io` redirect lives as a **zone Redirect Rule**
   (Rules → Redirect Rules) over a dummy proxied `AAAA 100::` record, not a
   Worker — keep it that way.

   **That redirect is why pairing links no longer use `phux.phall.io`.** iOS
   fetches `/.well-known/apple-app-site-association` with redirects
   disallowed, so a zone redirect is indistinguishable from an unclaimed
   domain and every scanned pairing QR opened Safari. The association is
   served from `host/pairing.ts`, ahead of all routing, and the emitted link
   host is `phux.sh` (ADR-0031, amendment 2026-09-19). If the association
   ever needs to move hosts again, the app's entitlement is compiled into its
   signature — a new TestFlight build must ship *before* the CLI emits the
   new host, or in-app scanning breaks for everyone on the old build.
4. **Session and OAuth secrets** on the Worker (after the first deploy):
   ```sh
   openssl rand -hex 32 | bunx wrangler secret put SESSION_TOKEN_SECRET --name phux-demo
   openssl rand -hex 32 | bunx wrangler secret put AUTH_COOKIE_SECRET --name phux-demo
   ```
   Generate the production monitor credential once, install the same value in
   the Worker and the repository's `PHUX_SYNTHETIC_TOKEN` Actions secret, then
   discard the local value. It is accepted only as a native WebSocket bearer
   header, which browser WebSockets cannot set.
   ```sh
   monitor_secret="$(openssl rand -hex 32)"
   printf %s "$monitor_secret" | bunx wrangler secret put SYNTHETIC_TOKEN_SECRET --name phux-demo
   gh secret set PHUX_SYNTHETIC_TOKEN --body "$monitor_secret"
   unset monitor_secret
   ```
5. **OAuth clients:** register exact callbacks, with no wildcard redirects:
   - GitHub OAuth App: homepage `https://phux.sh`, Authorization callback URL
     exactly `https://phux.sh/auth/github/callback` (no trailing slash). The
     browser never navigates to `shell.phux.sh` for OAuth; Cloudflare 403s
     some document requests to that hostname. A mismatch is GitHub's
     "Invalid Redirect URI" page.
     Request no scopes. An unverified-app caution on first authorize is not a
     failure; publisher verification is the only way to remove it. The Worker
     always sends that public-site `redirect_uri`. OAuth `state` is an opaque
     nonce matched against a required signed HttpOnly transaction cookie; the
     PKCE verifier remains only in that cookie. A missing, expired, or mismatched
     cookie fails closed with a retryable sign-in message, never a stateless fallback.
   - Google Web OAuth client in the `phux-shell-*` project: authorized
     JavaScript origins `https://phux.sh` and `https://shell.phux.sh`;
     authorized redirect URI exactly `https://phux.sh/auth/google/callback`
     (keep `https://shell.phux.sh/auth/google/callback` if it is already
     registered). The sign-in page itself is `https://phux.sh/auth/google`.
     A missing URI is Google's Error 400 `redirect_uri_mismatch` ("this app
     sent an invalid request"). The consent screen app name and support email
     must be real; a leftover placeholder brand means the client was never
     finished.

   Install all four provider values atomically from a temporary local file so a
   deployment cannot see a half-configured provider:
   ```sh
   jq -n \
     --arg github_id "$GITHUB_OAUTH_CLIENT_ID" \
     --arg github_secret "$GITHUB_OAUTH_CLIENT_SECRET" \
     --arg google_id "$GOOGLE_OIDC_CLIENT_ID" \
     --arg google_secret "$GOOGLE_OIDC_CLIENT_SECRET" \
     '{GITHUB_OAUTH_CLIENT_ID:$github_id,GITHUB_OAUTH_CLIENT_SECRET:$github_secret,GOOGLE_OIDC_CLIENT_ID:$google_id,GOOGLE_OIDC_CLIENT_SECRET:$google_secret}' \
     | bunx wrangler secret bulk --name phux-demo
   ```
   Provider access and ID tokens are used only to verify identity during the
   callback and are never persisted or sent to the browser.
6. **Wire site → Worker:** the Worker owns the `shell.phux.sh` custom
   domain from `infra/demo.run.ts`. Set the repo **variable**
   `PUBLIC_PHUX_DEMO_WS = wss://shell.phux.sh/session` and push (or re-run
   `deploy-site`). The build inlines it.
7. **Native prerequisite:** confirm Workers Paid, Containers entitlement, and
   capacity for 30 `lite` instances. Admission uses a 25-session soft cap and
   leaves five instances as platform headroom.

Rotate OAuth client secrets by creating the replacement at the provider,
uploading it with `wrangler secret put`, verifying a complete login, and only
then revoking the old value. Rotating `AUTH_COOKIE_SECRET` intentionally signs
every user out; upload the replacement and verify both providers immediately.

The committed browser artifact is built from in-repo `clients/phux-web` at
workspace protocol 0.9, the same wire the native image pin (`PHUX_VERSION` in
`worker/Dockerfile`) and `phux-edge` speak. `scripts/build-client.sh` rebuilds
it from this checkout.
