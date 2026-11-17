import { describe, expect, test } from "vitest";
import type { Layout, PlacedEdge, PlacedNode, Point } from "../layout";
import { verify } from "./index";

const spacing = { nodeGap: 20, padding: 10, edgeToNode: 5, edgeGap: 5, minSegment: 8 };

const node = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  children: PlacedNode[] = [],
): PlacedNode => ({ id, box: { x, y, width, height }, children });

const edge = (
  id: string,
  from: string,
  to: string,
  path: [number, number][],
  labels: [number, number, number, number][] = [],
): PlacedEdge => {
  const [first, second, ...rest] = path.map(([x, y]): Point => ({ x, y }));
  if (first === undefined || second === undefined) {
    throw new Error("An edge in a test needs two points.");
  }
  return {
    id,
    from,
    to,
    points: [first, second, ...rest],
    labels: labels.map(([x, y, width, height]) => ({ box: { x, y, width, height } })),
  };
};

const layout = (nodes: PlacedNode[], edges: PlacedEdge[] = []): Layout => ({
  width: 300,
  height: 200,
  nodes,
  edges,
});

// A group G holding A above B, and C outside it to the right.
const a = node("A", 20, 20, 50, 30);
const b = node("B", 20, 120, 50, 30);
const group = node("G", 10, 10, 130, 180, [a, b]);
const c = node("C", 200, 120, 60, 30);
const insideGroup = (path: [number, number][]) => layout([group, c], [edge("A-B", "A", "B", path)]);
const outOfGroup = (path: [number, number][]) => layout([group, c], [edge("A-C", "A", "C", path)]);

describe("verify: a sound layout", () => {
  test("has no violations", () => {
    const sound = layout(
      [group, c],
      [
        edge(
          "A-B",
          "A",
          "B",
          [
            [45, 50],
            [45, 120],
          ],
          [[40, 80, 10, 10]],
        ),
        edge(
          "A-C",
          "A",
          "C",
          [
            [70, 35],
            [170, 35],
            [170, 135],
            [200, 135],
          ],
          [[160, 80, 20, 10]],
        ),
      ],
    );

    expect(verify(sound, spacing)).toEqual([]);
  });

  test("lets two edges cross at a right angle", () => {
    const left = node("L", 0, 80, 20, 40);
    const right = node("R", 280, 80, 20, 40);
    const top = node("T", 130, 0, 40, 20);
    const bottom = node("B", 130, 180, 40, 20);
    const crossing = layout(
      [left, right, top, bottom],
      [
        edge("L-R", "L", "R", [
          [20, 100],
          [280, 100],
        ]),
        edge("T-B", "T", "B", [
          [150, 20],
          [150, 180],
        ]),
      ],
    );

    expect(verify(crossing, spacing)).toEqual([]);
  });

  test("lets an edge loop back to the node it left", () => {
    const loop = layout(
      [node("A", 100, 100, 50, 30)],
      [
        edge("A-A", "A", "A", [
          [150, 110],
          [170, 110],
          [170, 80],
          [125, 80],
          [125, 100],
        ]),
      ],
    );

    expect(verify(loop, spacing)).toEqual([]);
  });
});

describe("verify: nodes", () => {
  test("reports two nodes closer than the node gap", () => {
    const close = layout([node("A", 0, 0, 50, 30), node("B", 69, 0, 50, 30)]);

    expect(verify(close, spacing)).toEqual([{ kind: "nodes-overlap", nodes: ["A", "B"] }]);
  });

  test("accepts two nodes exactly the node gap apart, sideways or up and down", () => {
    const apart = layout([
      node("A", 0, 0, 50, 30),
      node("B", 70, 0, 50, 30),
      node("C", 0, 50, 50, 30),
    ]);

    expect(verify(apart, spacing)).toEqual([]);
  });

  test("reports two nodes inside one group that are too close", () => {
    const crowded = layout([
      node("G", 0, 0, 200, 100, [node("A", 10, 10, 50, 30), node("B", 70, 10, 50, 30)]),
    ]);

    expect(verify(crowded, spacing)).toEqual([{ kind: "nodes-overlap", nodes: ["A", "B"] }]);
  });

  test("reports a node closer to its group's border than the padding", () => {
    const tight = layout([node("G", 0, 0, 200, 100, [node("A", 9, 10, 50, 30)])]);

    expect(verify(tight, spacing)).toEqual([
      { kind: "node-outside-parent", node: "A", parent: "G" },
    ]);
  });

  test.each([
    ["left", -1, 0],
    ["top", 0, -1],
    ["right", 251, 0],
    ["bottom", 0, 171],
  ])("reports a node past the %s of the canvas", (_, x, y) => {
    expect(verify(layout([node("A", x, y, 50, 30)]), spacing)).toEqual([
      { kind: "node-outside-canvas", node: "A" },
    ]);
  });

  test("refuses a layout with two nodes of one id", () => {
    const twice = layout([node("A", 0, 0, 50, 30), node("G", 100, 0, 100, 100, [a])]);

    expect(() => verify(twice, spacing)).toThrow('two nodes with the id "A"');
  });
});

describe("verify: where an edge ends", () => {
  const left = node("L", 0, 80, 50, 40);
  const right = node("R", 250, 80, 50, 40);
  const between = (path: [number, number][]) =>
    layout([left, right], [edge("L-R", "L", "R", path)]);

  test("reports an edge that starts off its node's border", () => {
    const loose = between([
      [51, 100],
      [250, 100],
    ]);

    expect(verify(loose, spacing)).toEqual([
      { kind: "edge-not-attached", edge: "L-R", end: "from" },
    ]);
  });

  test("reports an edge that stops short of its node's border", () => {
    const loose = between([
      [50, 100],
      [249, 100],
    ]);

    expect(verify(loose, spacing)).toEqual([{ kind: "edge-not-attached", edge: "L-R", end: "to" }]);
  });

  test("reports an edge that ends beside its node, level with a border", () => {
    const beside = between([
      [50, 100],
      [150, 100],
      [150, 60],
      [250, 60],
    ]);

    expect(verify(beside, spacing)).toEqual([
      { kind: "edge-not-attached", edge: "L-R", end: "to" },
    ]);
  });

  test("reports an edge that leaves a corner along the line of a side", () => {
    const level = layout(
      [node("L", 0, 80, 50, 40), node("R", 250, 80, 50, 40)],
      [
        edge("L-R", "L", "R", [
          [50, 80],
          [250, 80],
        ]),
      ],
    );

    expect(verify(level, spacing)).toEqual([
      { kind: "edge-not-attached", edge: "L-R", end: "from" },
      { kind: "edge-not-attached", edge: "L-R", end: "to" },
    ]);
  });

  test("reports an edge that meets a side exactly at its corner", () => {
    const corner = between([
      [50, 120],
      [250, 120],
    ]);

    expect(verify(corner, spacing)).toEqual([
      { kind: "edge-not-attached", edge: "L-R", end: "from" },
      { kind: "edge-not-attached", edge: "L-R", end: "to" },
    ]);
  });

  test("refuses an edge to a node that is not there", () => {
    const dangling = layout(
      [left],
      [
        edge("L-X", "L", "X", [
          [50, 100],
          [250, 100],
        ]),
      ],
    );

    expect(() => verify(dangling, spacing)).toThrow('connects "X"');
  });
});

