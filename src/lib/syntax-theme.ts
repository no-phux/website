// Shiki theme for documentation code blocks. Every colour is a brand syntax role
// (`syntax.*`, the house terminal's ANSI slots solved for contrast), so code
// follows the reader's mode and increased contrast through
// src/styles/brand-tokens.css, and never borrows a status tone.
// Slots: 1 red, 2 green, 3 yellow, 4 blue, 5 magenta, 6 cyan, 7 white, 8 grey.
const syntax = (slot: number) => `var(--phux-syntax-${slot})`;

const rules: [string[], string, string?][] = [
  [["comment", "punctuation.definition.comment", "string.comment"], syntax(8)],
  [["keyword", "storage", "storage.type", "storage.modifier", "keyword.control", "keyword.operator.new", "keyword.operator.expression"], syntax(5)],
  [["string", "string.quoted", "string.template", "markup.inline.raw", "markup.raw"], syntax(2)],
  [["constant", "constant.numeric", "constant.language", "constant.character", "support.constant", "variable.other.constant", "variable.other.enummember"], syntax(3)],
  [["entity.name.function", "support.function", "meta.function-call", "entity.name.command"], syntax(4)],
  [["entity.name.type", "entity.name.class", "entity.name.namespace", "support.type", "support.class", "entity.other.inherited-class"], syntax(6)],
  [["entity.name.tag", "variable.parameter", "variable.other.readwrite.shell", "punctuation.definition.variable", "markup.heading"], syntax(1)],
  [["entity.other.attribute-name", "support.type.property-name", "meta.object-literal.key", "variable.other.property"], syntax(12)],
  [["punctuation", "meta.brace", "keyword.operator"], syntax(7)],
  [["markup.inserted", "punctuation.definition.inserted"], "var(--phux-diff-add-text)"],
  [["markup.deleted", "punctuation.definition.deleted"], "var(--phux-diff-remove-text)"],
  [["invalid", "invalid.illegal"], "var(--phux-status-failed)"],
];

export const phuxSyntaxTheme = {
  name: "phux-syntax",
  type: "dark" as const,
  colors: {
    "editor.foreground": "var(--phux-text-text)",
    "editor.background": "var(--phux-layer-raised)",
  },
  fg: "var(--phux-text-text)",
  bg: "var(--phux-layer-raised)",
  tokenColors: rules.map(([scope, foreground, fontStyle]) => ({
    scope,
    settings: fontStyle ? { foreground, fontStyle } : { foreground },
  })),
};
