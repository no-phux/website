// Status words and count plurals from phux (src/data/vocabulary.json, pinned in phux-design.lock.json).
// Never write a status word as an English literal; read it here.
import vocabulary from "../data/vocabulary.json";

export type StatusWord = keyof typeof vocabulary.words;
export type CountKey = keyof typeof vocabulary.plurals;

export function statusWord(tone: StatusWord): string {
  return vocabulary.words[tone];
}

/** Formats an ICU `{count, plural, one {…} other {…}}` message for `count`. */
export function formatPlural(message: string, count: number, locale = vocabulary.locale): string {
  const branches = new Map<string, string>();
  for (const [, category, text] of message.matchAll(/(\w+|=\d+)\s*\{([^{}]*)\}/g)) branches.set(category!, text!);
  const exact = branches.get(`=${count}`);
  const category = new Intl.PluralRules(locale).select(count);
  const template = exact ?? branches.get(category) ?? branches.get("other") ?? "";
  return template.replaceAll("#", new Intl.NumberFormat(locale).format(count));
}

export function countLabel(key: CountKey, count: number): string {
  return formatPlural(vocabulary.plurals[key], count);
}
