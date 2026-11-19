import * as fc from "fast-check";
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

  test("takes coordinates a few ulps apart as one, as placement leaves edges that share a line", () => {
    const off = 1e-12;
    const together = [
      edgeNamed("a", { x: 0, y: 50 }, { x: 40, y: 50 }, { x: 40, y: 0 }),
      edgeNamed("b", { x: 0, y: 50 + off }, { x: 40, y: 50 + off }, { x: 40, y: 0 }),
    ];
    expect(branchPoints(together)).toEqual([]);
    const noisyFan = [
      edgeNamed("ab", { x: 60, y: 0 }, { x: 60, y: 80 }, { x: 24, y: 80 }, { x: 24, y: 100 }),
      edgeNamed(
        "ac",
        { x: 60 + off, y: 0 },
        { x: 60 + off, y: 80 - off },
        { x: 32, y: 80 - off },
        { x: 32, y: 150 },
      ),
      edgeNamed("ad", { x: 60, y: 0 }, { x: 60, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 200 }),
    ];
    expect(branchPoints(noisyFan).map(({ edges }) => edges)).toEqual([["ac"], ["ad"]]);
  });

  test("finds the points on edges as placement lays them, their shared lines a few ulps apart", () => {
    const parting = [
      edgeNamed(
        "n0",
        { x: 508.75149999999996, y: 84.55 },
        { x: 508.75149999999996, y: 100.55 },
        { x: 472.501, y: 100.55 },
      ),
      edgeNamed(
        "n1",
        { x: 508.7515, y: 84.55 },
        { x: 508.7515, y: 92.55 },
        { x: 472.501, y: 92.55 },
      ),
    ];
    expect(branchPoints(parting).map(({ edges }) => edges)).toEqual([["n1"]]);
    const split = [
      edgeNamed(
        "n3",
        { x: 176, y: 240.65550000000002 },
        { x: 184, y: 240.65550000000002 },
        { x: 184, y: 209.3155 },
      ),
      edgeNamed("n0", { x: 176, y: 240.6555 }, { x: 184, y: 240.6555 }, { x: 184, y: 263.9955 }),
    ];
    expect(branchPoints(split).map(({ edges }) => edges)).toEqual([["n3", "n0"]]);
  });

  test("finds a point only between edges out of one node or into one node", () => {
    const bending = {
      ...edgeNamed("a", { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }),
      from: "p",
      to: "q",
    };
    const straight = edgeNamed("b", { x: 0, y: 0 }, { x: 80, y: 0 });
    expect(branchPoints([bending, { ...straight, from: "r", to: "s" }])).toEqual([]);
    expect(branchPoints([bending, { ...straight, from: "p", to: "s" }])).toHaveLength(1);
    expect(branchPoints([bending, { ...straight, from: "r", to: "q" }])).toHaveLength(1);
  });

  test("takes no stretch that is neither horizontal nor vertical as running along another", () => {
    const bend = edgeNamed("e", { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 });
    const slants = [
      [
        { x: 0, y: 0 },
        { x: 80, y: 40 },
      ],
      [
        { x: 80, y: 40 },
        { x: 0, y: 0 },
      ],
      [
        { x: 40, y: -10 },
        { x: 80, y: 40 },
      ],
      [
        { x: 80, y: 40 },
        { x: 40, y: -10 },
      ],
    ] as const;
    for (const [start, end] of slants) {
      expect(branchPoints([bend, edgeNamed("s", start, end)])).toEqual([]);
    }
    const slanting = edgeNamed("e", { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 80, y: 40 });
    expect(branchPoints([slanting, edgeNamed("v", { x: 40, y: 0 }, { x: 40, y: 40 })])).toEqual([]);
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

const params = { seed: 118, numRuns: 100 };
const key = ({ x, y }: Point) => `${x},${y}`;
const grid = fc.constantFrom(0, 10, 20, 30);
const isPath = (points: Point[]): points is [Point, Point, ...Point[]] => points.length >= 2;
/** Stretches across and down by turns on a coarse grid, so that edges overlap. */
const bentPath = fc
  .tuple(
    fc.record({ x: grid, y: grid }),
    fc.boolean(),
    fc.array(grid, { minLength: 1, maxLength: 5 }),
  )
  .map(([start, acrossFirst, targets]) => {
    const points: Point[] = [start];
    let across = acrossFirst;
    for (const target of targets) {
      const last = points.at(-1) ?? start;
      const next = across ? { x: target, y: last.y } : { x: last.x, y: target };
      if (key(next) === key(last)) continue;
      points.push(next);
      across = !across;
    }
    return points;
  })
  .filter(isPath);
const ends = fc.constantFrom("a", "b", "c");
const edgeSets = fc.array(fc.tuple(bentPath, ends, ends), { maxLength: 6 }).map((drawn) =>
  drawn.map(([points, from, to], index): PlacedEdge => ({
    id: `e${index}`,
    from,
    to,
    points,
    labels: [],
  })),
);
const withPoints = (edge: PlacedEdge, points: Point[]): PlacedEdge =>
  isPath(points) ? { ...edge, points } : edge;
/** Each point with its sorted ids, sorted. */
const found = (edges: readonly PlacedEdge[]) =>
  branchPoints(edges)
    .map(({ point, edges: ids }) => `${key(point)}:${ids.toSorted().join()}`)
    .toSorted();
/** Where a stretch across meets one down. */
const bendsOf = (points: readonly Point[]) =>
  new Set(
    points
      .slice(1, -1)
      .filter((point, index) => {
        const before = points[index];
        const after = points[index + 2];
        return (
          before !== undefined &&
          after !== undefined &&
          (before.x === point.x) !== (after.x === point.x)
        );
      })
      .map(key),
  );

describe("branchPoints on generated edges", () => {
  test("gives each point once, a bend of each edge it lists, each edge once", () => {
    fc.assert(
      fc.property(edgeSets, (edges) => {
        const points = branchPoints(edges);
        expect(new Set(points.map(({ point }) => key(point))).size).toBe(points.length);
        for (const { point, edges: ids } of points) {
          expect(new Set(ids).size).toBe(ids.length);
          for (const id of ids) {
            const edge = edges.find((each) => each.id === id);
            expect(edge === undefined ? false : bendsOf(edge.points).has(key(point))).toBe(true);
          }
        }
      }),
      params,
    );
  });

  test("gives the same points whatever the order of the edges or the way each is walked", () => {
    fc.assert(
      fc.property(edgeSets, (edges) => {
        expect(found(edges.toReversed())).toEqual(found(edges));
        const walkedBack = edges.map((edge) => withPoints(edge, edge.points.toReversed()));
        expect(found(walkedBack)).toEqual(found(edges));
      }),
      params,
    );
  });

  test("gives the same points with repeated points and points a stretch goes straight through added", () => {
    fc.assert(
      fc.property(
        edgeSets,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        (edges, flags) => {
          const flag = (index: number) => flags[index % flags.length] ?? false;
          const padded = edges.map((edge) =>
            withPoints(
              edge,
              edge.points.flatMap((point, index) => {
                const next = edge.points[index + 1];
                const middle =
                  next !== undefined && flag(index + 1)
                    ? [{ x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }]
                    : [];
                return [point, ...(flag(index) ? [{ ...point }] : []), ...middle];
              }),
            ),
          );
          expect(found(padded)).toEqual(found(edges));
        },
      ),
      params,
    );
  });

  test("gives n - 1 points for a fan out or a fan in of n edges laid as a comb", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 200 }), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 1, max: 100 }),
        fc.boolean(),
        (xs, trunk, fanIn) => {
          const edges = xs.map((x, index): PlacedEdge => {
            const out: [Point, Point, Point, Point] = [
              { x: 0, y: 0 },
              { x: 0, y: trunk },
              { x, y: trunk },
              { x, y: trunk + 10 + index },
            ];
            return {
              id: `e${index}`,
              from: fanIn ? `n${index}` : "hub",
              to: fanIn ? "hub" : `n${index}`,
              points: fanIn ? [out[3], out[2], out[1], out[0]] : out,
              labels: [],
            };
          });
          expect(branchPoints(edges)).toHaveLength(xs.length - 1);
        },
      ),
      params,
    );
  });
});
