import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { Layout, PlacedNode, Spacing } from "../layout";
import { verify } from "../verify";
import { graphs } from "./graph.arbitrary";
import { InvalidGraphError, placeGraph } from "./index";
import type { Cell, Direction, Graph, GraphNode } from "./index";

const spacing = { nodeGap: 20, padding: 10, edgeToNode: 5, edgeGap: 5, minSegment: 8 };

const leaf = (id: string, width: number, height: number, cell?: Cell): GraphNode => ({
  id,
  size: { width, height },
  cell,
});

const group = (
  id: string,
  direction: Direction,
  children: [GraphNode, ...GraphNode[]],
  cell?: Cell,
): GraphNode => ({ id, direction, children, cell });

const graph = (direction: Direction, nodes: GraphNode[], links: string[] = []): Graph => ({
  direction,
  nodes,
  edges: links.map((link, index) => {
    const [from = "", to = ""] = link.split(">");
    return { id: `${link} #${index}`, from, to };
  }),
});

const flat = (nodes: readonly PlacedNode[]): PlacedNode[] =>
  nodes.flatMap((node) => [node, ...flat(node.children)]);

const boxes = (placement: Pick<Layout, "nodes">): Record<string, number[]> =>
  Object.fromEntries(
    flat(placement.nodes).map(({ id, box }) => [id, [box.x, box.y, box.width, box.height]]),
  );

const paths = (placement: Pick<Layout, "edges">): Record<string, number[][]> =>
  Object.fromEntries(
    placement.edges.map(({ id, points }) => [id, points.map(({ x, y }) => [x, y])]),
  );

const place = (
  direction: Direction,
  nodes: GraphNode[],
  links: string[] = [],
  kept: Spacing = spacing,
) => placeGraph(graph(direction, nodes, links), kept);

describe("placeGraph: the canvas", () => {
  test("is only its padding when the graph has no nodes", () => {
    expect(place("down", [])).toEqual({ width: 20, height: 20, nodes: [], edges: [] });
  });

  test("keeps the padding around a single node", () => {
    expect(place("down", [leaf("A", 50, 30)])).toEqual({
      width: 70,
      height: 50,
      nodes: [{ id: "A", box: { x: 10, y: 10, width: 50, height: 30 }, children: [] }],
      edges: [],
    });
  });

  test.each([
    ["a row of nodes of no height", 10, 0, [30, 20]],
    ["a column of nodes of no width", 0, 10, [20, 30]],
  ] as const)("gives no room to %s", (_, width, height, size) => {
    const placement = place("down", [leaf("A", width, height)]);

    expect([placement.width, placement.height]).toEqual(size);
    expect(boxes(placement)).toEqual({ A: [10, 10, width, height] });
  });
});

describe("placeGraph: order along the flow", () => {
  const chain = [leaf("A", 50, 30), leaf("B", 80, 40), leaf("C", 50, 30)];

  test("puts each node below the one that leads to it, in the middle of the column", () => {
    const placement = place("down", chain, ["A>B", "B>C"]);
    expect(boxes(placement)).toEqual({
      A: [25, 10, 50, 30],
      B: [10, 60, 80, 40],
      C: [25, 120, 50, 30],
    });
    expect([placement.width, placement.height]).toEqual([100, 160]);
  });

  test("puts each node to the right of the one that leads to it, in the middle of the row", () => {
    const placement = place("right", chain, ["A>B", "B>C"]);
    expect(boxes(placement)).toEqual({
      A: [10, 15, 50, 30],
      B: [80, 10, 80, 40],
      C: [180, 15, 50, 30],
    });
    expect([placement.width, placement.height]).toEqual([240, 60]);
  });

  test("puts nodes that nothing leads to side by side, in the order they are listed", () => {
    expect(boxes(place("down", chain))).toEqual({
      A: [10, 15, 50, 30],
      B: [80, 10, 80, 40],
      C: [180, 15, 50, 30],
    });
    expect(boxes(place("right", chain))).toEqual({
      A: [25, 10, 50, 30],
      B: [10, 60, 80, 40],
      C: [25, 120, 50, 30],
    });
  });

  test.each([[["A>C", "A>B", "B>C"]], [["B>C", "A>B", "A>C"]]])(
    "puts a node past the furthest node that leads to it, with edges %j",
    (links) => {
      expect(boxes(place("down", chain, links))).toEqual({
        A: [25, 10, 50, 30],
        B: [10, 60, 80, 40],
        C: [25, 120, 50, 30],
      });
    },
  );

  test("puts nodes of the same step side by side, in the order they are listed", () => {
    expect(boxes(place("down", chain, ["A>C", "A>B"]))).toEqual({
      A: [25, 10, 50, 30],
      B: [10, 60, 80, 40],
      C: [110, 65, 50, 30],
    });
  });

  test.each([
    ["an edge that goes back to an earlier node", ["A>B", "B>A"], [16, 66]],
    ["an edge from a node to itself", ["A>B", "A>A", "B>B"], [16, 70]],
    ["the same edge twice", ["A>B", "A>B"], [10, 60]],
  ])("keeps the order with %s", (_, links, [top = 0, below = 0]) => {
    expect(boxes(place("down", [leaf("A", 50, 30), leaf("B", 50, 30)], links))).toEqual({
      A: [10, top, 50, 30],
      B: [10, below, 50, 30],
    });
  });

  test("leaves a node where it is when only later nodes lead to it", () => {
    expect(boxes(place("down", chain, ["C>A", "B>A"]))).toEqual({
      A: [10, 21, 50, 30],
      B: [80, 16, 80, 40],
      C: [180, 21, 50, 30],
    });
  });
});

describe("placeGraph: a node that names its cell", () => {
  test("is put there, and rows and columns that hold nothing take no room", () => {
    expect(
      boxes(
        place("down", [
          leaf("A", 50, 30, { row: 2, column: 7 }),
          leaf("B", 50, 30, { row: 2, column: 3 }),
          leaf("C", 50, 30, { row: 9, column: 7 }),
        ]),
      ),
    ).toEqual({
      A: [80, 10, 50, 30],
      B: [10, 10, 50, 30],
      C: [80, 60, 50, 30],
    });
  });

  test("is ordered by number, not by text", () => {
    expect(
      boxes(
        place("down", [
          leaf("A", 50, 30, { row: 10, column: 10 }),
          leaf("B", 50, 30, { row: 9, column: 9 }),
        ]),
      ),
    ).toEqual({
      A: [80, 60, 50, 30],
      B: [10, 10, 50, 30],
    });
  });

  test("shares no cell with a node whose row and column read the same when written together", () => {
    expect(
      boxes(
        place("down", [
          leaf("A", 50, 30, { row: 1, column: 11 }),
          leaf("B", 50, 30, { row: 11, column: 1 }),
        ]),
      ),
    ).toEqual({
      A: [80, 10, 50, 30],
      B: [10, 60, 50, 30],
    });
  });

  test("orders the nodes around it as any node does, when it is a group", () => {
    expect(
      boxes(
        place(
          "down",
          [
            group("G", "down", [leaf("A", 50, 30)], { row: 2, column: 1 }),
            leaf("B", 50, 30),
            leaf("C", 50, 30),
          ],
          ["A>B", "G>C"],
        ),
      ),
    ).toEqual({
      G: [80, 10, 70, 56],
      A: [90, 20, 50, 30],
      B: [10, 86, 50, 30],
      C: [90, 86, 50, 30],
    });
  });

  test("keeps its cell from the nodes around it, even those listed before it", () => {
    expect(
      boxes(
        place("down", [
          leaf("A", 50, 30),
          leaf("B", 50, 30),
          leaf("P", 50, 30, { row: 0, column: 0 }),
          leaf("Q", 50, 30, { row: 0, column: 2 }),
        ]),
      ),
    ).toEqual({
      P: [10, 10, 50, 30],
      A: [80, 10, 50, 30],
      Q: [150, 10, 50, 30],
      B: [220, 10, 50, 30],
    });
  });

  test("sends the nodes it leads to one step past its own cell", () => {
    expect(
      boxes(
        place(
          "down",
          [
            leaf("P", 50, 30, { row: 3, column: 1 }),
            leaf("Q", 50, 30, { row: 4, column: 0 }),
            leaf("A", 50, 30),
          ],
          ["P>A"],
        ),
      ),
    ).toEqual({
      P: [80, 10, 50, 30],
      Q: [10, 60, 50, 30],
      A: [80, 60, 50, 30],
    });
    expect(
      boxes(
        place(
          "right",
          [
            leaf("P", 50, 30, { row: 1, column: 3 }),
            leaf("Q", 50, 30, { row: 0, column: 4 }),
            leaf("A", 50, 30),
          ],
          ["P>A"],
        ),
      ),
    ).toEqual({
      P: [10, 60, 50, 30],
      Q: [80, 10, 50, 30],
      A: [80, 60, 50, 30],
    });
  });

  test("is not moved by the nodes that lead to it", () => {
    expect(
      boxes(place("down", [leaf("A", 50, 30), leaf("P", 50, 30, { row: 0, column: 1 })], ["A>P"])),
    ).toEqual({
      A: [10, 16, 50, 30],
      P: [80, 16, 50, 30],
    });
  });
});

