import { expect, test } from "bun:test";
import { emailScrollDelta } from "../src/lib/email-viewport";

test("leaves a fully visible form still", () => {
  expect(emailScrollDelta(100, 260, 0, 400)).toBe(0);
});
test("moves a keyboard-obscured form into the visual viewport", () => {
  const delta = emailScrollDelta(400, 600, 50, 350);
  expect(400 - delta).toBeGreaterThanOrEqual(70);
  expect(600 - delta).toBeLessThanOrEqual(380);
});
test("a tall form starts above the keyboard rather than scrolling its field out of sight", () => {
  expect(emailScrollDelta(500, 1000, 0, 300)).toBe(480);
});
