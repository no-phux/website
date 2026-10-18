import type { LiquidRect } from "./living";
import type { LightLink } from "./useLiquidLayout";

/** idle → engaged (attention reached the terminals) → drove (a terminal was opened and closed) → copied. */
export type HookMoment = "idle"|"engaged"|"drove"|"copied";

/** The lede only claims what the visitor actually did. */
export function hookLede(moment:HookMoment,live=true) {
  if(moment==="drove")return "You just drove a real phux session. Keep one on your machine.";
  if(moment==="copied")return "Copied. One paste away.";
  return live?"Those are real terminals, running live. Yours in one line.":"Terminals that outlive the window. Yours in one line.";
}
export function copiedNote(target:"cli"|"desktop",preview:boolean) {
  if(preview)return "Paste it into any terminal. It prints the plan and installs nothing.";
  return target==="desktop"?"Paste it into Terminal. Phux.app opens when it’s done.":"Paste it into any terminal, then run phux.";
}
/** Moments only advance: a later hover never takes back a drive or a copy. */
export function advanceMoment(current:HookMoment,next:HookMoment):HookMoment {
  const order:HookMoment[]=["idle","engaged","drove","copied"];
  return order.indexOf(next)>order.indexOf(current)?next:current;
}
/** Light leaves the lowest terminal and lands on the install line: the pitch, drawn. */
export function installLink(panes:LiquidRect[],hook:LiquidRect,strength:number):LightLink|null {
  const from=panes.reduce<LiquidRect|null>((low,rect)=>!low||rect.y+rect.height>low.y+low.height?rect:low,null);
  if(!from||strength<=.01||hook.width<=0)return null;
  const a={x:from.x+from.width/2,y:from.y+from.height-18};
  const d={x:hook.x+Math.min(40,hook.width*.08),y:hook.y+hook.height/2};
  const bend=Math.max(36,Math.abs(d.y-a.y)*.6);
  const link=[a,{x:a.x,y:a.y+bend},{x:d.x-bend,y:d.y},d] as LightLink;
  link.strength=Math.min(1,strength);
  return link;
}