describe("placeGraph: a node with very many edges", () => {
  test("is placed like a node with one", () => {
    const links = Array.from({ length: 200_000 }, () => "A>B");
    expect(boxes(place("down", [leaf("A", 50, 30), leaf("B", 50, 30)], links))).toEqual({
      A: [10, 10, 50, 30],
      B: [10, 60, 50, 30],
    });
  });
});

describe("placeGraph: a group", () => {
  test("is its grid plus the padding, with its children inside", () => {
    const placement = place(
      "down",
      [group("G", "down", [leaf("A", 50, 30), leaf("B", 50, 30)])],
      ["A>B"],
    );
    expect({ ...placement, edges: paths(placement) }).toEqual({
      width: 90,
      height: 120,
      nodes: [
        {
          id: "G",
          box: { x: 10, y: 10, width: 70, height: 100 },
          children: [
            { id: "A", box: { x: 20, y: 20, width: 50, height: 30 }, children: [] },
            { id: "B", box: { x: 20, y: 70, width: 50, height: 30 }, children: [] },
          ],
        },
      ],
      edges: {
        "A>B #0": [
          [45, 50],
          [45, 70],
        ],
      },
    });
  });

  test("flows its own way, whichever way the graph flows", () => {
    expect(
      boxes(
        place(
          "right",
          [group("G", "down", [leaf("A", 50, 30), leaf("B", 50, 30)]), leaf("C", 50, 30)],
          ["A>B", "G>C"],
        ),
      ),
    ).toEqual({
      G: [10, 10, 70, 100],
      A: [20, 20, 50, 30],
      B: [20, 70, 50, 30],
      C: [100, 45, 50, 30],
    });
  });

  test("moves with everything in it to the middle of its cell", () => {
    expect(
      boxes(
        place(
          "down",
          [leaf("W", 200, 30), group("G", "down", [group("H", "down", [leaf("A", 50, 30)])])],
          ["W>G"],
        ),
      ),
    ).toEqual({
      W: [10, 10, 200, 30],
      G: [65, 60, 90, 70],
      H: [75, 70, 70, 50],
      A: [85, 80, 50, 30],
    });
  });

  test.each([
    ["out of the group", "A>C"],
    ["from the group itself", "G>C"],
    ["out of a group inside it", "B>C"],
  ])("is put before a node that an edge %s leads to", (_, link) => {
    const placement = place(
      "down",
      [
        group("G", "right", [leaf("A", 50, 30), group("H", "down", [leaf("B", 50, 30)])]),
        leaf("C", 50, 30),
      ],
      [link],
    );
    expect(boxes(placement)["G"]).toEqual([10, 10, 90, 120]);
    expect(boxes(placement)["C"]).toEqual([30, 150, 50, 30]);
  });

  test("is put after a node that leads into it", () => {
    const placement = place(
      "down",
      [leaf("C", 50, 30), group("G", "down", [leaf("A", 50, 30)])],
      ["C>A"],
    );
    expect(boxes(placement)).toEqual({
      C: [20, 10, 50, 30],
      G: [10, 60, 70, 56],
      A: [20, 76, 50, 30],
    });
  });

  test("is not moved by an edge between two nodes inside it, which orders them instead", () => {
    expect(
      boxes(
        place(
          "right",
          [group("G", "down", [leaf("A", 50, 30), leaf("B", 50, 30)]), leaf("C", 50, 30)],
          ["A>B"],
        ),
      ),
    ).toEqual({
      G: [10, 10, 70, 100],
      A: [20, 20, 50, 30],
      B: [20, 70, 50, 30],
      C: [20, 130, 50, 30],
    });
  });

  test("does not order its children by an edge that ends outside it or at the group itself", () => {
    expect(
      boxes(
        place(
          "right",
          [leaf("C", 50, 30), group("G", "down", [leaf("A", 50, 30), leaf("B", 50, 30)])],
          ["C>B", "A>C", "G>B", "A>G"],
        ),
      ),
    ).toEqual({
      C: [10, 20, 50, 30],
      G: [80, 10, 140, 50],
      A: [90, 20, 50, 30],
      B: [160, 20, 50, 30],
    });
  });

  test("puts a child that names its cell there", () => {
    expect(
      boxes(
        place("down", [
          group("G", "down", [
            leaf("A", 50, 30, { row: 1, column: 0 }),
            leaf("B", 50, 30, { row: 0, column: 0 }),
          ]),
        ]),
      ),
    ).toEqual({
      G: [10, 10, 70, 100],
      A: [20, 70, 50, 30],
      B: [20, 20, 50, 30],
    });
  });

  test("can name the cell another group's child names", () => {
    const placement = place("down", [
      group("G", "down", [leaf("A", 50, 30, { row: 0, column: 0 })], { row: 0, column: 0 }),
      group("H", "down", [leaf("B", 50, 30, { row: 0, column: 0 })], { row: 0, column: 1 }),
    ]);
    expect(boxes(placement)).toEqual({
      G: [10, 10, 70, 50],
      A: [20, 20, 50, 30],
      H: [100, 10, 70, 50],
      B: [110, 20, 50, 30],
    });
  });
});

describe("placeGraph: an edge to the next row", () => {
  const chain = [leaf("A", 50, 30), leaf("B", 80, 40), leaf("C", 50, 30)];

  test("runs straight down the middle of a column", () => {
    expect(paths(place("down", chain, ["A>B", "B>C"]))).toEqual({
      "A>B #0": [
        [50, 40],
        [50, 60],
      ],
      "B>C #1": [
        [50, 100],
        [50, 120],
      ],
    });
  });

  test("runs straight along the middle of a row when the flow is to the right", () => {
    expect(paths(place("right", chain, ["A>B", "B>C"]))).toEqual({
      "A>B #0": [
        [60, 30],
        [80, 30],
      ],
      "B>C #1": [
        [160, 30],
        [180, 30],
      ],
    });
  });

  test("shares a lane halfway to the next row with the other edges that leave its node", () => {
    const fork = place(
      "down",
      [leaf("A", 50, 30), leaf("B", 50, 30), leaf("C", 50, 30), leaf("D", 50, 30)],
      ["A>B", "A>C", "A>D"],
    );

    expect(paths(fork)).toEqual({
      "A>B #0": [
        [35, 40],
        [35, 60],
      ],
      "A>C #1": [
        [35, 40],
        [35, 50],
        [105, 50],
        [105, 60],
      ],
      "A>D #2": [
        [35, 40],
        [35, 50],
        [175, 50],
        [175, 60],
      ],
    });
  });

  test("drops into its node along the edges that enter it from straight before", () => {
    const merge = place(
      "down",
      [
        leaf("A", 50, 30, { row: 0, column: 0 }),
        leaf("B", 50, 30, { row: 0, column: 1 }),
        leaf("C", 50, 30, { row: 1, column: 0 }),
      ],
      ["A>C", "B>C"],
    );

    expect(paths(merge)).toEqual({
      "A>C #0": [
        [35, 40],
        [35, 60],
      ],
      "B>C #1": [
        [105, 40],
        [105, 50],
        [35, 50],
        [35, 60],
      ],
    });
  });

  test("is drawn over the same edge listed again", () => {
    const twice = paths(place("down", [leaf("A", 50, 30), leaf("B", 50, 30)], ["A>B", "A>B"]));

    expect(twice["A>B #1"]).toEqual(twice["A>B #0"]);
  });
});