describe("verify: the shape of an edge", () => {
  const left = node("L", 0, 0, 50, 40);
  const right = node("R", 250, 150, 50, 40);
  const between = (path: [number, number][]) =>
    layout([left, right], [edge("L-R", "L", "R", path)]);

  test("reports a slanted stretch, and checks that edge no further", () => {
    const slanted = layout(
      [left, right, node("M", 130, 80, 40, 30)],
      [
        edge("L-R", "L", "R", [
          [50, 20],
          [250, 170],
        ]),
      ],
    );

    expect(verify(slanted, spacing)).toEqual([
      { kind: "edge-not-orthogonal", edge: "L-R", segment: 0 },
    ]);
  });

  test("reports a stretch shorter than the shortest allowed", () => {
    const cramped = between([
      [50, 20],
      [150, 20],
      [150, 27],
      [200, 27],
      [200, 170],
      [250, 170],
    ]);

    expect(verify(cramped, spacing)).toEqual([
      { kind: "edge-segment-too-short", edge: "L-R", segment: 1 },
    ]);
  });

  test("accepts a stretch of exactly the shortest allowed", () => {
    const snug = between([
      [50, 20],
      [150, 20],
      [150, 28],
      [200, 28],
      [200, 170],
      [250, 170],
    ]);

    expect(verify(snug, spacing)).toEqual([]);
  });

  test("reports an edge with a bend outside the canvas", () => {
    const wide = between([
      [25, 0],
      [25, -10],
      [275, -10],
      [275, 150],
    ]);

    expect(verify(wide, spacing)).toEqual([{ kind: "edge-outside-canvas", edge: "L-R" }]);
  });
});

describe("verify: an edge and the nodes in its way", () => {
  const left = node("L", 0, 80, 50, 40);
  const right = node("R", 250, 80, 50, 40);
  const straight = edge("L-R", "L", "R", [
    [50, 100],
    [250, 100],
  ]);
  const through = [{ kind: "edge-through-node", edge: "L-R", node: "M" }];

  test("reports an edge through a node it does not connect", () => {
    const blocked = layout([left, right, node("M", 130, 85, 40, 30)], [straight]);

    expect(verify(blocked, spacing)).toEqual(through);
  });

  test("reports an edge that passes a node closer than the clearance", () => {
    const grazing = layout([left, right, node("M", 130, 104, 40, 30)], [straight]);

    expect(verify(grazing, spacing)).toEqual(through);
  });

  test("accepts an edge that passes a node at exactly the clearance", () => {
    const clear = layout([left, right, node("M", 130, 105, 40, 30)], [straight]);

    expect(verify(clear, spacing)).toEqual([]);
  });

  test("reports an edge through a group it does not connect", () => {
    const inner = node("I", 140, 90, 20, 20);
    const blocked = layout([left, right, node("M", 120, 70, 60, 60, [inner])], [straight]);

    expect(verify(blocked, spacing)).toEqual([
      ...through,
      { kind: "edge-through-node", edge: "L-R", node: "I" },
    ]);
  });

  test("reports an edge that runs into the node it starts from", () => {
    const inward = layout(
      [left, right],
      [
        edge("L-R", "L", "R", [
          [0, 100],
          [250, 100],
        ]),
      ],
    );

    expect(verify(inward, spacing)).toEqual([
      { kind: "edge-through-node", edge: "L-R", node: "L" },
    ]);
  });

  test("reports an edge that runs along the border of the node it ends at", () => {
    const along = layout(
      [left, node("R", 220, 80, 50, 40)],
      [
        edge("L-R", "L", "R", [
          [50, 100],
          [150, 100],
          [150, 120],
          [285, 120],
          [285, 100],
          [270, 100],
        ]),
      ],
    );

    expect(verify(along, spacing)).toEqual([{ kind: "edge-through-node", edge: "L-R", node: "R" }]);
  });

  test("reports an edge that runs along the border of a node it does not connect, whatever the clearance", () => {
    const resting = layout([left, right, node("M", 130, 100, 40, 30)], [straight]);

    expect(verify(resting, { ...spacing, edgeToNode: 0 })).toEqual(through);
  });

  test("reports an edge that leaves its node closer to a corner than the clearance", () => {
    const tall = node("R", 250, 60, 50, 80);
    const cornered = layout(
      [left, tall],
      [
        edge("L-R", "L", "R", [
          [50, 82],
          [250, 82],
        ]),
      ],
    );

    expect(verify(cornered, spacing)).toEqual([
      { kind: "edge-through-node", edge: "L-R", node: "L" },
    ]);
  });

  test("reports an edge that turns to run beside its own nodes closer than the clearance", () => {
    const beside = layout(
      [node("A", 100, 100, 50, 30), node("C", 220, 100, 50, 30)],
      [
        edge("A-C", "A", "C", [
          [110, 100],
          [110, 98],
          [245, 98],
          [245, 100],
        ]),
      ],
    );

    expect(verify(beside, { ...spacing, minSegment: 2 })).toEqual([
      { kind: "edge-through-node", edge: "A-C", node: "A" },
      { kind: "edge-through-node", edge: "A-C", node: "C" },
    ]);
  });
});

describe("verify: an edge and the groups around its ends", () => {
  test("reports an edge between two nodes of a group that leaves the group", () => {
    const outing = insideGroup([
      [70, 35],
      [160, 35],
      [160, 135],
      [70, 135],
    ]);

    expect(verify(outing, spacing)).toEqual([
      { kind: "edge-leaves-group", edge: "A-B", group: "G" },
    ]);
  });

  test("reports an edge that leaves a group, comes back, and leaves again", () => {
    const wandering = outOfGroup([
      [70, 35],
      [160, 35],
      [160, 70],
      [100, 70],
      [100, 100],
      [170, 100],
      [170, 135],
      [200, 135],
    ]);

    expect(verify(wandering, spacing)).toEqual([
      { kind: "edge-miscrosses-group", edge: "A-C", group: "G" },
    ]);
  });

  test("reports an edge that runs along the border of the group it leaves", () => {
    const along = outOfGroup([
      [70, 35],
      [140, 35],
      [140, 100],
      [170, 100],
      [170, 135],
      [200, 135],
    ]);

    expect(verify(along, spacing)).toEqual([
      { kind: "edge-miscrosses-group", edge: "A-C", group: "G" },
    ]);
  });

  test("reads an edge into a group the same way as one out of it", () => {
    const inbound = layout(
      [group, c],
      [
        edge("C-A", "C", "A", [
          [200, 135],
          [170, 135],
          [170, 35],
          [70, 35],
        ]),
      ],
    );

    expect(verify(inbound, spacing)).toEqual([]);
  });

  test("reports an edge from a group to a node inside it", () => {
    const inward = layout(
      [group],
      [
        edge("G-B", "G", "B", [
          [10, 135],
          [20, 135],
        ]),
      ],
    );

    expect(verify(inward, spacing)).toEqual([
      { kind: "edge-through-node", edge: "G-B", node: "G" },
    ]);
  });
});

