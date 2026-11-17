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