describe("placeGraph: lanes between two rows", () => {
  const square = [
    leaf("A", 50, 30, { row: 0, column: 0 }),
    leaf("Y", 50, 30, { row: 0, column: 1 }),
    leaf("B", 50, 30, { row: 1, column: 0 }),
    leaf("X", 50, 30, { row: 1, column: 1 }),
  ];

  test("put the lane of the node before a target nearer that node than the lane of an edge that drops into the target", () => {
    const crossing = place(
      "down",
      [
        leaf("A", 50, 30, { row: 0, column: 0 }),
        leaf("U", 50, 30, { row: 0, column: 1 }),
        leaf("T", 50, 30, { row: 1, column: 1 }),
        leaf("Z", 50, 30, { row: 1, column: 2 }),
      ],
      ["A>T", "U>Z"],
    );

    expect(boxes(crossing)).toMatchObject({ U: [80, 10, 50, 30], T: [80, 61, 50, 30] });
    expect(paths(crossing)).toEqual({
      "A>T #0": [
        [35, 40],
        [35, 53],
        [105, 53],
        [105, 61],
      ],
      "U>Z #1": [
        [105, 40],
        [105, 48],
        [175, 48],
        [175, 61],
      ],
    });
  });

  const grid = [
    leaf("A", 50, 30, { row: 0, column: 0 }),
    leaf("B", 50, 30, { row: 0, column: 1 }),
    leaf("C", 50, 30, { row: 0, column: 2 }),
    leaf("T0", 50, 30, { row: 1, column: 0 }),
    leaf("T1", 50, 30, { row: 1, column: 1 }),
    leaf("T2", 50, 30, { row: 1, column: 2 }),
  ];

  test("keep an order put first when a later one names the same node", () => {
    expect(paths(place("down", grid, ["C>T1", "B>T0"]))).toEqual({
      "C>T1 #0": [
        [175, 40],
        [175, 53],
        [105, 53],
        [105, 61],
      ],
      "B>T0 #1": [
        [105, 40],
        [105, 48],
        [35, 48],
        [35, 61],
      ],
    });
  });

  test("put a lane after the lanes of both the nodes it has to follow", () => {
    expect(paths(place("down", grid, ["A>T1", "A>T2", "B>B", "C>C"]))).toMatchObject({
      "A>T1 #0": [
        [35, 51],
        [35, 69],
        [105, 69],
        [105, 77],
      ],
      "B>B #2": [
        [105, 51],
        [105, 59],
        [140, 59],
        [140, 8],
        [105, 8],
        [105, 21],
      ],
      "C>C #3": [
        [175, 51],
        [175, 64],
        [208, 64],
        [208, 13],
        [175, 13],
        [175, 21],
      ],
    });
  });

  test("are put in order quickly for a row of many nodes that each lead to every target before them", () => {
    const count = 28;
    const row = Array.from({ length: count }, (_, at) => [
      leaf(`N${at}`, 50, 30, { row: 0, column: at }),
      leaf(`T${at}`, 50, 30, { row: 1, column: at }),
    ]).flat();
    const links = Array.from({ length: count }, (_, back) => count - 1 - back).flatMap((target) =>
      Array.from({ length: count - 1 - target }, (_, back) => `N${count - 1 - back}>T${target}`),
    );

    expect(place("down", row, links).edges).toHaveLength(378);
  }, 2000);

  test("send the later of two edges that would each run along the start of the other around", () => {
    expect(paths(place("down", square, ["A>X", "Y>B"]))).toEqual({
      "A>X #0": [
        [35, 40],
        [35, 53],
        [105, 53],
        [105, 69],
      ],
      "Y>B #1": [
        [105, 40],
        [105, 48],
        [70, 48],
        [70, 61],
        [35, 61],
        [35, 69],
      ],
    });
  });

  test("send the other one around when the two edges are listed the other way round", () => {
    expect(paths(place("down", square, ["Y>B", "A>X"]))).toEqual({
      "Y>B #0": [
        [105, 40],
        [105, 53],
        [35, 53],
        [35, 69],
      ],
      "A>X #1": [
        [35, 40],
        [35, 48],
        [70, 48],
        [70, 61],
        [105, 61],
        [105, 69],
      ],
    });
  });
});

describe("placeGraph: an edge that goes around", () => {
  test("goes back beside its source, in a corridor made wide enough, and enters its target from before", () => {
    const loop = place("down", [leaf("A", 50, 30), leaf("B", 50, 30)], ["A>B", "B>A"]);

    expect([loop.width, loop.height]).toEqual([76, 112]);
    expect(paths(loop)).toEqual({
      "A>B #0": [
        [35, 46],
        [35, 66],
      ],
      "B>A #1": [
        [35, 96],
        [35, 104],
        [68, 104],
        [68, 8],
        [35, 8],
        [35, 16],
      ],
    });
  });

  test("leaves a node and comes back to it", () => {
    expect(paths(place("down", [leaf("A", 50, 30)], ["A>A"]))).toEqual({
      "A>A #0": [
        [35, 46],
        [35, 54],
        [68, 54],
        [68, 8],
        [35, 8],
        [35, 16],
      ],
    });
  });

  test("leaves a node and comes back to it when the flow is to the right", () => {
    const loop = place("right", [leaf("A", 50, 30)], ["A>A"]);

    expect([loop.width, loop.height]).toEqual([82, 56]);
    expect(paths(loop)).toEqual({
      "A>A #0": [
        [66, 25],
        [74, 25],
        [74, 48],
        [8, 48],
        [8, 25],
        [16, 25],
      ],
    });
  });

  test("puts the lanes that enter a row after all the lanes that leave the row before, however many enter", () => {
    const loops = place(
      "down",
      [
        leaf("A", 50, 30, { row: 0, column: 0 }),
        leaf("B", 50, 30, { row: 0, column: 1 }),
        leaf("C", 50, 30, { row: 1, column: 0 }),
        leaf("D", 50, 30, { row: 1, column: 1 }),
      ],
      ["A>A", "C>C", "D>D"],
    );

    expect(paths(loops)).toEqual({
      "A>A #0": [
        [35, 46],
        [35, 54],
        [68, 54],
        [68, 8],
        [35, 8],
        [35, 16],
      ],
      "C>C #1": [
        [35, 105],
        [35, 113],
        [73, 113],
        [73, 62],
        [35, 62],
        [35, 75],
      ],
      "D>D #2": [
        [106, 105],
        [106, 118],
        [139, 118],
        [139, 67],
        [106, 67],
        [106, 75],
      ],
    });
  });

  test.each([{ edgeToNode: 12 }, { edgeGap: 12 }, { minSegment: 12 }])(
    "keeps its lanes clear of the rows and columns by the largest of the edge spacings, with %j",
    (larger) => {
      const loop = place("down", [leaf("A", 50, 30), leaf("B", 50, 30)], ["A>B", "B>A"], {
        ...spacing,
        ...larger,
      });

      expect([loop.width, loop.height]).toEqual([84, 128]);
      expect(paths(loop)["B>A #1"]).toEqual([
        [35, 104],
        [35, 116],
        [72, 116],
        [72, 12],
        [35, 12],
        [35, 24],
      ]);
    },
  );

  test("passes a row beside its source, then turns to its target", () => {
    const skipping = place(
      "down",
      [leaf("A", 50, 30), leaf("B", 50, 30), leaf("C", 50, 30)],
      ["A>B", "B>C", "A>C"],
    );

    expect(paths(skipping)["A>C #2"]).toEqual([
      [35, 40],
      [35, 50],
      [68, 50],
      [68, 100],
      [35, 100],
      [35, 110],
    ]);
  });

  test("passes its source on the side of a target in an earlier column", () => {
    const skipping = place(
      "down",
      [
        leaf("A", 50, 30, { row: 0, column: 1 }),
        leaf("B", 50, 30, { row: 1, column: 1 }),
        leaf("C", 50, 30, { row: 2, column: 0 }),
      ],
      ["A>C"],
    );

    expect(paths(skipping)).toEqual({
      "A>C #0": [
        [105, 40],
        [105, 50],
        [70, 50],
        [70, 100],
        [35, 100],
        [35, 110],
      ],
    });
  });

  test("goes between two nodes of one row, each way in a lane of its own", () => {
    const pair = place(
      "down",
      [leaf("A", 50, 30, { row: 0, column: 0 }), leaf("B", 50, 30, { row: 0, column: 1 })],
      ["A>B", "B>A"],
    );

    expect(boxes(pair)).toEqual({ A: [10, 21, 50, 30], B: [81, 21, 50, 30] });
    expect(paths(pair)).toEqual({
      "A>B #0": [
        [35, 51],
        [35, 59],
        [68, 59],
        [68, 13],
        [106, 13],
        [106, 21],
      ],
      "B>A #1": [
        [106, 51],
        [106, 64],
        [73, 64],
        [73, 8],
        [35, 8],
        [35, 21],
      ],
    });
  });

  test("shares the lane beside its source with the edges that leave it, and the lane before its target with the edges that enter it", () => {
    const loops = place(
      "down",
      [
        leaf("A", 50, 30, { row: 0, column: 0 }),
        leaf("B", 50, 30, { row: 0, column: 1 }),
        leaf("C", 50, 30, { row: 1, column: 0 }),
      ],
      ["C>A", "C>B", "A>A"],
    );

    expect(paths(loops)).toEqual({
      "C>A #0": [
        [35, 101],
        [35, 109],
        [73, 109],
        [73, 8],
        [35, 8],
        [35, 21],
      ],
      "C>B #1": [
        [35, 101],
        [35, 109],
        [73, 109],
        [73, 13],
        [106, 13],
        [106, 21],
      ],
      "A>A #2": [
        [35, 51],
        [35, 61],
        [68, 61],
        [68, 8],
        [35, 8],
        [35, 21],
      ],
    });
  });

  test("keeps the lanes that leave a row before the lanes that enter the next, a shortest stretch apart", () => {
    const loops = place("down", [leaf("A", 50, 30), leaf("B", 50, 30)], ["A>B", "A>A", "B>B"]);

    expect(paths(loops)).toMatchObject({
      "A>A #1": [
        [35, 46],
        [35, 54],
        [68, 54],
        [68, 8],
        [35, 8],
        [35, 16],
      ],
      "B>B #2": [
        [35, 100],
        [35, 108],
        [73, 108],
        [73, 62],
        [35, 62],
        [35, 70],
      ],
    });
  });
});