describe("verify: edges side by side", () => {
  const nodes = [
    node("A", 0, 0, 50, 30),
    node("B", 0, 100, 50, 30),
    node("C", 250, 0, 50, 30),
    node("D", 250, 100, 50, 30),
  ];
  const upper = (y: number) =>
    edge("A-C", "A", "C", [
      [50, 15],
      [100, 15],
      [100, y],
      [200, y],
      [200, 15],
      [250, 15],
    ]);
  const lower = edge("B-D", "B", "D", [
    [50, 115],
    [100, 115],
    [100, 60],
    [200, 60],
    [200, 115],
    [250, 115],
  ]);
  const overlap = [{ kind: "edges-too-close", edges: ["A-C", "B-D"] }];

  test("reports two edges on the same stretch, once", () => {
    expect(verify(layout(nodes, [upper(60), lower]), spacing)).toEqual(overlap);
  });

  test("reports two edges closer than the edge gap", () => {
    expect(verify(layout(nodes, [upper(56), lower]), spacing)).toEqual(overlap);
  });

  test("accepts two edges exactly the edge gap apart", () => {
    const apart = edge("A-C", "A", "C", [
      [50, 15],
      [150, 15],
      [150, 55],
      [195, 55],
      [195, 15],
      [250, 15],
    ]);
    const below = edge("B-D", "B", "D", [
      [50, 115],
      [145, 115],
      [145, 60],
      [200, 60],
      [200, 115],
      [250, 115],
    ]);

    expect(verify(layout(nodes, [apart, below]), spacing)).toEqual([]);
  });

  test("accepts two edges on one line that only meet end to end", () => {
    const row = [node("A", 0, 0, 50, 30), node("B", 125, 0, 50, 30), node("C", 250, 0, 50, 30)];
    const chain = layout(row, [
      edge("A-B", "A", "B", [
        [50, 15],
        [125, 15],
      ]),
      edge("B-C", "B", "C", [
        [175, 15],
        [250, 15],
      ]),
    ]);

    expect(verify(chain, spacing)).toEqual([]);
  });

  test("reports an edge that runs beside itself closer than the edge gap", () => {
    const hairpin = layout(
      [nodes[0]!, nodes[2]!],
      [
        edge("A-C", "A", "C", [
          [50, 15],
          [120, 15],
          [120, 60],
          [124, 60],
          [124, 15],
          [250, 15],
        ]),
      ],
    );

    expect(verify(hairpin, { ...spacing, minSegment: 2 })).toEqual([
      { kind: "edges-too-close", edges: ["A-C", "A-C"] },
    ]);
  });

  test("reports an edge that doubles back on itself", () => {
    const back = layout(
      [nodes[0]!, nodes[2]!],
      [
        edge("A-C", "A", "C", [
          [50, 15],
          [200, 15],
          [150, 15],
          [150, 60],
          [275, 60],
          [275, 30],
        ]),
      ],
    );

    expect(verify(back, spacing)).toEqual([{ kind: "edges-too-close", edges: ["A-C", "A-C"] }]);
  });
});

describe("verify: labels", () => {
  const left = node("L", 0, 80, 50, 40);
  const right = node("R", 250, 80, 50, 40);
  const labelled = (labels: [number, number, number, number][], nodes = [left, right]) =>
    layout(nodes, [
      edge(
        "L-R",
        "L",
        "R",
        [
          [50, 100],
          [250, 100],
        ],
        labels,
      ),
    ]);

  test("reports two labels that overlap", () => {
    const stacked = labelled([
      [100, 95, 20, 10],
      [119, 95, 20, 10],
    ]);

    expect(verify(stacked, spacing)).toEqual([
      {
        kind: "labels-overlap",
        labels: [
          { edge: "L-R", label: 0 },
          { edge: "L-R", label: 1 },
        ],
      },
    ]);
  });

  test("accepts two labels that touch", () => {
    const touching = labelled([
      [100, 95, 20, 10],
      [120, 95, 20, 10],
    ]);

    expect(verify(touching, spacing)).toEqual([]);
  });

  test("reports a label over the node its edge ends at", () => {
    expect(verify(labelled([[240, 95, 20, 10]]), spacing)).toEqual([
      { kind: "label-overlaps-node", edge: "L-R", label: 0, node: "R" },
    ]);
  });

  test("reports a label over a node its edge does not connect", () => {
    const beside = [left, right, node("M", 130, 110, 40, 30)];

    expect(verify(labelled([[140, 95, 20, 20]], beside), spacing)).toEqual([
      { kind: "label-overlaps-node", edge: "L-R", label: 0, node: "M" },
    ]);
  });

  test("reports a label that reaches past the canvas", () => {
    const top = node("T", 100, 0, 50, 30);
    const bottom = node("B", 100, 170, 50, 30);
    const tall = layout(
      [top, bottom],
      [
        edge(
          "T-B",
          "T",
          "B",
          [
            [150, 15],
            [290, 15],
            [290, 185],
            [150, 185],
          ],
          [[285, 95, 20, 10]],
        ),
      ],
    );

    expect(verify(tall, spacing)).toEqual([
      { kind: "label-outside-canvas", edge: "T-B", label: 0 },
    ]);
  });
});

describe("verify: an edge beside the border of a group around its end", () => {
  const inner = node("a", 30, 30, 50, 30);
  const lower = node("b", 30, 150, 50, 30);
  const holder = node("G", 20, 20, 130, 180, [inner, lower]);
  const outer = node("x", 200, 150, 50, 30);
  const leaving = (x: number) =>
    layout(
      [holder, outer],
      [
        edge("a-x", "a", "x", [
          [80, 45],
          [x, 45],
          [x, 165],
          [200, 165],
        ]),
      ],
    );
  const staying = (x: number) =>
    layout(
      [holder],
      [
        edge("a-b", "a", "b", [
          [80, 45],
          [x, 45],
          [x, 165],
          [80, 165],
        ]),
      ],
    );

  test("reports an edge that runs just outside the group it left", () => {
    expect(verify(leaving(153), spacing)).toEqual([
      { kind: "edge-hugs-group", edge: "a-x", group: "G" },
    ]);
  });

  test("accepts an edge that runs outside the group at exactly the clearance", () => {
    expect(verify(leaving(155), spacing)).toEqual([]);
  });

  test("reports an edge that runs just inside the group both its ends are in", () => {
    expect(verify(staying(147), spacing)).toEqual([
      { kind: "edge-hugs-group", edge: "a-b", group: "G" },
    ]);
  });

  test("accepts an edge that runs inside the group at exactly the clearance", () => {
    expect(verify(staying(145), spacing)).toEqual([]);
  });
});

