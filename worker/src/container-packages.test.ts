import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

// Opt in: this downloads packages into a disposable container, not the full
// Rust/Bun image. Normal unit tests need neither Docker nor network access.
test.skipIf(process.env.PHUX_CONTAINER_PACKAGE_CHECK !== "1")(
  "the pinned runtime base installs every package and retains a working CA store after hardening",
  async () => {
    const info = spawnSync("docker", ["info"], {
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(info.status, info.stderr).toBe(0);

    const dockerfile = await Bun.file(
      new URL("../Dockerfile", import.meta.url),
    ).text();
    const runtime = dockerfile.slice(dockerfile.lastIndexOf("\nFROM ") + 1);
    const base = runtime.match(/^FROM --platform=linux\/amd64 (\S+)$/m)?.[1];
    const setup = runtime.match(/^RUN (apt-get update[\s\S]*?)(?=\n\n)/m)?.[1];
    expect(base).toMatch(/^debian:bookworm-slim@sha256:[a-f0-9]{64}$/);
    expect(setup).toBeDefined();
    const certificatePin = setup!.match(/\bca-certificates=([^\s\\]+)/)?.[1];
    expect(certificatePin).toBeDefined();

    const probe = spawnSync("docker", [
      "run", "--rm", "--platform=linux/amd64", base!,
      "sh", "-euxc", `
        # apt verifies the configured Bookworm release signatures. Show the
        # available versions and exact package metadata before setup removes apt.
        apt-get update
        apt-cache policy ca-certificates
        apt-cache show ca-certificates=${certificatePin}
        (
          ${setup}
        )
        test -s /etc/ssl/certs/ca-certificates.crt
        openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
        curl --fail --silent --show-error --max-time 30 https://deb.debian.org/debian/README >/dev/null
        test ! -e /usr/bin/apt-get
        test ! -e /usr/bin/dpkg
        test ! -e /usr/lib/apt
        test ! -e /var/lib/dpkg
        test "$(readlink /bin/sh)" = bash
        test "$(id -u guest)" = 10001
        test "$(id -g guest)" = 10001
        test "$(stat -c %u:%g /home/guest)" = 10001:10001
        echo CONTAINER_PACKAGES_TLS_HARDENING_OK
      `,
    ], {
      encoding: "utf8",
      timeout: 240_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    console.log(probe.stdout);
    expect(probe.status, probe.stderr).toBe(0);
    expect(probe.stdout).toContain("CONTAINER_PACKAGES_TLS_HARDENING_OK");
  },
  270_000,
);
