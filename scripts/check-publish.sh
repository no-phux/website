#!/usr/bin/env bash
# The publishing contract that used to live in phux scripts/check-install-surface.sh.
# Installer bytes stay in no-phux/phux. This repo copies them at build time and
# proves the deploy still serves those bytes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
failures=0

require() {
  if ! grep -Fq -- "$2" "$ROOT/$1"; then
    echo "missing: $1: $2" >&2
    failures=$((failures + 1))
  fi
}

forbid() {
  if grep -Fq -- "$2" "$ROOT/$1"; then
    echo "stale claim: $1: $2" >&2
    failures=$((failures + 1))
  fi
}

require scripts/sync-docs.ts 'scripts/install.sh'
require scripts/sync-docs.ts '"public/install", "public/install.sh"'
require scripts/sync-docs.ts 'scripts/install-desktop.sh'
require scripts/sync-docs.ts '"public/install-desktop", "public/install-desktop.sh"'
require scripts/sync-docs.ts 'must start with #!/bin/sh'
forbid scripts/sync-docs.ts 'phall1/phux'
forbid scripts/sync-docs.ts 'scripts/install-cockpit.sh'

require .gitignore 'public/install'
require .gitignore 'public/install.sh'
require .gitignore 'public/install-desktop'
require .gitignore 'public/install-desktop.sh'
forbid .gitignore 'public/install-cockpit'
require public/_headers '/install-desktop'
forbid public/_headers '/install-cockpit'

require .github/workflows/site-deploy.yml 'repository: no-phux/phux'
require .github/workflows/site-deploy.yml 'cmp phux/scripts/install-desktop.sh "$downloaded"'
require .github/workflows/site-deploy.yml 'Verify the installers are served'
require .github/workflows/site-deploy.yml 'if [ "$shebang" != '"'"'#!/bin/sh'"'"' ]; then'

require src/lib/install.ts 'install-desktop | sh'
# The homepage picker maps every install target. A mobile id would render a Mobile tab.
forbid src/lib/install.ts 'id: "mobile"'
require src/pages/index.astro 'installTargets'
forbid src/pages/index.astro '<MobileAccessForm'
require src/components/MobileAccessForm.astro 'id="beta-form"'
require src/components/MobileAccessForm.astro 'href={iosDownload}'
forbid src/pages/index.astro 'wireBetaRequest('
require src/pages/more.astro '<MobileAccessForm'
require src/pages/more.astro 'wireBetaRequest('
# The homepage install switcher names only shipped platforms.
forbid src/pages/index.astro 'iPhone'
forbid src/pages/index.astro 'Android'
forbid src/pages/index.astro 'TestFlight' 
forbid src/pages/index.astro '-s -- --channel next'
forbid src/lib/install.ts '-s -- --channel next'

if [ "$failures" -ne 0 ]; then
  echo "publish contract: $failures failure(s)" >&2
  exit 1
fi
echo "publish contract ok"
