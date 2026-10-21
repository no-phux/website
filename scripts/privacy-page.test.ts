import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Keep the public policy in step with the optional mobile network paths.
const shell = readFileSync(new URL("../src/pages/privacy.astro", import.meta.url), "utf8");
const mobileDevice = readFileSync(new URL("../src/components/privacy/MobileDevicePrivacy.astro", import.meta.url), "utf8");
const page = shell.replace("<MobileDevicePrivacy />", mobileDevice);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
function section(id: string) {
  const html = page.match(new RegExp(
    `<section aria-labelledby="${id}">([\\s\\S]*?)</section>`,
  ))?.[1];
  expect(html).toBeDefined();
  return text(html!);
}

describe("mobile privacy disclosures", () => {
  test("the policy mounts its mobile-device disclosures once", () => {
    expect(shell).toContain('import MobileDevicePrivacy from "../components/privacy/MobileDevicePrivacy.astro";');
    expect(shell.match(/<MobileDevicePrivacy \/>/g)).toHaveLength(1);
  });
  test("optional Tailscale discovery discloses account-linked node identity and metadata", () => {
    const tailscale = section("tailscale");
    for (const disclosure of [
      "If you choose Tailscale setup", "embedded Tailscale node",
      "separate from an optional phux account", "Tailscale's control service",
      "not as the transport for your terminal sessions", "name (host name)",
      "public keys", "IP addresses", "network and operating-system metadata",
      "associated with your Tailscale account", "persistent node, not an ephemeral one",
      "saved locally outside device backups",
    ]) expect(tailscale).toContain(disclosure);
  });

  test("disabled log uploads do not imply no collection or remote deletion", () => {
    const tailscale = section("tailscale");
    expect(tailscale).toContain("disables Tailscale log uploads, but that does not prevent the identity and metadata exchange");
    expect(tailscale).toContain("Signing out of Tailscale setup attempts to reset authentication on a running node, then removes its local state");
    expect(tailscale).toContain("Closing the picker only stops the node; it does not erase that state");
    expect(tailscale).toContain("Neither action guarantees deletion of the node record or other data held by Tailscale");
    expect(tailscale).toContain("Tailscale's handling and retention of its records are governed by its privacy policy");
  });

  test("Tailscale is a linked provider, not just a terminal transport example", () => {
    expect(page).toMatch(/<section aria-labelledby="tailscale">[\s\S]*?href="https:\/\/tailscale\.com\/privacy-policy"[\s\S]*?<\/section>/);
    const providers = section("providers");
    expect(providers).toContain("Tailscale Optional iOS tailnet discovery; node identity and network metadata associated with your Tailscale account");
    expect(page).toMatch(/<tr><td><a href="https:\/\/tailscale\.com\/privacy-policy"[^>]*>Tailscale<\/a><\/td>/);
  });

  test("push is conditional on build support, account and Pro, not universal", () => {
    const device = section("device");
    expect(device).toContain("generated locally on your device");
    expect(device).toContain("In iOS builds configured for account-backed push");
    expect(device).toContain("Apple's Push Notification service (APNs)");
    expect(device).toContain("Registration requires both a signed-in phux account and active Pro access");
    expect(device).toContain("APNs device token and a push grant to the account backend");
    expect(device).toContain("The free iOS release has no account or subscription backend, so this push path is inactive");
    expect(device).toContain("builds using the no-op registry send no registration to an account backend");
    expect(text(page)).not.toContain("The apps are not set up to receive push notifications");
  });

  test("update requests disclose channel destinations and request metadata", () => {
    const updates = section("updates");
    for (const disclosure of [
      "App Store builds query Apple's public lookup service at itunes.apple.com",
      "bundle ID", "a country code", "TestFlight builds request https://phux.sh/api/ios/release",
      "Development builds do not make these update checks", "IP address and ordinary HTTP request metadata",
      "website processing", "do not send terminal content, pairing tokens, or your phux account identity",
    ]) expect(updates).toContain(disclosure);
    expect(page).toContain('href="#website"');
  });
});
