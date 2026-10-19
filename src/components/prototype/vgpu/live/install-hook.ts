/** idle → engaged → drove → copied; later attention never takes back a completed action. */
export type HookMoment = "idle"|"engaged"|"drove"|"copied";

export function advanceMoment(current:HookMoment,next:HookMoment):HookMoment {
  const order:HookMoment[]=["idle","engaged","drove","copied"];
  return order.indexOf(next)>order.indexOf(current)?next:current;
}
