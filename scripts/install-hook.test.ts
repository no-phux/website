import { expect, test } from "bun:test";
import { advanceMoment } from "../src/components/prototype/vgpu/live/install-hook";
import { cliInstall, desktopInstall, dryRun, installTargets } from "../src/lib/install";

test("the dry run is the same installer told to install nothing",()=>{
  expect(dryRun(cliInstall)).toBe("curl -fsSL https://phux.sh/install | sh -s -- --dry-run");
  expect(dryRun(desktopInstall)).toBe("curl -fsSL https://phux.sh/install-desktop | sh -s -- --dry-run");
  expect(dryRun("")).toBe("");
  expect(installTargets.map(t=>t.id)).toEqual(["cli","desktop","mobile"]);
});
test("attention moments only advance",()=>{
  expect(advanceMoment("idle","engaged")).toBe("engaged");
  expect(advanceMoment("drove","engaged")).toBe("drove");
  expect(advanceMoment("copied","drove")).toBe("copied");
});
