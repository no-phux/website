// The synced brand tokens as build-time data (see token-css.ts).
import source from "../styles/brand-tokens.css?raw";
import { modeTokens, parseTokenCss, type Mode } from "./token-css";

export const tokenRules = parseTokenCss(source);

/** One token's value in a mode, for HTML attributes such as theme-color. */
export function brandToken(mode: Mode, name: string): string {
  const value = modeTokens(tokenRules, mode)[name];
  if (!value) throw new Error(`brand-tokens.css has no ${name} for ${mode}`);
  return value;
}

/** An opaque colour token as [r, g, b], for raster work such as the social cards. */
export function brandRgb(mode: Mode, name: string): [number, number, number] {
  const hex = brandToken(mode, name);
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`${name} for ${mode} is not an opaque #RRGGBB colour: ${hex}`);
  return [Number.parseInt(match[1]!, 16), Number.parseInt(match[2]!, 16), Number.parseInt(match[3]!, 16)];
}