describe("verify: groups inside groups", () => {
  const deep = node("n", 40, 40, 40, 30);
  const beside = node("m", 40, 110, 40, 30);
  const innerGroup = node("H", 30, 30, 70, 120, [deep, beside]);
  const outerGroup = node("G", 10, 10, 130, 180, [innerGroup]);
  const far = node("C", 200, 120, 60, 30);
  const nested = (edges: PlacedEdge[]) => layout([outerGroup, far], edges);

  test("accepts an edge that crosses each group around its end once", () => {
    const out = nested([
      edge("n-C", "n", "C", [
        [80, 55],
        [170, 55],
        [170, 135],
        [200, 135],
      ]),
    ]);

    expect(verify(out, spacing)).toEqual([]);
  });

  test("names the outer group when an edge comes back into it", () => {
    const back = nested([
      edge("n-C", "n", "C", [
        [80, 55],
        [160, 55],
        [160, 80],
        [120, 80],
        [120, 100],
        [170, 100],
        [170, 135],
        [200, 135],
      ]),
    ]);

    expect(verify(back, spacing)).toEqual([
      { kind: "edge-miscrosses-group", edge: "n-C", group: "G" },
    ]);
  });

  test("names the inner group when an edge between its nodes leaves it", () => {
    const outing = nested([
      edge("n-m", "n", "m", [
        [80, 55],
        [120, 55],
        [120, 125],
        [80, 125],
      ]),
    ]);

    expect(verify(outing, spacing)).toEqual([
      { kind: "edge-leaves-group", edge: "n-m", group: "H" },
    ]);
  });
});

const tooClose = (first: string, second: string) => [
  { kind: "edges-too-close", edges: [first, second] },
];

describe("verify: edges that come close without running side by side", () => {
  const left = node("L", 0, 85, 20, 30);
  const right = node("R", 280, 85, 20, 30);
  const top = node("T", 130, 0, 40, 20);
  const bottom = node("B", 130, 180, 40, 20);

  test("reports two edges whose bends nearly touch", () => {
    const near = layout(
      [left, right, top, bottom],
      [
        edge("L-B", "L", "B", [
          [20, 100],
          [149, 100],
          [149, 180],
        ]),
        edge("R-T", "R", "T", [
          [280, 100],
          [151, 100],
          [151, 20],
        ]),
      ],
    );

    expect(verify(near, spacing)).toEqual(tooClose("L-B", "R-T"));
  });

  test("reports two edges that bend at the same point", () => {
    const touching = layout(
      [left, right, top, bottom],
      [
        edge("L-T", "L", "T", [
          [20, 100],
          [150, 100],
          [150, 20],
        ]),
        edge("R-B", "R", "B", [
          [280, 100],
          [150, 100],
          [150, 180],
        ]),
      ],
    );

    expect(verify(touching, spacing)).toEqual(tooClose("L-T", "R-B"));
  });

  test("reports an edge that stops short of crossing another", () => {
    const stub = node("S", 140, 96, 20, 0);
    const short = layout(
      [left, right, top, stub],
      [
        edge("L-R", "L", "R", [
          [20, 100],
          [280, 100],
        ]),
        edge("T-S", "T", "S", [
          [150, 20],
          [150, 96],
        ]),
      ],
    );

    expect(verify(short, { ...spacing, edgeToNode: 0 })).toEqual(tooClose("L-R", "T-S"));
  });

  test("reports a crossing closer to the end of one edge than the edge gap", () => {
    const upper = node("U", 13, 0, 20, 20);
    const under = node("D", 13, 180, 20, 20);
    const crossing = (x: number) =>
      layout(
        [left, right, upper, under],
        [
          edge("L-R", "L", "R", [
            [20, 100],
            [280, 100],
          ]),
          edge("U-D", "U", "D", [
            [x, 20],
            [x, 180],
          ]),
        ],
      );
    const loose = { ...spacing, edgeToNode: 2 };

    expect(verify(crossing(23), loose)).toEqual(tooClose("L-R", "U-D"));
    expect(verify(crossing(25), loose)).toEqual([]);
  });

  test("reports two upright edges closer than the edge gap", () => {
    const pair = layout(
      [node("A", 100, 0, 50, 20), node("B", 100, 180, 50, 20)],
      [
        edge("one", "A", "B", [
          [120, 20],
          [120, 180],
        ]),
        edge("two", "A", "B", [
          [124, 20],
          [124, 180],
        ]),
      ],
    );

    expect(verify(pair, spacing)).toEqual(tooClose("one", "two"));
  });
});

describe("verify: lengths that differ by a rounding error", () => {
  test("accepts a node gap that floating-point sums leave a hair short", () => {
    const summed = layout([node("A", 0, 0, 0.1 + 0.2, 30), node("B", 20.3, 0, 50, 30)]);

    expect(verify(summed, spacing)).toEqual([]);
  });

  test("accepts a node a hair inside its group's padding", () => {
    const hair = layout([node("G", 0, 0, 200, 100, [node("A", 10 - 1e-9, 10, 50, 30)])]);

    expect(verify(hair, spacing)).toEqual([]);
  });
});

describe("verify: a label on an edge into a group", () => {
  test("may lie inside the group around the edge's far end", () => {
    const inbound = layout(
      [group, c],
      [
        edge(
          "C-A",
          "C",
          "A",
          [
            [200, 135],
            [170, 135],
            [170, 35],
            [70, 35],
          ],
          [[90, 30, 20, 10]],
        ),
      ],
    );

    expect(verify(inbound, spacing)).toEqual([]);
  });
});

describe("verify: numbers that are not a layout", () => {
  const sound = layout([node("A", 0, 0, 50, 30), node("B", 100, 0, 50, 30)]);
  const withEdge = (path: [number, number][], labels: [number, number, number, number][] = []) =>
    layout(
      [node("A", 0, 0, 50, 30), node("B", 100, 0, 50, 30)],
      [edge("A-B", "A", "B", path, labels)],
    );

  test.each([
    ["a node of negative width", layout([node("A", 100, 100, -50, 30)]), 'width of node "A"'],
    ["a node of negative height", layout([node("A", 100, 100, 50, -30)]), 'height of node "A"'],
    ["a node at no position", layout([node("A", Number.NaN, 0, 50, 30)]), 'x of node "A"'],
    ["a node at no height", layout([node("A", 0, Number.NaN, 50, 30)]), 'y of node "A"'],
    [
      "an edge through an endless point",
      withEdge([
        [50, 15],
        [Number.POSITIVE_INFINITY, 15],
      ]),
      'x of a point of edge "A-B"',
    ],
    [
      "an edge through a point of no height",
      withEdge([
        [50, Number.NaN],
        [100, 15],
      ]),
      'y of a point of edge "A-B"',
    ],
    [
      "a label of negative height",
      withEdge(
        [
          [50, 15],
          [100, 15],
        ],
        [[70, 10, 10, -10]],
      ),
      'height of a label of edge "A-B"',
    ],
    ["a canvas of no width", { ...sound, width: Number.NaN }, "width of the canvas"],
    ["a canvas of negative height", { ...sound, height: -1 }, "height of the canvas"],
  ])("refuses %s", (_, broken, message) => {
    expect(() => verify(broken, spacing)).toThrow(message);
  });

  test.each(["nodeGap", "padding", "edgeToNode", "edgeGap", "minSegment"] as const)(
    "refuses a %s that is negative or not a number",
    (field) => {
      expect(() => verify(sound, { ...spacing, [field]: Number.NaN })).toThrow(`spacing ${field}`);
      expect(() => verify(sound, { ...spacing, [field]: -1 })).toThrow(`spacing ${field}`);
    },
  );
});

