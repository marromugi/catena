import { describe, expect, test } from "vitest";
import type { PlacedEdge, Point } from "../layout";
import { writeSvg } from "../svg";
import { DEFAULT_EDGE_RADIUS, EDGE_DOT_RADIUS, branchPoints, drawEdge, drawEdgeDot } from "./index";

const edgeAlong = (...points: [Point, Point, ...Point[]]): PlacedEdge => ({
  id: "e",
  from: "a",
  to: "b",
  points,
  labels: [],
});

const edgeNamed = (id: string, ...points: [Point, Point, ...Point[]]): PlacedEdge => ({
  ...edgeAlong(...points),
  id,
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
    const step = edgeAlong(
      { x: 0, y: 20 },
      { x: 100, y: 20 },
      { x: 100, y: 30 },
      { x: 200, y: 30 },
    );
    expect(pathOf(step)).toBe(
      '<path d="M 0 20 L 95 20 A 5 5 0 0 1 100 25 A 5 5 0 0 0 105 30 L 200 30" fill="none"/>',
    );
    const hook = edgeAlong(
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 0, y: 30 },
      { x: 0, y: 60 },
    );
    expect(pathOf(hook)).toBe(
      '<path d="M 0 0 L 32 0 A 8 8 0 0 1 40 8 L 40 22 A 8 8 0 0 1 32 30 L 8 30 A 8 8 0 0 0 0 38 L 0 60" fill="none"/>',
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

  test("turns each way at bends away from the origin", () => {
    const upThenRight = edgeAlong({ x: 10, y: 50 }, { x: 10, y: 20 }, { x: 60, y: 20 });
    expect(pathOf(upThenRight)).toBe(
      '<path d="M 10 50 L 10 28 A 8 8 0 0 1 18 20 L 60 20" fill="none"/>',
    );
    const leftThenDown = edgeAlong({ x: 60, y: 20 }, { x: 10, y: 20 }, { x: 10, y: 50 });
    expect(pathOf(leftThenDown)).toBe(
      '<path d="M 60 20 L 18 20 A 8 8 0 0 0 10 28 L 10 50" fill="none"/>',
    );
  });

  test("draws sharp a bend that is not between a horizontal and a vertical stretch", () => {
    const slanted = edgeAlong({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 100 });
    expect(pathOf(slanted)).toBe('<path d="M 0 0 L 100 0 L 200 100" fill="none"/>');
    const diagonal = edgeAlong({ x: 0, y: 0 }, { x: 3, y: 1 }, { x: 9, y: 3 }, { x: 9, y: 50 });
    expect(pathOf(diagonal)).toBe('<path d="M 0 0 L 3 1 L 9 3 L 9 50" fill="none"/>');
    const peak = edgeAlong({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 });
    expect(pathOf(peak)).toBe('<path d="M 0 0 L 10 10 L 20 0" fill="none"/>');
  });

  test("draws sharp a point where the path turns back on itself", () => {
    const back = edgeAlong({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 });
    expect(pathOf(back)).toBe('<path d="M 0 0 L 100 0 L 50 0" fill="none"/>');
  });

  test("goes straight through a point on a vertical stretch", () => {
    const down = edgeAlong({ x: 5, y: 10 }, { x: 5, y: 30 }, { x: 5, y: 60 });
    expect(pathOf(down)).toBe('<path d="M 5 10 L 5 60" fill="none"/>');
  });

  test("drops a repeated point at an end", () => {
    const repeated = edgeAlong(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 100, y: 50 },
    );
    expect(pathOf(repeated)).toBe(pathOf(corner));
    const repeatedAtBend = edgeAlong(
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    );
    expect(pathOf(repeatedAtBend)).toBe(pathOf(corner));
    expect(pathOf(edgeAlong({ x: 1, y: 1 }, { x: 1, y: 1 }))).toBe('<path d="M 1 1" fill="none"/>');
  });

  test("refuses a negative radius or none at all", () => {
    expect(() => drawEdge(corner, { radius: -1 })).toThrow(RangeError);
    expect(() => drawEdge(corner, { radius: Number.NaN })).toThrow(RangeError);
  });
});

describe("drawEdgeDot", () => {
  test("centres an unpainted circle 4 round on the point", () => {
    expect(EDGE_DOT_RADIUS).toBe(4);
    expect(writeSvg(drawEdgeDot({ x: 10, y: 0.5 }))).toBe('<circle cx="10" cy="0.5" r="4"/>');
  });
});

describe("branchPoints", () => {
  // Down from (60, 0) to (60, 80), then left along y = 80, each turning down at its own x.
  const fanOut = [
    edgeNamed("ab", { x: 60, y: 0 }, { x: 60, y: 80 }, { x: 24, y: 80 }, { x: 24, y: 100 }),
    edgeNamed("ac", { x: 60, y: 0 }, { x: 60, y: 80 }, { x: 32, y: 80 }, { x: 32, y: 150 }),
    edgeNamed("ad", { x: 60, y: 0 }, { x: 60, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 200 }),
  ];

  test("finds where each edge of a fan out leaves the stretch the others carry on along, n - 1 points", () => {
    expect(branchPoints(fanOut)).toEqual([
      { point: { x: 32, y: 80 }, edges: ["ac"] },
      { point: { x: 40, y: 80 }, edges: ["ad"] },
    ]);
  });

  test("finds where each edge of a fan in joins the stretch the others carry on along", () => {
    const fanIn = [
      edgeNamed("bz", { x: 0, y: 80 }, { x: 300, y: 80 }, { x: 300, y: 60 }, { x: 340, y: 60 }),
      edgeNamed("cz", { x: 0, y: 90 }, { x: 300, y: 90 }, { x: 300, y: 60 }, { x: 340, y: 60 }),
      edgeNamed("dz", { x: 0, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 60 }, { x: 340, y: 60 }),
    ];
    expect(branchPoints(fanIn)).toEqual([
      { point: { x: 300, y: 80 }, edges: ["bz"] },
      { point: { x: 300, y: 90 }, edges: ["cz"] },
    ]);
  });

  test("gives a point once, with every edge that bends there, when the edges part in two ways", () => {
    const split = [
      edgeNamed("up", { x: 0, y: 50 }, { x: 40, y: 50 }, { x: 40, y: 0 }),
      edgeNamed("down", { x: 0, y: 50 }, { x: 40, y: 50 }, { x: 40, y: 100 }),
    ];
    expect(branchPoints(split)).toEqual([{ point: { x: 40, y: 50 }, edges: ["up", "down"] }]);
  });

  test("finds none where edges bend together, or where another edge ends on a bend", () => {
    const together = [
      edgeNamed("a", { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }),
      edgeNamed("b", { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }),
    ];
    const endingOnBend = [
      edgeNamed("a", { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }),
      edgeNamed("b", { x: 40, y: -40 }, { x: 40, y: 0 }),
    ];
    expect(branchPoints(together)).toEqual([]);
    expect(branchPoints(endingOnBend)).toEqual([]);
    expect(branchPoints([])).toEqual([]);
  });

  test("reads an edge by its bends, past repeated points and points a stretch goes straight through", () => {
    const padded = edgeNamed(
      "ad",
      { x: 60, y: 0 },
      { x: 60, y: 40 },
      { x: 60, y: 80 },
      { x: 50, y: 80 },
      { x: 40, y: 80 },
      { x: 40, y: 80 },
      { x: 40, y: 200 },
    );
    expect(branchPoints([...fanOut.slice(0, 2), padded])).toEqual(branchPoints(fanOut));
  });
});
