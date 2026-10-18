import { expect, test } from "bun:test";
import { advanceMoment, copiedNote, hookLede, installLink } from "../src/components/prototype/vgpu/live/install-hook";
import { cliInstall, desktopInstall, dryRun, installTargets } from "../src/lib/install";

test("the dry run is the same installer told to install nothing",()=>{
  expect(dryRun(cliInstall)).toBe("curl -fsSL https://phux.sh/install | sh -s -- --dry-run");
  expect(dryRun(desktopInstall)).toBe("curl -fsSL https://phux.sh/install-desktop | sh -s -- --dry-run");
  expect(dryRun("")).toBe("");
  expect(installTargets.map(t=>t.id)).toEqual(["cli","desktop","mobile"]);
});
test("moments only advance and the lede claims only what happened",()=>{
  expect(advanceMoment("idle","engaged")).toBe("engaged");
  expect(advanceMoment("drove","engaged")).toBe("drove");
  expect(advanceMoment("copied","drove")).toBe("copied");
  expect(hookLede("idle")).toBe(hookLede("engaged"));
  expect(hookLede("drove")).toMatch(/You just drove/);
  expect(hookLede("idle",false)).not.toMatch(/running live/);
  expect(copiedNote("cli",true)).toMatch(/installs nothing/);
  expect(copiedNote("desktop",false)).toMatch(/Phux\.app/);
});
test("the install stream leaves the lowest terminal and lands on the hook",()=>{
  const primary={x:0,y:0,width:800,height:220},satellite={x:820,y:30,width:400,height:150};
  const hook={x:0,y:260,width:800,height:200};
  const link=installLink([primary,satellite],hook,.5)!;
  expect(link[0]).toEqual({x:400,y:202});
  expect(link[3]).toEqual({x:40,y:360});
  expect(link.strength).toBe(.5);
  expect(installLink([],hook,1)).toBeNull();
  expect(installLink([primary],hook,0)).toBeNull();
  expect(installLink([primary,{...satellite,y:300}],hook,1)![0].x).toBe(1020);
});