describe("verify: the far sides of a box", () => {
  test("reports a node too close to the right or the bottom of its group", () => {
    const wide = layout([node("G", 0, 0, 200, 100, [node("A", 10, 10, 181, 30)])]);
    const tall = layout([node("G", 0, 0, 200, 100, [node("A", 10, 10, 50, 81)])]);
    const outside = [{ kind: "node-outside-parent", node: "A", parent: "G" }];

    expect(verify(wide, spacing)).toEqual(outside);
    expect(verify(tall, spacing)).toEqual(outside);
  });

  test("reports an edge closer than the clearance to the right of a node", () => {
    const beside = layout(
      [node("T", 130, 0, 40, 20), node("B", 130, 180, 40, 20), node("M", 100, 80, 46, 40)],
      [
        edge("T-B", "T", "B", [
          [150, 20],
          [150, 180],
        ]),
      ],
    );

    expect(verify(beside, spacing)).toEqual([
      { kind: "edge-through-node", edge: "T-B", node: "M" },
    ]);
  });

  test("reports an edge closer than the clearance below a node", () => {
    const under = layout(
      [node("L", 0, 80, 50, 40), node("R", 250, 80, 50, 40), node("M", 130, 40, 40, 56)],
      [
        edge("L-R", "L", "R", [
          [50, 100],
          [250, 100],
        ]),
      ],
    );

    expect(verify(under, spacing)).toEqual([{ kind: "edge-through-node", edge: "L-R", node: "M" }]);
  });
});

describe("verify: an edge whose end is outside the canvas", () => {
  test("reports an edge that starts outside", () => {
    const early = layout(
      [node("A", -20, 80, 20, 40), node("R", 250, 80, 50, 40)],
      [
        edge("A-R", "A", "R", [
          [-10, 120],
          [250, 100],
        ]),
      ],
    );

    expect(verify(early, spacing)).toEqual([
      { kind: "node-outside-canvas", node: "A" },
      { kind: "edge-outside-canvas", edge: "A-R" },
      { kind: "edge-not-orthogonal", edge: "A-R", segment: 0 },
    ]);
  });

  test("reports an edge that ends outside", () => {
    const late = layout(
      [node("L", 0, 80, 50, 40), node("R", 290, 80, 20, 40)],
      [
        edge("L-R", "L", "R", [
          [50, 100],
          [305, 120],
        ]),
      ],
    );

    expect(verify(late, spacing)).toEqual([
      { kind: "node-outside-canvas", node: "R" },
      { kind: "edge-outside-canvas", edge: "L-R" },
      { kind: "edge-not-orthogonal", edge: "L-R", segment: 0 },
    ]);
  });
});

describe("verify: an edge with a slanted stretch among straight ones", () => {
  const left = node("L", 0, 0, 50, 40);
  const right = node("R", 250, 150, 50, 40);

  test("names the stretch, and checks the edge against no node", () => {
    const blocked = layout(
      [left, right, node("M", 90, 5, 20, 30)],
      [
        edge("L-R", "L", "R", [
          [50, 20],
          [150, 20],
          [250, 170],
        ]),
      ],
    );

    expect(verify(blocked, spacing)).toEqual([
      { kind: "edge-not-orthogonal", edge: "L-R", segment: 1 },
    ]);
  });

  test("does not also call a short slanted stretch too short", () => {
    const stub = layout(
      [left, right],
      [
        edge("L-R", "L", "R", [
          [50, 20],
          [150, 20],
          [156, 22],
          [156, 170],
          [250, 170],
        ]),
      ],
    );

    expect(verify(stub, spacing)).toEqual([
      { kind: "edge-not-orthogonal", edge: "L-R", segment: 1 },
    ]);
  });

  test.each([
    ["after", false],
    ["before", true],
  ])("does not compare it with a straight edge listed %s it", (_, slantedFirst) => {
    const straight = edge("straight", "N1", "N2", [
      [100, 30],
      [100, 150],
    ]);
    const slanted = edge("slanted", "N1", "N2", [
      [102, 30],
      [110, 150],
    ]);
    const pair = layout(
      [node("N1", 60, 0, 100, 30), node("N2", 60, 150, 100, 30)],
      slantedFirst ? [slanted, straight] : [straight, slanted],
    );

    expect(verify(pair, spacing)).toEqual([
      { kind: "edge-not-orthogonal", edge: "slanted", segment: 0 },
    ]);
  });
});

const upright = (id: string, from: string, to: string, x: number, down: boolean) =>
  edge(
    id,
    from,
    to,
    down
      ? [
          [x, 30],
          [x, 150],
        ]
      : [
          [x, 150],
          [x, 30],
        ],
  );

describe("verify: more than one of a thing", () => {
  test("reports an edge into a group that leaves it and comes back", () => {
    const wandering = layout(
      [group, c],
      [
        edge("C-A", "C", "A", [
          [200, 135],
          [170, 135],
          [170, 100],
          [100, 100],
          [100, 70],
          [160, 70],
          [160, 35],
          [70, 35],
        ]),
      ],
    );

    expect(verify(wandering, spacing)).toEqual([
      { kind: "edge-miscrosses-group", edge: "C-A", group: "G" },
    ]);
  });

  test("reports an edge out of a group that never leaves it", () => {
    const within = layout(
      [group, node("C", 80, 60, 40, 30)],
      [
        edge("A-C", "A", "C", [
          [70, 35],
          [100, 35],
          [100, 60],
        ]),
      ],
    );

    expect(verify(within, spacing)).toEqual([
      { kind: "nodes-overlap", nodes: ["G", "C"] },
      { kind: "edge-miscrosses-group", edge: "A-C", group: "G" },
    ]);
  });

  test("lets a label lie inside the group around the edge's near end", () => {
    const outbound = layout(
      [group, c],
      [
        edge(
          "A-C",
          "A",
          "C",
          [
            [70, 35],
            [160, 35],
            [160, 135],
            [200, 135],
          ],
          [[90, 30, 20, 10]],
        ),
      ],
    );

    expect(verify(outbound, spacing)).toEqual([]);
  });

  test("reports each pair among three edges that are too close", () => {
    const three = layout(
      [node("T", 0, 0, 200, 30), node("B", 0, 150, 200, 30)],
      [
        upright("e1", "T", "B", 40, true),
        upright("e2", "B", "T", 42, false),
        upright("e3", "T", "B", 44, true),
      ],
    );

    expect(verify(three, spacing)).toEqual([
      ...tooClose("e1", "e2"),
      ...tooClose("e1", "e3"),
      ...tooClose("e2", "e3"),
    ]);
  });

  test("accepts two upright edges exactly the edge gap apart", () => {
    const pair = layout(
      [node("A", 100, 0, 50, 20), node("B", 100, 180, 50, 20)],
      [
        edge("one", "A", "B", [
          [120, 20],
          [120, 180],
        ]),
        edge("two", "A", "B", [
          [125, 20],
          [125, 180],
        ]),
      ],
    );

    expect(verify(pair, spacing)).toEqual([]);
  });

  test("accepts two edges on one line that meet end to end, in either order", () => {
    const row = [node("A", 0, 0, 50, 30), node("B", 125, 0, 50, 30), node("C", 250, 0, 50, 30)];
    const chain = layout(row, [
      edge("B-C", "B", "C", [
        [175, 15],
        [250, 15],
      ]),
      edge("A-B", "A", "B", [
        [50, 15],
        [125, 15],
      ]),
    ]);

    expect(verify(chain, spacing)).toEqual([]);
  });

  test("names the second label of an edge by its place", () => {
    const two = layout(
      [node("L", 0, 80, 50, 40), node("R", 250, 80, 50, 40)],
      [
        edge(
          "L-R",
          "L",
          "R",
          [
            [50, 100],
            [250, 100],
          ],
          [
            [100, 95, 20, 10],
            [240, 195, 20, 10],
          ],
        ),
        edge(
          "R-L",
          "R",
          "L",
          [
            [275, 80],
            [275, 50],
            [25, 50],
            [25, 80],
          ],
          [
            [140, 45, 20, 10],
            [240, 85, 20, 10],
          ],
        ),
      ],
    );

    expect(verify(two, spacing)).toEqual([
      { kind: "label-outside-canvas", edge: "L-R", label: 1 },
      { kind: "label-overlaps-node", edge: "R-L", label: 1, node: "R" },
    ]);
  });

  test("reports labels of two edges that overlap", () => {
    const crossing = layout(
      [
        node("L", 0, 80, 20, 40),
        node("R", 280, 80, 20, 40),
        node("T", 130, 0, 40, 20),
        node("B", 130, 180, 40, 20),
      ],
      [
        edge(
          "L-R",
          "L",
          "R",
          [
            [20, 100],
            [280, 100],
          ],
          [[140, 95, 20, 10]],
        ),
        edge(
          "T-B",
          "T",
          "B",
          [
            [150, 20],
            [150, 180],
          ],
          [[145, 90, 10, 20]],
        ),
      ],
    );

    expect(verify(crossing, spacing)).toEqual([
      {
        kind: "labels-overlap",
        labels: [
          { edge: "L-R", label: 0 },
          { edge: "T-B", label: 0 },
        ],
      },
    ]);
  });
});

