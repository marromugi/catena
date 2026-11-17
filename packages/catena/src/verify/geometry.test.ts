import { describe, expect, test } from "vitest";
import { runsAlongside } from "./geometry";

describe("runsAlongside", () => {
  test("leaves a segment on the border of a box thinner than the clearance to the caller", () => {
    const onBorder = { from: { x: 1, y: 0 }, to: { x: 9, y: 0 } };

    expect(runsAlongside(onBorder, { x: 0, y: 0, width: 10, height: 0.3 }, 0.5)).toBe(false);
  });
});
