export type HomeHero = "light" | "classic";

/**
 * Legacy homepage link intent. The default now shows the lightweight client
 * comparison; `?hero=light` scrolls to the lazy inline workspace. An OAuth
 * return always stays with its terminal dialog instead of scrolling there.
 */
export function homeHero(search:string,nativeAuthResult?:string,initialView?:string):HomeHero {
  if(initialView==="classic")return "classic";
  if(nativeAuthResult==="success"||nativeAuthResult==="error")return "classic";
  return new URLSearchParams(search).get("hero")==="light"?"light":"classic";
}

export function heroSearch(search:string,hero:HomeHero) {
  const params=new URLSearchParams(search);
  if(hero==="light")params.set("hero","light");
  else params.delete("hero");
  const query=params.toString();
  return query?`?${query}`:"";
}
