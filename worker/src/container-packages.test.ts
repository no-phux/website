import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

function runOwnedContainer(base: string, script: string, timeout: number) {
  const created = spawnSync("docker", [
    "create", "--platform=linux/amd64", base, "sh", "-euxc", script,
  ], { encoding: "utf8", timeout: 60_000 });
  expect(created.status, created.stderr).toBe(0);
  const containerId = created.stdout.trim();
  expect(containerId).toMatch(/^[a-f0-9]{64}$/);
  console.log(`Created owned container ${containerId}`);

  try {
    const probe = spawnSync("docker", ["start", "--attach", containerId], {
      encoding: "utf8",
      timeout,
      maxBuffer: 16 * 1024 * 1024,
    });
    const state = spawnSync("docker", [
      "inspect", "--format={{.State.Running}}", containerId,
    ], { encoding: "utf8", timeout: 15_000 });
    console.log(`Attach client PID ${probe.pid}; container ${containerId} running after attach: ${state.stdout.trim()}`);
    return { probe, containerId, runningAfterAttach: state.stdout.trim() };
  } finally {
    // A timed-out Docker client does not imply the container stopped.
    const removed = spawnSync("docker", ["rm", "--force", containerId], {
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(removed.status, removed.stderr).toBe(0);
    expect(removed.stdout.trim()).toBe(containerId);
    console.log(`Removed owned container ${removed.stdout.trim()}`);
  }
}

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

    const { probe } = runOwnedContainer(base!, `
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
      `, 240_000);
    console.log(probe.stdout);
    expect(probe.status, probe.stderr).toBe(0);
    expect(probe.stdout).toContain("CONTAINER_PACKAGES_TLS_HARDENING_OK");
  },
  350_000,
);

test.skipIf(process.env.PHUX_CONTAINER_PACKAGE_CHECK !== "1")(
  "a timed-out Docker client force-removes only its recorded, still-running container",
  async () => {
    const dockerfile = await Bun.file(
      new URL("../Dockerfile", import.meta.url),
    ).text();
    const runtime = dockerfile.slice(dockerfile.lastIndexOf("\nFROM ") + 1);
    const base = runtime.match(/^FROM --platform=linux\/amd64 (\S+)$/m)?.[1];
    expect(base).toMatch(/^debian:bookworm-slim@sha256:[a-f0-9]{64}$/);
    const { probe, containerId, runningAfterAttach } = runOwnedContainer(
      base!,
      "trap '' TERM; echo OWNED_CONTAINER_STARTED; exec sleep 60",
      2_000,
    );
    expect(probe.error).toMatchObject({ code: "ETIMEDOUT" });
    expect(probe.stdout).toContain("OWNED_CONTAINER_STARTED");
    expect(runningAfterAttach).toBe("true");
    const absent = spawnSync("docker", ["inspect", containerId], {
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(absent.status).not.toBe(0);
    expect(absent.stderr).toMatch(/no such object/i);
  },
  120_000,
);
