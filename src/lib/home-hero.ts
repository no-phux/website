export type HomeHero = "light" | "classic";

/**
 * The classic hero is the front door: one command, one real terminal, no
 * frame. The live workspace remains one link away (`?hero=light`) for people
 * who want the interactive tour.
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
