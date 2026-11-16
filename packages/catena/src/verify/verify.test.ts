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
      [left, right],
      [
        edge("L-R", "L", "R", [
          [50, 100],
          [150, 100],
          [150, 80],
          [270, 80],
        ]),
      ],
    );

    expect(verify(along, spacing)).toEqual([{ kind: "edge-through-node", edge: "L-R", node: "R" }]);
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
  const overlap = [{ kind: "edges-overlap", edges: ["A-C", "B-D"] }];

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

    expect(verify(back, spacing)).toEqual([{ kind: "edges-overlap", edges: ["A-C", "A-C"] }]);
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