describe("placeGraph: a corridor", () => {
  const tight = { ...spacing, nodeGap: 2, padding: 2 };
  const narrow = [
    leaf("A", 10, 30, { row: 0, column: 0 }),
    leaf("B", 10, 30, { row: 0, column: 1 }),
    leaf("C", 10, 30, { row: 1, column: 0 }),
  ];

  test("is the gap between nodes, or the padding, in a grid without edges", () => {
    expect(boxes(place("down", narrow, [], tight))).toEqual({
      A: [2, 2, 10, 30],
      B: [14, 2, 10, 30],
      C: [2, 34, 10, 30],
    });
  });

  test("keeps the middle of each row and column clear of the next in a grid with edges", () => {
    const placement = place("down", narrow, ["A>C"], tight);

    expect(boxes(placement)).toEqual({ A: [3, 2, 10, 30], B: [16, 2, 10, 30], C: [3, 40, 10, 30] });
    expect([placement.width, placement.height]).toEqual([29, 72]);
  });

  test("is the padding at the outside and the gap between nodes inside, whichever is larger", () => {
    const apart = place(
      "down",
      [leaf("A", 50, 30, { row: 0, column: 0 }), leaf("B", 50, 30, { row: 5, column: 0 })],
      [],
      { ...spacing, nodeGap: 5, padding: 30 },
    );

    expect(boxes(apart)).toEqual({ A: [30, 30, 50, 30], B: [30, 65, 50, 30] });
  });

  test("keeps the middle of a short row clear of the rows on both its sides", () => {
    const column = place(
      "down",
      [
        leaf("A", 50, 100, { row: 0, column: 0 }),
        leaf("B", 50, 6, { row: 1, column: 0 }),
        leaf("C", 50, 100, { row: 2, column: 0 }),
      ],
      ["C>C"],
      { ...spacing, nodeGap: 0, padding: 0 },
    );

    expect(boxes(column)).toEqual({ A: [0, 0, 50, 100], B: [0, 105, 50, 6], C: [0, 127, 50, 100] });
  });

  test("is as long as the shortest stretch where an edge runs straight through it", () => {
    const through = place("down", [leaf("A", 50, 30), leaf("B", 50, 30)], ["A>B"], {
      ...tight,
      minSegment: 12,
    });

    expect(paths(through)).toEqual({
      "A>B #0": [
        [27, 32],
        [27, 44],
      ],
    });
  });
});

describe("placeGraph: edges and groups", () => {
  const nested = place(
    "down",
    [group("G", "right", [leaf("A", 50, 30), leaf("B", 50, 30)]), leaf("C", 50, 30)],
    ["A>C", "A>B", "G>C", "C>G"],
  );

  test("draws an edge between two nodes of a group inside the group, and an edge to the group at its border", () => {
    expect(boxes(nested)).toEqual({
      G: [10, 16, 140, 50],
      A: [20, 26, 50, 30],
      B: [90, 26, 50, 30],
      C: [55, 86, 50, 30],
    });
    expect(paths(nested)).toEqual({
      "A>B #1": [
        [70, 41],
        [90, 41],
      ],
      "G>C #2": [
        [80, 66],
        [80, 86],
      ],
      "C>G #3": [
        [80, 116],
        [80, 124],
        [158, 124],
        [158, 8],
        [80, 8],
        [80, 16],
      ],
    });
  });

  test("lists the edges it draws in the order of the graph, whichever grid each is in", () => {
    expect(nested.edges.map(({ id }) => id)).toEqual(["A>B #1", "G>C #2", "C>G #3"]);
  });

  test("makes a group larger by the lanes inside it", () => {
    const looping = place(
      "down",
      [group("G", "down", [leaf("A", 50, 30), leaf("B", 50, 30)])],
      ["A>B", "B>A"],
    );

    expect(boxes(looping)).toEqual({
      G: [10, 10, 76, 112],
      A: [20, 26, 50, 30],
      B: [20, 76, 50, 30],
    });
    expect(paths(looping)["B>A #1"]).toEqual([
      [45, 106],
      [45, 114],
      [78, 114],
      [78, 18],
      [45, 18],
      [45, 26],
    ]);
  });
});

const pair = (): [GraphNode, GraphNode] => [leaf("A", 50, 30), leaf("B", 50, 30)];

const row = (): [GraphNode, GraphNode] => [
  leaf("A", 50, 30, { row: 0, column: 0 }),
  leaf("B", 50, 30, { row: 0, column: 1 }),
];

/** The placement, once `verify` has found nothing broken in it. */
const checked = (placement: Layout, kept: Spacing = spacing): Layout => {
  expect(verify(placement, kept)).toEqual([]);
  return placement;
};