describe("verify: lengths within a millionth of the limit", () => {
  const hair = 5e-7;
  const left = node("L", 0, 80, 50, 40);
  const right = node("R", 250, 80, 50, 40);
  const between = (path: [number, number][], labels: [number, number, number, number][] = []) =>
    layout([left, right], [edge("L-R", "L", "R", path, labels)]);

  test.each([
    [
      "a node past the canvas by a hair",
      layout([node("A", -hair, -hair, 300 + 2 * hair, 200 + 2 * hair)]),
    ],
    [
      "two nodes short of the gap by a hair",
      layout([node("A", 0, 0, 50, 30), node("B", 70 - hair, 0, 50, 30)]),
    ],
    [
      "an edge off level by a hair",
      between([
        [50, 100],
        [250, 100 + hair],
      ]),
    ],
    [
      "an edge that starts a hair off its node",
      between([
        [50 + hair, 100],
        [250, 100],
      ]),
    ],
    [
      "a stretch a hair shorter than the shortest",
      between([
        [50, 100],
        [150, 100],
        [150, 108 - hair],
        [250, 108 - hair],
      ]),
    ],
    [
      "two labels that overlap by a hair",
      between(
        [
          [50, 100],
          [250, 100],
        ],
        [
          [100, 95, 20, 10],
          [120 - hair, 95, 20, 10],
        ],
      ),
    ],
  ])("accepts %s", (_, sound) => {
    expect(verify(sound, spacing)).toEqual([]);
  });

  test("accepts an edge a hair inside the clearance of a node", () => {
    const grazing = layout(
      [left, right, node("M", 130, 105 - hair, 40, 30)],
      [
        edge("L-R", "L", "R", [
          [50, 100],
          [250, 100],
        ]),
      ],
    );

    expect(verify(grazing, spacing)).toEqual([]);
  });

  test("still reports what is off by more than that", () => {
    const tilted = between([
      [50, 100],
      [250, 100.0005],
    ]);
    const tight = layout([node("G", 0, 0, 200, 100, [node("A", 10 - 1.5e-6, 10, 50, 30)])]);

    expect(verify(tilted, spacing)).toEqual([
      { kind: "edge-not-orthogonal", edge: "L-R", segment: 0 },
    ]);
    expect(verify(tight, spacing)).toEqual([
      { kind: "node-outside-parent", node: "A", parent: "G" },
    ]);
  });
});

describe("verify: an edge that ends by turning straight back", () => {
  test("is reported, though no other stretch comes near", () => {
    const back = layout(
      [node("A", 0, 0, 50, 30)],
      [
        edge("A-A", "A", "A", [
          [50, 15],
          [100, 15],
          [50, 15],
        ]),
      ],
    );

    expect(verify(back, spacing)).toEqual([{ kind: "edges-too-close", edges: ["A-A", "A-A"] }]);
  });
});

describe("verify: an edge that ends by turning straight back up", () => {
  test("is reported, though no other stretch comes near", () => {
    const back = layout(
      [node("A", 0, 0, 50, 30)],
      [
        edge("A-A", "A", "A", [
          [25, 30],
          [25, 80],
          [25, 30],
        ]),
      ],
    );

    expect(verify(back, spacing)).toEqual([{ kind: "edges-too-close", edges: ["A-A", "A-A"] }]);
  });
});

