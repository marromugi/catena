import { describe, expect, test } from "vitest";
import type { PlacedEdge, Point } from "../layout";
import { writeSvg } from "../node";
import { DEFAULT_EDGE_RADIUS, drawEdge } from "./index";

const edgeAlong = (...points: [Point, Point, ...Point[]]): PlacedEdge => ({
  id: "e",
  from: "a",
  to: "b",
  points,
  labels: [],
});

const pathOf = (edge: PlacedEdge, radius?: number) =>
  writeSvg(drawEdge(edge, radius === undefined ? {} : { radius }));

describe("drawEdge", () => {
  const corner = edgeAlong({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 });

  test("rounds a bend by the default radius when none is given", () => {
    expect(DEFAULT_EDGE_RADIUS).toBe(8);
    expect(pathOf(corner)).toBe('<path d="M 0 0 L 92 0 A 8 8 0 0 1 100 8 L 100 50" fill="none"/>');
  });

  test("rounds a bend by the radius given", () => {
    expect(pathOf(corner, 20)).toBe(
      '<path d="M 0 0 L 80 0 A 20 20 0 0 1 100 20 L 100 50" fill="none"/>',
    );
  });

  test("draws sharp bends for a radius of 0", () => {
    expect(pathOf(corner, 0)).toBe('<path d="M 0 0 L 100 0 L 100 50" fill="none"/>');
  });

  test("gives each bend at most half of a stretch between two bends", () => {
    const step = edgeAlong({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }, { x: 200, y: 10 });
    expect(pathOf(step)).toBe(
      '<path d="M 0 0 L 95 0 A 5 5 0 0 1 100 5 A 5 5 0 0 0 105 10 L 200 10" fill="none"/>',
    );
  });

  test("gives a bend all of a stretch at an end", () => {
    const short = edgeAlong({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 50 });
    expect(pathOf(short)).toBe('<path d="M 0 0 A 3 3 0 0 1 3 3 L 3 50" fill="none"/>');
    const lastStretchShorter = edgeAlong({ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 });
    expect(pathOf(lastStretchShorter)).toBe('<path d="M 0 0 L 2 0 A 4 4 0 0 1 6 4" fill="none"/>');
  });

  test("goes straight through a point that is not a bend", () => {
    const straight = edgeAlong({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 0 }, { x: 100, y: 0 });
    expect(pathOf(straight)).toBe('<path d="M 0 0 L 100 0" fill="none"/>');
  });

  test("refuses a negative radius", () => {
    expect(() => drawEdge(corner, { radius: -1 })).toThrow(RangeError);
  });
});
