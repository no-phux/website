# phux website

[phux.sh](https://phux.sh) and [docs.phux.sh](https://docs.phux.sh).

The product source stays in [no-phux/phux](https://github.com/no-phux/phux).
This repo builds and deploys the site. A build checks out phux and copies the
docs, the curl installers, and the product skills. It does not keep a second
copy of them.

Locally, put the phux checkout at `../../phux` (this repo lives at
`no-phux/website`) or `../phux`, or set `PHUX_ROOT`.

```sh
bun install
bun run hooks:install   # pre-commit rejects staged files over 5,000 tokens
bun run dev
```

Deploy and the worker are in [DEPLOY.md](./DEPLOY.md). Cloudflare credentials
are repository secrets on this repo (`CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `PHUX_SYNTHETIC_TOKEN`) plus the `PUBLIC_PHUX_DEMO_WS`
variable.

[Apache-2.0](./LICENSE). Copyright 2026 phall.

Brand artwork is pinned in `brand.lock.json` and checked by `bun run
brand:check` during builds. The private phux-brand library publishes approved
releases; phux's `brand-update` workflow opens update PRs here. This repo owns
`/brand` and the append-only public archives in `public/brand/releases/`.
Old archives remain available for restoring older app pins. Normal builds
require no access to the private source library. `bun run brand:restore`
restores the current pin; use `python3 scripts/brand.py sync --archive PATH
--sha256 SHA256` to install an explicitly checksummed release or rollback.

The shared `src/components/Wordmark.tsx` uses the approved transparent mono SVG
installed at `public/brand/images/mono-wordmark.svg`. The canonical source is
`logos/wordmark-mono.svg`, mapped in `brand.config.json`; synchronize only a
checksummed approved archive, not private source artwork. Missing artwork fails
the build rather than substituting typeset text. Its mask inherits surrounding
ink, keeps the 17:7 SVG proportions and built-in clear space, and respects the
108px minimum export width. It does not change body or code fonts. The home and
docs social cards use the same pin, retaining their separate fox marks.
The documentation SVG and PNG remain separate downloadable assets.

For external embeds (including GitHub README `<picture>` elements), use
`https://phux.sh/brand/images/wordmark-light.svg?v=1.5.0` on dark backgrounds and
`https://phux.sh/brand/images/wordmark-dark.svg?v=1.5.0` on light backgrounds.
Matching `wordmark-light-512.png` and `wordmark-dark-512.png` (also 256/1024)
are available at the same base path. The mono SVG uses `currentColor`; use its
CSS mask/inline form, not an external `<img>`, when it must inherit page ink.

After installing a release, retain its approved ZIP, manifest and `SHA256SUMS`
under `public/brand/releases/VERSION/` and add its checksum to
`public/brand/index.json`; never remove old archives. Run `bun run brand:check`,
`bun run check`, `bun run test`, `bun run build`, and `bun run verify:brand`.
For a system Chromium rather than Google Chrome, use
`CHROME_PATH=/usr/bin/chromium bun run verify:brand`. This checks responsive
wordmarks on home, docs, embed and concepts, and writes screenshots to
`.home-check/`; review both light/dark mono previews on `/brand` after a pin update.