describe("verify: a difference of exactly a millionth", () => {
  const exactly = 1e-6;

  test("leaves a stretch along the near side of a node on that side", () => {
    const grazing = layout(
      [node("L", 0, 0, 50, 30), node("M", 100, 0, 50, 30), node("R", 250, 0, 50, 30)],
      [
        edge("L-R", "L", "R", [
          [50, -exactly],
          [250, -exactly],
        ]),
      ],
    );

    expect(verify(grazing, { ...spacing, edgeToNode: 0 })).toContainEqual({
      kind: "edge-through-node",
      edge: "L-R",
      node: "M",
    });
  });

  test("leaves a stretch level", () => {
    const climbing = layout(
      [node("L", 0, 0, 50, 40), node("R", 250, 0, 50, 40)],
      [
        edge("L-R", "L", "R", [
          [50, 0],
          [250, exactly],
        ]),
      ],
    );

    expect(verify(climbing, spacing)).not.toContainEqual({
      kind: "edge-not-orthogonal",
      edge: "L-R",
      segment: 0,
    });
  });

  test("leaves a stretch upright", () => {
    const leaning = layout(
      [node("T", 0, 0, 40, 50), node("B", 0, 150, 40, 50)],
      [
        edge("T-B", "T", "B", [
          [0, 50],
          [exactly, 150],
        ]),
      ],
    );

    expect(verify(leaning, spacing)).not.toContainEqual({
      kind: "edge-not-orthogonal",
      edge: "T-B",
      segment: 0,
    });
  });

  test("leaves an edge on the border of a group it runs along", () => {
    const along = layout(
      [node("G", 0, 0, 140, 180, [node("A", 20, 20, 50, 30)]), node("C", 200, 120, 60, 30)],
      [
        edge("A-C", "A", "C", [
          [45, 20],
          [45, exactly],
          [230, exactly],
          [230, 120],
        ]),
      ],
    );

    expect(verify(along, spacing)).toEqual([
      { kind: "edge-miscrosses-group", edge: "A-C", group: "G" },
    ]);
  });

  test("leaves an edge on the far border of a group it runs along", () => {
    const along = layout(
      [node("G", 0, -180, 140, 180, [node("A", 20, -50, 50, 30)]), node("C", 200, 120, 60, 30)],
      [
        edge("A-C", "A", "C", [
          [45, -20],
          [45, exactly],
          [230, exactly],
          [230, 120],
        ]),
      ],
    );

    expect(verify(along, spacing)).toEqual([
      { kind: "node-outside-canvas", node: "G" },
      { kind: "edge-outside-canvas", edge: "A-C" },
      { kind: "edge-miscrosses-group", edge: "A-C", group: "G" },
    ]);
  });

  test("leaves an edge attached where it starts", () => {
    const off = layout(
      [node("A", 0, 0, 50, 30), node("B", 200, 0, 50, 30)],
      [
        edge("A-B", "A", "B", [
          [exactly, 15],
          [-50, 15],
          [-50, 100],
          [225, 100],
          [225, 30],
        ]),
      ],
    );

    expect(verify(off, spacing)).toEqual([{ kind: "edge-outside-canvas", edge: "A-B" }]);
  });

  test("leaves an edge attached where it ends", () => {
    const off = layout(
      [node("B", -50, 0, 50, 30), node("A", 200, 0, 50, 30)],
      [
        edge("A-B", "A", "B", [
          [225, 30],
          [225, 60],
          [100, 60],
          [100, 15],
          [exactly, 15],
        ]),
      ],
    );

    expect(verify(off, spacing)).toEqual([{ kind: "node-outside-canvas", node: "B" }]);
  });

  test("leaves two stretches on one line, so that turning back along it is reported", () => {
    const back = layout(
      [node("A", 0, 100, 50, 30), node("B", 10, -40, 50, 80)],
      [
        edge("E", "A", "B", [
          [25, 100],
          [25, 0],
          [100, exactly],
          [60, exactly],
        ]),
      ],
    );

    expect(verify(back, spacing)).toEqual([
      { kind: "node-outside-canvas", node: "B" },
      { kind: "edge-through-node", edge: "E", node: "B" },
      { kind: "edges-too-close", edges: ["E", "E"] },
    ]);
  });

  test("is not a stretch shared by an edge that turns back", () => {
    const back = layout(
      [node("A", 80, 100, 40, 30), node("B", 0, 40, 50, 40)],
      [
        edge("E", "A", "B", [
          [100, 100],
          [100, 60],
          [0, 60],
          [exactly, 60],
        ]),
      ],
    );

    expect(verify(back, spacing)).toEqual([
      { kind: "edge-segment-too-short", edge: "E", segment: 2 },
      { kind: "edge-through-node", edge: "E", node: "B" },
    ]);
  });
});

const backwards = (forwards: PlacedEdge): PlacedEdge => {
  const [first, second, ...rest] = forwards.points.toReversed();
  if (first === undefined || second === undefined) {
    throw new Error("An edge in a test needs two points.");
  }
  return { ...forwards, from: forwards.to, to: forwards.from, points: [first, second, ...rest] };
};