describe("placeGraph: an edge into or out of a group that flows as the grid around it does", () => {
  test("runs on through the middle of the group's side into a node of its first row", () => {
    const placement = checked(
      place("down", [leaf("C", 50, 30), group("G", "down", pair())], ["A>B", "C>A"]),
    );

    expect(boxes(placement)).toEqual({
      C: [20, 10, 50, 30],
      G: [10, 60, 70, 106],
      A: [20, 76, 50, 30],
      B: [20, 126, 50, 30],
    });
    expect(paths(placement)["C>A #1"]).toEqual([
      [45, 40],
      [45, 76],
    ]);
  });

  test("turns in a lane of its own before the first row, the nearest to the border, to a node that is not below the middle of the side", () => {
    const placement = checked(
      place("down", [leaf("C", 50, 30), group("G", "down", row())], ["B>A", "C>A", "C>B"]),
    );

    expect(boxes(placement)).toEqual({
      C: [55, 10, 50, 30],
      G: [10, 60, 140, 70],
      A: [20, 84, 50, 30],
      B: [90, 84, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "B>A #0": [
        [115, 114],
        [115, 122],
        [80, 122],
        [80, 76],
        [45, 76],
        [45, 84],
      ],
      "C>A #1": [
        [80, 40],
        [80, 68],
        [45, 68],
        [45, 84],
      ],
      "C>B #2": [
        [80, 40],
        [80, 68],
        [115, 68],
        [115, 84],
      ],
    });
  });

  test("goes around to a node further in, through the corridor beside it and along the lane before it", () => {
    const placement = checked(
      place("down", [leaf("C", 50, 30), group("G", "down", pair())], ["A>B", "C>B"]),
    );

    expect(boxes(placement)).toEqual({
      C: [23, 10, 50, 30],
      G: [10, 60, 76, 106],
      A: [26, 76, 50, 30],
      B: [26, 126, 50, 30],
    });
    expect(paths(placement)["C>B #1"]).toEqual([
      [48, 40],
      [48, 68],
      [18, 68],
      [18, 116],
      [51, 116],
      [51, 126],
    ]);
  });

  test("goes around on the side of the middle column, and before the middle column itself", () => {
    const three = (): [GraphNode, ...GraphNode[]] => [
      leaf("A", 50, 30, { row: 0, column: 0 }),
      leaf("B", 50, 30, { row: 0, column: 1 }),
      leaf("C", 50, 30, { row: 0, column: 2 }),
      leaf("D", 50, 30, { row: 1, column: 0 }),
      leaf("E", 50, 30, { row: 1, column: 1 }),
      leaf("F", 50, 30, { row: 1, column: 2 }),
    ];
    const placement = checked(
      place("down", [leaf("X", 50, 30), group("G", "down", three())], ["X>D", "X>E", "X>F"]),
    );

    expect(paths(placement)).toEqual({
      "X>D #0": [
        [115, 40],
        [115, 68],
        [80, 68],
        [80, 114],
        [45, 114],
        [45, 132],
      ],
      "X>E #1": [
        [115, 40],
        [115, 68],
        [80, 68],
        [80, 119],
        [115, 119],
        [115, 132],
      ],
      "X>F #2": [
        [115, 40],
        [115, 68],
        [150, 68],
        [150, 124],
        [185, 124],
        [185, 132],
      ],
    });
  });

  test("runs on from a node of the last row through the middle of the group's side", () => {
    const placement = checked(
      place("down", [group("G", "down", pair()), leaf("D", 50, 30)], ["A>B", "B>D"]),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 70, 106],
      A: [20, 20, 50, 30],
      B: [20, 70, 50, 30],
      D: [20, 136, 50, 30],
    });
    expect(paths(placement)["B>D #1"]).toEqual([
      [45, 100],
      [45, 136],
    ]);
  });

  test("runs on straight from a node narrower than its column, whose middle is not a round number", () => {
    const placement = checked(
      place(
        "down",
        [group("G", "down", [leaf("A", 50.4, 30), leaf("B", 30.8, 30)]), leaf("D", 50, 30)],
        ["A>B", "B>D"],
      ),
    );

    expect(paths(placement)["B>D #1"]).toEqual([
      [45.2, 100],
      [45.2, 136],
    ]);
  });

  test("asks no more than the padding before the first row of a group it only goes out of", () => {
    const thin = { ...spacing, padding: 2 };
    const placement = checked(
      place("down", [group("G", "down", [leaf("A", 50, 30)]), leaf("D", 50, 30)], ["A>D"], thin),
      thin,
    );

    expect(boxes(placement)["A"]).toEqual([4, 4, 50, 30]);
  });

  test("turns in a lane of its own after the last row, the nearest to the border, from a node that is not above the middle of the side", () => {
    const placement = checked(
      place("down", [group("G", "down", row()), leaf("D", 50, 30)], ["B>A", "A>D", "B>D"]),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 140, 70],
      A: [20, 26, 50, 30],
      B: [90, 26, 50, 30],
      D: [55, 100, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "B>A #0": [
        [115, 56],
        [115, 64],
        [80, 64],
        [80, 18],
        [45, 18],
        [45, 26],
      ],
      "A>D #1": [
        [45, 56],
        [45, 72],
        [80, 72],
        [80, 100],
      ],
      "B>D #2": [
        [115, 56],
        [115, 72],
        [80, 72],
        [80, 100],
      ],
    });
  });

  test("goes around from a node further back, along its own lane and through the corridor beside it", () => {
    const placement = checked(
      place("down", [group("G", "down", pair()), leaf("D", 50, 30)], ["A>B", "A>D"]),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 76, 106],
      A: [26, 20, 50, 30],
      B: [26, 70, 50, 30],
      D: [23, 136, 50, 30],
    });
    expect(paths(placement)["A>D #1"]).toEqual([
      [51, 50],
      [51, 60],
      [18, 60],
      [18, 108],
      [48, 108],
      [48, 136],
    ]);
  });

  test("runs between nodes of two groups, out of one and into the other", () => {
    const placement = checked(
      place(
        "right",
        [group("G", "right", pair()), group("H", "right", [leaf("C", 50, 30), leaf("D", 50, 30)])],
        ["A>B", "C>D", "A>D", "B>C"],
      ),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 146, 62],
      A: [20, 26, 50, 30],
      B: [90, 26, 50, 30],
      H: [176, 10, 146, 62],
      C: [192, 26, 50, 30],
      D: [262, 26, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>B #0": [
        [70, 41],
        [90, 41],
      ],
      "C>D #1": [
        [242, 41],
        [262, 41],
      ],
      "A>D #2": [
        [70, 41],
        [80, 41],
        [80, 18],
        [148, 18],
        [148, 41],
        [184, 41],
        [184, 18],
        [252, 18],
        [252, 41],
        [262, 41],
      ],
      "B>C #3": [
        [140, 41],
        [192, 41],
      ],
    });
  });

  test("goes back around the group into a node inside it", () => {
    const placement = checked(
      place("down", [group("G", "down", pair()), leaf("D", 50, 30)], ["A>B", "G>D", "D>A"]),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 16, 70, 106],
      A: [20, 32, 50, 30],
      B: [20, 82, 50, 30],
      D: [20, 142, 50, 30],
    });
    expect(paths(placement)["D>A #2"]).toEqual([
      [45, 172],
      [45, 180],
      [88, 180],
      [88, 8],
      [45, 8],
      [45, 32],
    ]);
  });

  test("shares the stretch through the border with an edge into another node of the group", () => {
    const placement = checked(
      place(
        "down",
        [leaf("C", 50, 30), leaf("D", 50, 30), group("G", "down", pair())],
        ["A>B", "C>A", "D>B"],
      ),
    );

    expect(boxes(placement)).toEqual({
      C: [26, 10, 50, 30],
      D: [112, 10, 50, 30],
      G: [10, 60, 82, 106],
      A: [26, 76, 50, 30],
      B: [26, 126, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>B #0": [
        [51, 106],
        [51, 126],
      ],
      "C>A #1": [
        [51, 40],
        [51, 76],
      ],
      "D>B #2": [
        [137, 40],
        [137, 50],
        [51, 50],
        [51, 68],
        [18, 68],
        [18, 116],
        [51, 116],
        [51, 126],
      ],
    });
  });

  test("passes the point where an edge to the group itself ends", () => {
    const placement = checked(
      place(
        "down",
        [leaf("C", 50, 30), leaf("D", 50, 30), group("G", "down", [leaf("A", 50, 30)])],
        ["D>G", "C>A"],
      ),
    );

    expect(boxes(placement)).toEqual({
      C: [20, 10, 50, 30],
      D: [100, 10, 50, 30],
      G: [10, 60, 70, 56],
      A: [20, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "D>G #0": [
        [125, 40],
        [125, 50],
        [45, 50],
        [45, 60],
      ],
      "C>A #1": [
        [45, 40],
        [45, 76],
      ],
    });
  });

  test("comes in beside the nodes of the group in a lane before the lane of a node of the group that goes out there", () => {
    const placement = checked(
      place(
        "down",
        [
          group("G", "down", [leaf("A", 50, 30), leaf("B", 50, 30), leaf("C", 50, 30)]),
          leaf("D", 50, 30),
        ],
        ["A>B", "B>C", "A>D", "D>C"],
      ),
    );

    expect(paths(placement)["A>D #2"]).toEqual([
      [56, 62],
      [56, 72],
      [23, 72],
      [23, 170],
      [50.5, 170],
      [50.5, 198],
    ]);
    expect(paths(placement)["D>C #3"]).toEqual([
      [50.5, 228],
      [50.5, 236],
      [99, 236],
      [99, 8],
      [50.5, 8],
      [50.5, 24],
      [18, 24],
      [18, 122],
      [56, 122],
      [56, 132],
    ]);
  });

  test.each([["G>A"], ["B>G"]])(
    "is left out between the group and a node inside it, as %s",
    (link) => {
      const placement = place("down", [group("G", "down", pair())], ["A>B", link]);

      expect(paths(placement)).toEqual({
        "A>B #0": [
          [45, 50],
          [45, 70],
        ],
      });
    },
  );

  test("is drawn to a group inside the group as to any node of it", () => {
    const placement = checked(
      place(
        "down",
        [leaf("C", 50, 30), group("G", "down", [group("H", "right", [leaf("A", 50, 30)])])],
        ["C>H", "C>A"],
      ),
    );

    expect(paths(placement)).toEqual({
      "C>H #0": [
        [55, 40],
        [55, 76],
      ],
    });
  });
});

