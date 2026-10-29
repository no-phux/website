import { describe, expect, test } from "bun:test";
import { detectInstallPlatform, installActions, type InstallPlatform } from "../src/lib/home-platform";
import { platformVisitors } from "./home-platform-fixtures";

describe("device-first homepage installs", () => {
  for (const [name, visitor] of Object.entries(platformVisitors)) {
    test(`recognizes ${name} without confusing phones with Mac/Linux`, () => {
      expect(detectInstallPlatform(visitor)).toBe(name === "ipadDesktop" ? "ipad" : name as InstallPlatform);
    });
  }
  test("does not guess Mac when browser information is unavailable", () => {
    expect(detectInstallPlatform(undefined)).toBe("unknown");
    expect(detectInstallPlatform({})).toBe("unknown");
  });
  test("only the actual Mac action downloads a Mac archive", () => {
    for (const [platform, action] of Object.entries(installActions)) {
      expect(action.href === "/download/desktop").toBe(platform === "mac");
    }
  });
  test("phone visitors get the same action as an unknown platform", () => {
    for (const platform of ["iphone", "ipad", "android"] as const) {
      expect(installActions[platform]).toEqual(installActions.unknown);
    }
    expect(installActions.unknown.label).toBe("Choose your platform");
    expect(installActions.unknown.href).not.toMatch(/download\/ios|testflight/i);
    expect(installActions.windows.note).toContain("No native Windows app yet");
  });
});