describe.each([
  { what: "edges that leave one node", drawn: (forwards: PlacedEdge) => forwards },
  { what: "edges that enter one node", drawn: backwards },
])("verify: $what", ({ drawn }) => {
  const hub = node("S", 100, 0, 100, 30);
  const left = node("T1", 0, 100, 50, 30);
  const middle = node("T3", 125, 100, 50, 30);
  const right = node("T2", 250, 100, 50, 30);
  const toLeft = edge("S-T1", "S", "T1", [
    [150, 30],
    [150, 60],
    [25, 60],
    [25, 100],
  ]);
  const toRight = edge("S-T2", "S", "T2", [
    [150, 30],
    [150, 60],
    [275, 60],
    [275, 100],
  ]);
  const toMiddle = edge("S-T3", "S", "T3", [
    [150, 30],
    [150, 100],
  ]);
  const drawnLayout = (nodes: PlacedNode[], edges: PlacedEdge[]) => layout(nodes, edges.map(drawn));

  test("may share a stretch at that node, then go three ways", () => {
    const fork = drawnLayout([hub, left, middle, right], [toLeft, toRight, toMiddle]);

    expect(verify(fork, spacing)).toEqual([]);
  });

  test("may bend together along the stretch they share", () => {
    const near = edge("S-U1", "S", "U1", [
      [25, 30],
      [25, 60],
      [125, 60],
      [125, 100],
    ]);
    const far = edge("S-U2", "S", "U2", [
      [25, 30],
      [25, 60],
      [225, 60],
      [225, 100],
    ]);
    const bus = drawnLayout(
      [node("S", 0, 0, 50, 30), node("U1", 100, 100, 50, 30), node("U2", 200, 100, 50, 30)],
      [near, far],
    );

    expect(verify(bus, spacing)).toEqual([]);
  });

  test("are reported when they come too close beyond the stretch they share", () => {
    const justBelow = edge("S-X", "S", "X", [
      [150, 30],
      [150, 62],
      [80, 62],
      [80, 150],
    ]);
    const crowded = drawnLayout([hub, left, node("X", 60, 150, 40, 30)], [toLeft, justBelow]);

    expect(verify(crowded, spacing)).toEqual([{ kind: "edges-too-close", edges: ["S-T1", "S-X"] }]);
  });

  test.each([
    { order: "listed first", turnsFirst: true },
    { order: "listed second", turnsFirst: false },
  ])(
    "are reported when the one $order turns to run beside the other, right after the stretch they share",
    ({ turnsFirst }) => {
      const beside = edge("beside", "S", "T3", [
        [150, 30],
        [150, 60],
        [147, 60],
        [147, 100],
      ]);
      const straight = { ...toMiddle, id: "straight" };
      const edges = turnsFirst ? [beside, straight] : [straight, beside];
      const crowded = drawnLayout([hub, middle], edges);

      expect(verify(crowded, { ...spacing, minSegment: 2 })).toContainEqual({
        kind: "edges-too-close",
        edges: edges.map(({ id }) => id),
      });
    },
  );

  test.each([
    { order: "first", twiceFirst: true },
    { order: "second", twiceFirst: false },
  ])("share a stretch that the one listed $order gives a point twice on", ({ twiceFirst }) => {
    const twice = edge("S-T1", "S", "T1", [
      [150, 30],
      [150, 45],
      [150, 45],
      [150, 60],
      [25, 60],
      [25, 100],
    ]);
    const fork = drawnLayout([hub, left, right], twiceFirst ? [twice, toRight] : [toRight, twice]);

    expect(verify(fork, spacing).filter(({ kind }) => kind === "edges-too-close")).toEqual([
      { kind: "edges-too-close", edges: ["S-T1", "S-T1"] },
    ]);
  });

  test("are reported when they part to the left and the right and one turns too close to the other", () => {
    const turning = edge("S-T3", "S", "T3", [
      [150, 30],
      [150, 60],
      [153, 60],
      [153, 100],
    ]);
    const crowded = drawnLayout([hub, left, middle], [toLeft, turning]);

    expect(verify(crowded, { ...spacing, minSegment: 2 })).toContainEqual({
      kind: "edges-too-close",
      edges: ["S-T1", "S-T3"],
    });
  });

  test("are reported when they part up and down and one turns too close to the other", () => {
    const up = edge("H-P", "H", "P", [
      [50, 100],
      [100, 100],
      [100, 40],
      [150, 40],
    ]);
    const down = edge("H-Q", "H", "Q", [
      [50, 100],
      [100, 100],
      [100, 103],
      [150, 103],
    ]);
    const crowded = drawnLayout(
      [node("H", 0, 85, 50, 30), node("P", 150, 25, 50, 30), node("Q", 150, 88, 50, 30)],
      [up, down],
    );

    expect(verify(crowded, { ...spacing, minSegment: 2 })).toContainEqual({
      kind: "edges-too-close",
      edges: ["H-P", "H-Q"],
    });
  });

  test("are reported on one stretch when they meet the node at different points", () => {
    const fromTheSide = edge("S-T2", "S", "T2", [
      [200, 15],
      [230, 15],
      [230, 60],
      [275, 60],
      [275, 100],
    ]);
    const slanting = edge("S-C", "S", "C", [
      [180, 30],
      [230, 15],
      [230, 60],
    ]);
    const shared = drawnLayout([hub, right, node("C", 205, 60, 50, 30)], [fromTheSide, slanting]);

    expect(verify(shared, spacing)).toContainEqual({
      kind: "edges-too-close",
      edges: ["S-T2", "S-C"],
    });
  });

  test("may part just before a point on the one that goes straight on", () => {
    const straightOn = edge("S-T3", "S", "T3", [
      [150, 30],
      [150, 63],
      [150, 100],
    ]);
    const fork = drawnLayout([hub, left, middle], [toLeft, straightOn]);

    expect(verify(fork, spacing)).toEqual([]);
  });

  test("are reported when one comes back beside the other, past a point on its straight stretch", () => {
    const straightOn = edge("S-T3", "S", "T3", [
      [150, 30],
      [150, 63],
      [150, 100],
    ]);
    const back = edge("back", "S", "T3", [
      [150, 30],
      [150, 60],
      [100, 60],
      [100, 80],
      [147, 80],
      [147, 100],
    ]);
    const crowded = drawnLayout([hub, middle], [straightOn, back]);

    expect(verify(crowded, spacing)).toContainEqual({
      kind: "edges-too-close",
      edges: ["S-T3", "back"],
    });
  });

  test("are not reported for one of them coming back beside the stretch they share", () => {
    const far = edge("S-U2", "S", "U2", [
      [25, 30],
      [25, 60],
      [225, 60],
      [225, 100],
    ]);
    const back = edge("back", "S", "U1", [
      [25, 30],
      [25, 60],
      [125, 60],
      [125, 75],
      [110, 75],
      [110, 63],
      [40, 63],
    ]);
    const looping = drawnLayout(
      [node("S", 0, 0, 50, 30), node("U1", 0, 48, 40, 30), node("U2", 200, 100, 50, 30)],
      [far, back],
    );

    expect(verify(looping, spacing).filter(({ kind }) => kind === "edges-too-close")).toEqual([
      { kind: "edges-too-close", edges: ["back", "back"] },
    ]);
  });

  test("are reported on one stretch when two nodes that touch hold it", () => {
    const touching = [node("A", 50, 0, 50, 30), node("B", 100, 0, 50, 30), left, right];
    const fromA = edge("A-T1", "A", "T1", [
      [100, 30],
      [100, 60],
      [25, 60],
      [25, 100],
    ]);
    const fromB = edge("B-T2", "B", "T2", [
      [100, 30],
      [100, 60],
      [275, 60],
      [275, 100],
    ]);
    const shared = drawnLayout(touching, [fromA, fromB]);

    expect(verify(shared, { ...spacing, nodeGap: 0 })).toContainEqual({
      kind: "edges-too-close",
      edges: ["A-T1", "B-T2"],
    });
  });
});

describe("verify: an edge that ends at a group", () => {
  const inner = node("K", 20, 20, 80, 80);
  const outer = node("G", 10, 10, 100, 100, [inner]);
  const beside = node("R", 200, 45, 50, 30);
  const wide = { ...spacing, edgeToNode: 15 };

  test("may come closer to a node inside the group than to any other node", () => {
    const into = layout(
      [outer, beside],
      [
        edge("R-G", "R", "G", [
          [200, 60],
          [110, 60],
        ]),
      ],
    );

    expect(verify(into, wide)).toEqual([]);
  });

  test("may start closer to a node inside the group than to any other node", () => {
    const outOf = layout(
      [outer, beside],
      [
        edge("G-R", "G", "R", [
          [110, 60],
          [200, 60],
        ]),
      ],
    );

    expect(verify(outOf, wide)).toEqual([]);
  });
});

describe("verify: two edges that share no node", () => {
  const corners = [
    node("f0", 1000, 1000, 10, 10),
    node("t0", 1000, 2000, 10, 10),
    node("f1", 1100, 1000, 10, 10),
    node("t1", 1100, 2000, 10, 10),
  ];
  const closeness = (edges: PlacedEdge[], kept = spacing) =>
    verify({ width: 5000, height: 5000, nodes: corners, edges }, kept).filter(
      ({ kind }) => kind === "edges-too-close",
    );

  test("are compared at the points they are given, so a millionth short of the edge gap passes", () => {
    const turning = edge("e1", "f0", "t0", [
      [155, 5.000002],
      [79.999999, 5.000002],
      [79.999999, 139.999999],
    ]);
    const stopping = edge("e3", "f1", "t1", [
      [29.999999, 60.333333333333336],
      [29.999999, 85.3],
      [109.999999, 85.3],
      [109.999999, 65.000002],
      [75, 65.000002],
    ]);

    expect(closeness([turning, stopping])).toEqual([]);
  });

  test("are too close where one crosses the other at a point given on its straight stretch", () => {
    const level = edge("level", "f0", "t0", [
      [100, 150],
      [150, 150],
      [200, 150],
    ]);
    const crossing = edge("crossing", "f1", "t1", [
      [150, 100],
      [150, 200],
    ]);

    expect(closeness([level, crossing])).toEqual([
      { kind: "edges-too-close", edges: ["level", "crossing"] },
    ]);
  });

  test("are compared even when one of them has no length", () => {
    const dot = edge("dot", "f0", "t0", [
      [185, 150],
      [185, 150],
    ]);
    const line = edge("line", "f1", "t1", [
      [200, 150],
      [160, 150],
    ]);

    expect(closeness([dot, line])).toEqual([{ kind: "edges-too-close", edges: ["dot", "line"] }]);
  });
});
