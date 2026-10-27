import { describe, expect, test } from "bun:test";
import { gazeBlend, gazeOffset } from "../src/components/fox/gaze";

describe("fox gaze", () => {
  test("looks straight ahead at rest", () => {
    expect(gazeOffset(0, 0)).toEqual({ x: 0, y: 0 });
  });
  test("follows the pointer without crossing the eye boundary", () => {
    for (const [x, y] of [[1, 0], [-5000, 800], [200, -9000], [100000, 100000]]) {
      const offset = gazeOffset(x, y);
      expect(Math.sign(offset.x)).toBe(Math.sign(x!));
      expect(Math.sign(offset.y)).toBe(Math.sign(y!));
      expect(Math.abs(offset.x)).toBeLessThan(3.2);
      expect(Math.abs(offset.y)).toBeLessThan(2.2);
    }
  });
  test("damping is frame-rate independent and caps long frames", () => {
    expect(1 - (1 - gazeBlend(8)) ** 2).toBeCloseTo(gazeBlend(16), 10);
    expect(gazeBlend(5000)).toBe(gazeBlend(50));
    expect(gazeBlend(0)).toBe(0);
  });
});
