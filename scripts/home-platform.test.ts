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
  test("the homepage names only the shipped platforms", () => {
    const shipped = "macOS, Linux, Windows via WSL 2";
    expect(installActions.unknown.note).toBe(shipped);
    expect(installActions.windows.note).toBe("Windows via WSL 2");
    expect(installActions.windows.href).toBe("/installation#windows-wsl");
    for (const platform of ["iphone", "ipad", "android"] as const) {
      expect(installActions[platform].note).toBe(shipped);
      expect(installActions[platform].label).toBe("Choose your platform");
      expect(installActions[platform].target).toBeUndefined();
      expect(installActions[platform].phone).toBeUndefined();
    }
    for (const action of Object.values(installActions)) {
      expect(`${action.label} ${action.note}`).not.toMatch(/iPhone|Android|TestFlight|phone|Mobile/i);
    }
  });
});