/** A group of three nodes in a row, as wide as given. */
const columns = (...widths: [number, number, number]): GraphNode =>
  group("G", "down", [
    leaf("A", widths[0], 30, { row: 0, column: 0 }),
    leaf("B", widths[1], 30, { row: 0, column: 1 }),
    leaf("C", widths[2], 30, { row: 0, column: 2 }),
  ]);

describe("placeGraph: the middle of a group's side that edges cross", () => {
  test("is left where it is when it is the gap between edges and the shortest stretch from the line an edge turns onto", () => {
    const placement = place("down", [leaf("X", 50, 30), columns(40, 50, 56)], ["X>B"]);

    expect(boxes(placement)["G"]).toEqual([10, 60, 206, 56]);
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [113, 40],
        [113, 68],
        [105, 68],
        [105, 76],
      ],
    });
  });

  test("is moved that far from the line when that is the least move, by room after the last column", () => {
    const placement = place("down", [leaf("X", 50, 30), columns(40, 50, 50)], ["X>B"]);

    expect(verify(placement, spacing)).toEqual([]);
    expect(boxes(placement)).toEqual({
      X: [88, 10, 50, 30],
      G: [10, 60, 206, 56],
      A: [20, 76, 40, 30],
      B: [80, 76, 50, 30],
      C: [150, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [113, 40],
        [113, 68],
        [105, 68],
        [105, 76],
      ],
    });
  });

  test("is moved onto the line when that is the least move, by room before the first column", () => {
    const placement = place("down", [leaf("X", 50, 30), columns(40, 50, 46)], ["X>B"]);

    expect(verify(placement, spacing)).toEqual([]);
    expect(boxes(placement)).toEqual({
      X: [86, 10, 50, 30],
      G: [10, 60, 202, 56],
      A: [26, 76, 40, 30],
      B: [86, 76, 50, 30],
      C: [156, 76, 46, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [111, 40],
        [111, 76],
      ],
    });
  });

  test("is moved onto the line by room after the last column when the line lies past it", () => {
    const placement = place("down", [leaf("X", 50, 30), columns(46, 50, 40)], ["X>B"]);

    expect(verify(placement, spacing)).toEqual([]);
    expect(boxes(placement)).toEqual({
      X: [86, 10, 50, 30],
      G: [10, 60, 202, 56],
      A: [20, 76, 46, 30],
      B: [86, 76, 50, 30],
      C: [156, 76, 40, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [111, 40],
        [111, 76],
      ],
    });
  });

  test("is moved onto the line when that is no further than moving it clear", () => {
    const placement = place("down", [leaf("X", 50, 30), columns(40, 50, 48)], ["X>B"]);

    expect(boxes(placement)["G"]).toEqual([10, 60, 206, 56]);
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [113, 40],
        [113, 76],
      ],
    });
  });

  test("is kept the larger of the gap between edges and the shortest stretch from the line", () => {
    const wide = { ...spacing, edgeGap: 12, minSegment: 3 };
    const placement = place("down", [leaf("X", 50, 30), columns(40, 50, 50)], ["X>B"], wide);

    expect(verify(placement, wide)).toEqual([]);
    expect(boxes(placement)["G"]).toEqual([10, 60, 210, 64]);
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [115, 40],
        [115, 84],
      ],
    });
  });

  test("is moved clear of the line by a distance that is not a round number", () => {
    const uneven = { ...spacing, minSegment: 8.1 };
    const placement = place("down", [leaf("X", 50, 30), columns(40.1, 50, 52.25)], ["X>B"], uneven);

    expect(verify(placement, uneven)).toEqual([]);
    expect(
      paths(placement)["X>B #0"]?.map((point) => point.map((value) => Number(value.toFixed(6)))),
    ).toEqual([
      [113.2, 40],
      [113.2, 68.1],
      [105.1, 68.1],
      [105.1, 76.2],
    ]);
  });

  test("moves the lanes beside the columns with them", () => {
    const placement = place(
      "down",
      [
        leaf("X", 50, 30),
        group("G", "down", [
          leaf("A", 40, 30, { row: 0, column: 0 }),
          leaf("B", 50, 30, { row: 0, column: 1 }),
          leaf("C", 46, 30, { row: 0, column: 2 }),
          leaf("D", 50, 30, { row: 1, column: 1 }),
        ]),
      ],
      ["X>B", "D>B"],
    );

    expect(verify(placement, spacing)).toEqual([]);
    expect(boxes(placement)["A"]).toEqual([26, 84, 40, 30]);
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [111, 40],
        [111, 84],
      ],
      "D>B #1": [
        [111, 164],
        [111, 172],
        [146, 172],
        [146, 76],
        [111, 76],
        [111, 84],
      ],
    });
  });

  test("is moved past a nearer place that is too near another line", () => {
    const placement = place(
      "down",
      [leaf("X", 50, 30), group("G", "down", [leaf("A", 10, 30), leaf("B", 10, 30)])],
      ["A>B", "X>A", "X>B"],
    );

    expect(verify(placement, spacing)).toEqual([]);
    expect(boxes(placement)["G"]).toEqual([14, 60, 42, 106]);
    expect(paths(placement)).toEqual({
      "A>B #0": [
        [35, 106],
        [35, 126],
      ],
      "X>A #1": [
        [35, 40],
        [35, 76],
      ],
      "X>B #2": [
        [35, 40],
        [35, 68],
        [22, 68],
        [22, 116],
        [35, 116],
        [35, 126],
      ],
    });
  });

  test("is moved onto a line that another lies exactly that distance from", () => {
    const even = { nodeGap: 20, padding: 5, edgeToNode: 5, edgeGap: 8, minSegment: 5 };
    const placement = place(
      "down",
      [
        leaf("X", 50, 30),
        group("G", "down", [leaf("A", 10, 30), leaf("B", 10, 30)]),
        leaf("Y", 50, 30),
      ],
      ["A>B", "X>B", "A>Y"],
      even,
    );

    expect(verify(placement, even)).toEqual([]);
    expect(boxes(placement)["G"]).toEqual([7, 55, 46, 116]);
    expect(paths(placement)).toEqual({
      "A>B #0": [
        [43, 101],
        [43, 125],
      ],
      "X>B #1": [
        [30, 35],
        [30, 63],
        [22, 63],
        [22, 117],
        [43, 117],
        [43, 125],
      ],
      "A>Y #2": [
        [43, 101],
        [43, 109],
        [30, 109],
        [30, 191],
      ],
    });
  });

  test("is moved for an edge that goes out as for one that comes in", () => {
    const placement = place("down", [columns(50, 50, 40), leaf("X", 50, 30)], ["B>X"]);

    expect(verify(placement, spacing)).toEqual([]);
    expect(boxes(placement)["G"]).toEqual([10, 10, 206, 56]);
    expect(paths(placement)).toEqual({
      "B>X #0": [
        [121, 50],
        [121, 58],
        [113, 58],
        [113, 86],
      ],
    });
  });
});

