import { describe, expect, test } from "bun:test";
import { countLabel, formatPlural, statusWord } from "../src/lib/vocabulary";

describe("brand vocabulary", () => {
  test("status words come from the synced vocabulary", () => {
    expect(statusWord("needs_you")).toBe("needs you");
    expect(statusWord("failed")).toBe("failed");
  });

  test("counts are plural for 0, 1 and N", () => {
    expect(countLabel("count.needs_you", 0)).toBe("0 need you");
    expect(countLabel("count.needs_you", 1)).toBe("1 needs you");
    expect(countLabel("count.needs_you", 2)).toBe("2 need you");
    expect(countLabel("count.done", 1200)).toBe("1,200 done");
  });

  test("exact matches win over categories", () => {
    expect(formatPlural("{count, plural, =0 {none} one {# item} other {# items}}", 0)).toBe("none");
    expect(formatPlural("{count, plural, =0 {none} one {# item} other {# items}}", 1)).toBe("1 item");
  });
});
