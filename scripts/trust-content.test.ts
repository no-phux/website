import { expect, test } from "bun:test";

test("trust claims distinguish organization metadata from hosted terminal content", async () => {
  const text = (await Bun.file(new URL("../src/pages/trust.astro", import.meta.url)).text())
    .replace(/\s+/g, " ");
  expect(text).toContain("The organization control plane does not receive terminal streams");
  expect(text).toContain("The hosted demo processes terminal content");
  expect(text).toContain("Recordings and storage you configure are under your control");
  expect(text).toContain("Managed device-to-host connections use mutual TLS");
  expect(text).toContain("service needs HTTPS termination for production use");
  expect(text).toContain("Relay hosting carries end-to-end encrypted terminal streams, not their plaintext contents");
  expect(text).not.toContain("Every host and device connection uses mutual TLS");
});

test("trust claims retain synchronization, expiry and delivery limitations", async () => {
  const text = (await Bun.file(new URL("../src/pages/trust.astro", import.meta.url)).text())
    .replace(/\s+/g, " ");
  expect(text).toContain("Revocation takes effect when each host successfully synchronizes");
  expect(text).toContain("Hosts poll every 15 seconds by default");
  expect(text).toContain("Certificate expiry still applies");
  expect(text).toContain("When a license sets a retention period");
  expect(text).toContain("deletion is not immediate");
  expect(text).toContain("SIEM delivery is being qualified");
  expect(text).toContain("Do not rely on immediate or lossless delivery");
  expect(text).not.toContain("Revoking it reaches every host at once");
  expect(text).not.toContain("streamed to your SIEM as they arrive");
});