describe("placeGraph: a corridor between two groups that an edge runs straight through", () => {
  const tight = { nodeGap: 2, padding: 10, edgeToNode: 5, edgeGap: 12, minSegment: 3 };
  const stacked = (links: string[]) =>
    place(
      "down",
      [group("G", "down", [leaf("A", 50, 30)]), group("H", "down", [leaf("B", 50, 30)])],
      links,
      tight,
    );

  test.each([
    ["starts inside the first", "A>H"],
    ["ends inside the second", "G>B"],
  ])("is as long as the gap between edges when the edge %s", (_, link) => {
    const { G, H } = boxes(stacked([link]));

    expect((H?.[1] ?? 0) - ((G?.[1] ?? 0) + (G?.[3] ?? 0))).toBe(12);
  });

  test("keeps an edge out of the first group and an edge into the second that gap apart", () => {
    const placement = stacked(["A>H", "G>B"]);

    expect(verify(placement, tight)).toEqual([]);
    expect(paths(placement)).toEqual({
      "A>H #0": [
        [45, 50],
        [45, 86],
      ],
      "G>B #1": [
        [45, 74],
        [45, 110],
      ],
    });
  });

  test("is only as long as the shortest stretch when the edge joins the groups themselves", () => {
    expect(boxes(stacked(["G>H"]))["H"]).toEqual([10, 63, 70, 50]);
  });
});

describe("placeGraph: a graph that cannot be laid out", () => {
  test.each([
    ["two nodes with one id", graph("down", [leaf("A", 50, 30), leaf("A", 50, 30)]), '"A"'],
    [
      "a child with the id of a node outside its group",
      graph("down", [leaf("A", 50, 30), group("G", "down", [leaf("A", 50, 30)])]),
      '"A"',
    ],
    [
      "a child with the id of its group",
      graph("down", [group("G", "down", [leaf("G", 50, 30)])]),
      '"G"',
    ],
    ["an edge from a missing node", graph("down", [leaf("A", 50, 30)], ["X>A"]), '"X"'],
    ["an edge to a missing node", graph("down", [leaf("A", 50, 30)], ["A>Y"]), '"Y"'],
    [
      "two nodes in one cell",
      graph("down", [
        leaf("A", 50, 30, { row: 1, column: 2 }),
        leaf("B", 50, 30, { row: 1, column: 2 }),
      ]),
      '"A" and "B" are both put in row 1, column 2',
    ],
    [
      "two children in one cell",
      graph("down", [
        group("G", "down", [
          leaf("A", 50, 30, { row: 0, column: 0 }),
          leaf("B", 50, 30, { row: 0, column: 0 }),
        ]),
      ]),
      '"A" and "B"',
    ],
    ["a negative row", graph("down", [leaf("A", 50, 30, { row: -1, column: 0 })]), "row -1"],
    ["a negative column", graph("down", [leaf("A", 50, 30, { row: 0, column: -1 })]), "column -1"],
    ["a row between two rows", graph("down", [leaf("A", 50, 30, { row: 0.5, column: 0 })]), "0.5"],
    [
      "a column between two columns",
      graph("down", [leaf("A", 50, 30, { row: 0, column: 1.5 })]),
      "1.5",
    ],
    [
      "a row that is not a number",
      graph("down", [leaf("A", 50, 30, { row: Number.NaN, column: 0 })]),
      "NaN",
    ],
    [
      "a group in a cell that is not one",
      graph("down", [group("G", "down", [leaf("A", 50, 30)], { row: -1, column: 0 })]),
      '"G"',
    ],
    ["a negative width", graph("down", [leaf("A", -1, 30)]), 'width of node "A" is -1'],
    ["a negative height", graph("down", [leaf("A", 50, -1)]), 'height of node "A" is -1'],
    ["a width that is not a number", graph("down", [leaf("A", Number.NaN, 30)]), "NaN"],
    ["a height without end", graph("down", [leaf("A", 50, Number.POSITIVE_INFINITY)]), "Infinity"],
    [
      "a child of no size",
      graph("down", [group("G", "down", [leaf("A", 50, Number.NaN)])]),
      'height of node "A"',
    ],
  ])("refuses %s", (_, broken, said) => {
    expect(() => placeGraph(broken, spacing)).toThrow(InvalidGraphError);
    expect(() => placeGraph(broken, spacing)).toThrow(said);
  });

  test.each([
    ["a negative gap between nodes", { nodeGap: -1 }, "nodeGap is -1"],
    ["a gap between nodes that is not a number", { nodeGap: Number.NaN }, "nodeGap is NaN"],
    ["a negative padding", { padding: -1 }, "padding is -1"],
    ["a padding without end", { padding: Number.POSITIVE_INFINITY }, "padding is Infinity"],
    ["a negative clearance around nodes", { edgeToNode: -1 }, "edgeToNode is -1"],
    ["a negative gap between edges", { edgeGap: -1 }, "edgeGap is -1"],
    ["a negative shortest stretch", { minSegment: -1 }, "minSegment is -1"],
  ])("refuses %s", (_, wrong, said) => {
    expect(() => placeGraph(graph("down", []), { ...spacing, ...wrong })).toThrow(said);
  });

  test("accepts a node of no size that no edge meets, and a spacing of nothing", () => {
    expect(
      placeGraph(graph("down", [leaf("A", 0, 0), leaf("B", 50, 30)]), {
        ...spacing,
        nodeGap: 0,
        padding: 0,
      }),
    ).toEqual({
      width: 50,
      height: 30,
      nodes: [
        { id: "A", box: { x: 0, y: 15, width: 0, height: 0 }, children: [] },
        { id: "B", box: { x: 0, y: 0, width: 50, height: 30 }, children: [] },
      ],
      edges: [],
    });
  });

  test("refuses two edges with one id", () => {
    const twice: Graph = {
      direction: "down",
      nodes: [leaf("A", 50, 30), leaf("B", 50, 30)],
      edges: [
        { id: "E", from: "A", to: "B" },
        { id: "E", from: "B", to: "A" },
      ],
    };

    expect(() => placeGraph(twice, spacing)).toThrow(InvalidGraphError);
    expect(() => placeGraph(twice, spacing)).toThrow('"E"');
  });
});

