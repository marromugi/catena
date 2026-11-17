import { expect, test } from "vitest";
import { arc, curve, quarter } from "./shape";

test("an arc is drawn as the quarters the other shapes draw, either way round", () => {
  const right = [22, 12] as const;
  const bottom = [12, 22] as const;
  const left = [2, 12] as const;
  expect(curve(right, ...arc([12, 12], 10, 0, 180))).toBe(
    curve(right, quarter(right, [22, 22], bottom), quarter(bottom, [2, 22], left)),
  );
  expect(curve(left, ...arc([12, 12], 10, 180, 90))).toBe(
    curve(left, quarter(left, [2, 22], bottom)),
  );
});