describe("placeGraph: a node too small for its edges", () => {
  test.each([
    ["down", leaf("N", 9, 30)],
    ["right", leaf("N", 30, 9)],
  ] as const)(
    "is refused when it is narrower across a flow %s than twice the clearance",
    (direction, narrow) => {
      const meeting = () => place(direction, [leaf("A", 50, 30), narrow], ["A>N"]);

      expect(meeting).toThrow(InvalidGraphError);
      expect(meeting).toThrow('"N" is 9 across');
    },
  );

  test("is refused when the edge it is too narrow for leaves it", () => {
    expect(() => place("down", [leaf("N", 9, 30), leaf("B", 50, 30)], ["N>B"])).toThrow(
      '"N" is 9 across',
    );
  });

  test.each([
    ["down", leaf("N", 50, 4)],
    ["right", leaf("N", 4, 50)],
  ] as const)(
    "is refused when it is shorter along a flow %s than the gap between the edges on both its sides",
    (direction, short) => {
      const through = () =>
        place(direction, [leaf("A", 50, 30), short, leaf("C", 50, 30)], ["A>N", "N>C"]);

      expect(through).toThrow(InvalidGraphError);
      expect(through).toThrow('"N" is 4 long');
    },
  );

  test("is measured across against the clearance and along against the gap between edges", () => {
    const uneven = { ...spacing, edgeToNode: 3, edgeGap: 7 };
    const chain = (width: number, height: number) => () =>
      place(
        "down",
        [leaf("A", width, height), leaf("B", width, height), leaf("C", width, height)],
        ["A>B", "B>C"],
        uneven,
      );

    expect(chain(6, 7)).not.toThrow();
    expect(chain(5, 7)).toThrow(
      '"A" is 5 across where its edges meet it, too narrow for an edge to keep 3 from',
    );
    expect(chain(6, 6)).toThrow(
      '"B" is 6 long between the edges that enter it and the edges that leave it, less than the gap of 7',
    );
  });

  test("is accepted at exactly twice the clearance across and the gap between edges along", () => {
    const exact = place(
      "down",
      [leaf("A", 10, 5), leaf("B", 10, 5), leaf("C", 10, 5)],
      ["A>B", "B>C"],
    );

    expect(boxes(exact)).toEqual({ A: [10, 10, 10, 5], B: [10, 35, 10, 5], C: [10, 60, 10, 5] });
  });

  test("is accepted however short when edges only enter it, or only leave it", () => {
    const ends = place("down", [leaf("A", 50, 2), leaf("B", 50, 2)], ["A>B"]);

    expect(paths(ends)).toEqual({
      "A>B #0": [
        [35, 12],
        [35, 32],
      ],
    });
  });

  test("is accepted however small when no edge that is drawn meets it", () => {
    const apart = place(
      "down",
      [group("G", "right", [leaf("N", 1, 1)]), leaf("B", 50, 30)],
      ["N>B", "B>N"],
    );

    expect(paths(apart)).toEqual({});
  });

  test.each([
    ["comes into its group to it", "B>N"],
    ["goes out of its group from it", "N>B"],
  ])("is refused when the edge it is too narrow for %s", (_, link) => {
    expect(() =>
      place("down", [group("G", "down", [leaf("N", 9, 30)]), leaf("B", 50, 30)], [link]),
    ).toThrow(
      new InvalidGraphError(
        'Node "N" is 9 across where its edges meet it, too narrow for an edge to keep 5 from its corners.',
      ),
    );
  });

  test("is refused when an edge comes into its group to it and another goes out from it, and it is too short between them", () => {
    expect(() =>
      place(
        "down",
        [leaf("B", 50, 30), group("G", "down", [leaf("N", 50, 4)]), leaf("C", 50, 30)],
        ["B>N", "N>C"],
      ),
    ).toThrow(
      new InvalidGraphError(
        'Node "N" is 4 long between the edges that enter it and the edges that leave it, less than the gap of 5 between edges.',
      ),
    );
  });
});

/** The node with every leaf in it made `by` wider and taller. */
const widenedNode = (node: GraphNode, by: number): GraphNode => {
  if (!("children" in node)) {
    return { ...node, size: { width: node.size.width + by, height: node.size.height + by } };
  }
  const [first, ...rest] = node.children;
  return {
    ...node,
    children: [widenedNode(first, by), ...rest.map((child) => widenedNode(child, by))],
  };
};

/** The graph with room on every leaf for edges `edgeGap` apart that keep `edgeToNode` from its corners. */
const roomy = (any: Graph, { edgeGap, edgeToNode }: Spacing): Graph => ({
  ...any,
  nodes: any.nodes.map((node) => widenedNode(node, Math.max(edgeGap, edgeToNode * 2))),
});

describe("placeGraph: any graph", () => {
  const spacings = fc.record({
    nodeGap: fc.double({ min: 0, max: 60, noNaN: true }),
    padding: fc.double({ min: 0, max: 40, noNaN: true }),
    edgeToNode: fc.double({ min: 0.5, max: 30, noNaN: true }),
    edgeGap: fc.double({ min: 0.5, max: 30, noNaN: true }),
    minSegment: fc.double({ min: 0.5, max: 30, noNaN: true }),
  });

  test("is laid out with nothing broken", () => {
    fc.assert(
      fc.property(graphs, spacings, (any, anySpacing) => {
        expect(verify(placeGraph(roomy(any, anySpacing), anySpacing), anySpacing)).toEqual([]);
      }),
      { numRuns: 500 },
    );
  });

  test("keeps every node, its nesting and its size", () => {
    const shapeOf = (node: GraphNode): unknown =>
      "children" in node
        ? { id: node.id, children: node.children.map(shapeOf) }
        : { id: node.id, size: node.size, children: [] };
    const placedShapeOf = (node: PlacedNode): unknown =>
      node.children.length > 0
        ? { id: node.id, children: node.children.map(placedShapeOf) }
        : { id: node.id, size: { width: node.box.width, height: node.box.height }, children: [] };

    fc.assert(
      fc.property(graphs, (any) => {
        const sized = roomy(any, spacing);
        expect(placeGraph(sized, spacing).nodes.map(placedShapeOf)).toEqual(
          sized.nodes.map(shapeOf),
        );
      }),
    );
  });

  test("puts a top-level node past every earlier top-level node that leads to it, unless it names its cell", () => {
    const idsIn = (node: GraphNode): string[] =>
      "children" in node ? [node.id, ...node.children.flatMap(idsIn)] : [node.id];

    fc.assert(
      fc.property(graphs, (any) => {
        const placed = placeGraph(roomy(any, spacing), spacing).nodes;
        const top = any.nodes.map((node, index) => ({
          pinned: node.cell !== undefined,
          index,
          ids: idsIn(node),
        }));
        const gaps = any.edges.flatMap((edge) => {
          const from = top.find(({ ids }) => ids.includes(edge.from));
          const to = top.find(({ ids }) => ids.includes(edge.to));
          const before = placed[from?.index ?? -1]?.box;
          const after = placed[to?.index ?? -1]?.box;
          if (
            from === undefined ||
            to === undefined ||
            before === undefined ||
            after === undefined
          ) {
            return [];
          }
          if (from.index >= to.index || to.pinned) {
            return [];
          }
          return any.direction === "down"
            ? [after.y - (before.y + before.height)]
            : [after.x - (before.x + before.width)];
        });
        expect(gaps.filter((gap) => gap < spacing.nodeGap - 1e-6)).toEqual([]);
      }),
    );
  });

  test("draws the edges that cross the border of no group, or of one at either end that flows as the grid around it does, and no others, in the order they are listed", () => {
    interface Where {
      /** The groups around the node, outermost first. */
      readonly around: readonly string[];
      /** The way the grid the node is in flows. */
      readonly flow: Direction;
      /** The way the node's own grid flows, when it is a group. */
      readonly direction: Direction | undefined;
    }
    const whereIn = (
      nodes: readonly GraphNode[],
      flow: Direction,
      around: readonly string[] = [],
    ): [string, Where][] =>
      nodes.flatMap((node): [string, Where][] =>
        "children" in node
          ? [
              [node.id, { around, flow, direction: node.direction }],
              ...whereIn(node.children, node.direction, [...around, node.id]),
            ]
          : [[node.id, { around, flow, direction: undefined }]],
      );

    fc.assert(
      fc.property(graphs, (any) => {
        const where = new Map(whereIn(any.nodes, any.direction));
        const expected = any.edges.filter((edge) => {
          const from = where.get(edge.from)?.around ?? [];
          const to = where.get(edge.to)?.around ?? [];
          let shared = 0;
          while (shared < from.length && from[shared] === to[shared]) {
            shared += 1;
          }
          const outOf = from.slice(shared);
          const into = to.slice(shared);
          return (
            outOf.length <= 1 &&
            into.length <= 1 &&
            !outOf.includes(edge.to) &&
            !into.includes(edge.from) &&
            [...outOf, ...into].every((id) => where.get(id)?.direction === where.get(id)?.flow)
          );
        });
        const drawn = placeGraph(roomy(any, spacing), spacing).edges;
        expect(drawn.map(({ id, from, to }) => ({ id, from, to }))).toEqual(expected);
      }),
    );
  });
});
