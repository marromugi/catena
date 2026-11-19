import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { branchPoints } from "../edge";
import type { Layout, PlacedNode, Point, Rect, Spacing } from "../layout";
import { verify } from "../verify";
import { graphs } from "./graph.arbitrary";
import { InvalidGraphError, placeGraph } from "./index";
import type { Cell, Direction, Graph, GraphNode, Leaf } from "./index";

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
    ["out of the group", "A>C", [10, 10, 96, 126], [33, 156, 50, 30]],
    ["from the group itself", "G>C", [10, 10, 90, 120], [30, 150, 50, 30]],
    ["out of a group inside it", "B>C", [10, 10, 102, 132], [36, 162, 50, 30]],
  ])("is put before a node that an edge %s leads to", (_, link, groupBox, nodeBox) => {
    const placement = place(
      "down",
      [
        group("G", "right", [leaf("A", 50, 30), group("H", "down", [leaf("B", 50, 30)])]),
        leaf("C", 50, 30),
      ],
      [link],
    );
    expect(boxes(placement)["G"]).toEqual(groupBox);
    expect(boxes(placement)["C"]).toEqual(nodeBox);
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
      C: [16, 26, 50, 30],
      G: [86, 10, 152, 62],
      A: [102, 26, 50, 30],
      B: [172, 26, 50, 30],
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

describe("placeGraph: a leaf that lines up by a part of it", () => {
  // A 40 by 40 square at the top, centred over a caption 60 wide, 100 high in all.
  const tile: GraphNode = {
    id: "T",
    size: { width: 60, height: 100 },
    lineUp: { middle: { x: 30, y: 20 }, edgeBox: { x: 10, y: 0, width: 40, height: 100 } },
  };

  test("sits with its part's middle on the middle line of its row, beside a node that flows right", () => {
    const placed = place("right", [tile, leaf("C", 80, 30)], ["T>C"]);

    expect(boxes(placed)).toEqual({ T: [10, 10, 60, 100], C: [90, 15, 80, 30] });
    expect(paths(placed)).toEqual({
      "T>C #0": [
        [60, 30],
        [90, 30],
      ],
    });
  });

  test("makes its row reach as far before the middle line as the node beside it, and as far after as itself", () => {
    const placed = place("right", [tile, leaf("C", 80, 70)], ["T>C"]);

    expect(placed.height).toBe(135);
    expect(boxes(placed)).toEqual({ T: [10, 25, 60, 100], C: [90, 10, 80, 70] });
    expect(paths(placed)).toEqual({
      "T>C #0": [
        [60, 45],
        [90, 45],
      ],
    });
  });

  test("sits with its part's middle on the middle line of its row, beside a node in a grid that flows down", () => {
    expect(boxes(place("down", [tile, leaf("C", 80, 30)]))).toEqual({
      T: [10, 10, 60, 100],
      C: [90, 15, 80, 30],
    });
  });

  test("is left by its edges below its edge box when the flow is down", () => {
    const placed = place("down", [tile, leaf("D", 80, 30)], ["T>D"]);

    expect(boxes(placed)).toEqual({ T: [20, 10, 60, 100], D: [10, 130, 80, 30] });
    expect(paths(placed)).toEqual({
      "T>D #0": [
        [50, 110],
        [50, 130],
      ],
    });
  });

  test("is entered at the side of its edge box that faces back along the flow", () => {
    expect(paths(place("right", [leaf("C", 80, 30), tile], ["C>T"]))).toEqual({
      "C>T #0": [
        [90, 30],
        [120, 30],
      ],
    });
  });

  test.each([
    { middle: { x: 30, y: 3 }, edgeBox: { x: 0, y: 0, width: 60, height: 100 }, across: 6 },
    { middle: { x: 30, y: 97 }, edgeBox: { x: 0, y: 0, width: 60, height: 100 }, across: 6 },
    { middle: { x: 30, y: 52 }, edgeBox: { x: 0, y: 50, width: 60, height: 50 }, across: 4 },
  ])(
    "is too narrow for its edges when its middle lies nearer than edgeToNode to a side of its edge box: %o",
    ({ middle, edgeBox, across }) => {
      const near: GraphNode = {
        id: "N",
        size: { width: 60, height: 100 },
        lineUp: { middle, edgeBox },
      };

      expect(() => place("right", [near, leaf("C", 80, 30)], ["N>C"])).toThrow(
        new InvalidGraphError(
          `Node "N" is ${across} across where its edges meet it, too narrow for an edge to keep 5 from its corners.`,
        ),
      );
    },
  );

  test("is too short for its edges when its edge box is shorter along the flow than edgeGap", () => {
    const short: GraphNode = {
      id: "N",
      size: { width: 60, height: 100 },
      lineUp: { middle: { x: 30, y: 42 }, edgeBox: { x: 0, y: 40, width: 60, height: 4 } },
    };

    expect(() =>
      place("down", [leaf("A", 20, 20), short, leaf("B", 20, 20)], ["A>N", "N>B"]),
    ).toThrow(
      new InvalidGraphError(
        'Node "N" is 4 long between the edges that enter it and the edges that leave it, less than the gap of 5 between edges.',
      ),
    );
  });

  test.each([
    { middle: { x: 58, y: 10 }, right: { x: 4, y: 10 } },
    { middle: { x: 56, y: 10 }, right: { x: 2, y: 10 } },
  ])(
    "keeps the middle lines of two columns edgeRoom apart, measured from where each column reaches: %o",
    ({ middle, right }) => {
      const whole = { x: 0, y: 0, width: 60, height: 20 };
      const placed = placeGraph(
        graph(
          "down",
          [
            {
              id: "L",
              size: { width: 60, height: 20 },
              cell: { row: 0, column: 0 },
              lineUp: { middle, edgeBox: whole },
            },
            {
              id: "R",
              size: { width: 60, height: 20 },
              cell: { row: 0, column: 1 },
              lineUp: { middle: right, edgeBox: whole },
            },
            leaf("A", 20, 20, { row: 1, column: 2 }),
            leaf("B", 20, 20, { row: 2, column: 2 }),
          ],
          ["A>B"],
        ),
        { nodeGap: 0, padding: 0, edgeToNode: 5, edgeGap: 5, minSegment: 8 },
      );

      expect(boxes(placed)).toEqual({
        L: [0, 0, 60, 20],
        R: [66, 0, 60, 20],
        A: [126, 20, 20, 20],
        B: [126, 48, 20, 20],
      });
    },
  );

  test.each([
    { middle: { x: 30, y: 20 }, edgeBox: { x: 10, y: 0, width: 40, height: 101 } },
    { middle: { x: 30, y: 20 }, edgeBox: { x: -1, y: 0, width: 40, height: 100 } },
    { middle: { x: 30, y: 20 }, edgeBox: { x: 10, y: 0, width: -1, height: 100 } },
    { middle: { x: 5, y: 20 }, edgeBox: { x: 10, y: 0, width: 40, height: 100 } },
    { middle: { x: 30, y: Number.NaN }, edgeBox: { x: 10, y: 0, width: 40, height: 100 } },
    { middle: { x: 30, y: 20 }, edgeBox: { x: 10, y: -1, width: 40, height: 100 } },
    { middle: { x: 30, y: 20 }, edgeBox: { x: 10, y: 0, width: 60, height: 100 } },
    { middle: { x: 30, y: 5 }, edgeBox: { x: 10, y: 10, width: 40, height: 90 } },
  ])("refuses a line-up that does not lie inside the leaf: %o", (lineUp) => {
    expect(() => place("right", [{ ...tile, lineUp }])).toThrow(
      new InvalidGraphError(
        'Node "T" lines up by a box or a middle that lies outside it, or a middle outside that box.',
      ),
    );
  });
});

/** A 40 by 40 square at the top, centred over a caption 60 wide, 100 high in all. */
const captionedTile = (id: string): GraphNode => ({
  id,
  size: { width: 60, height: 100 },
  lineUp: { middle: { x: 30, y: 20 }, edgeBox: { x: 10, y: 0, width: 40, height: 100 } },
});

describe("placeGraph: a group whose child lines up by a part of it", () => {
  test("lines up with the node beside it by its child's part, and an edge into the child runs straight, when the flow is right", () => {
    const placed = place(
      "right",
      [leaf("C", 80, 30), group("G", "right", [captionedTile("T")])],
      ["C>T"],
    );

    expect(boxes(placed)).toEqual({
      C: [10, 25, 80, 30],
      G: [110, 10, 86, 120],
      T: [126, 20, 60, 100],
    });
    expect(paths(placed)).toEqual({
      "C>T #0": [
        [90, 40],
        [136, 40],
      ],
    });
  });

  test("lines up with the node beside it by its child's part when the flow is down", () => {
    expect(
      boxes(
        place("down", [
          group("G", "down", [captionedTile("T")], { row: 0, column: 0 }),
          leaf("C", 80, 30, { row: 0, column: 1 }),
        ]),
      ),
    ).toEqual({ G: [10, 10, 80, 120], T: [20, 20, 60, 100], C: [110, 25, 80, 30] });
  });

  test("lines up by the part of a child of a group inside it", () => {
    const placed = place(
      "right",
      [leaf("C", 80, 30), group("G", "right", [group("H", "right", [captionedTile("T")])])],
      ["C>T"],
    );

    expect(boxes(placed)).toEqual({
      C: [10, 35, 80, 30],
      G: [110, 10, 112, 140],
      H: [126, 20, 86, 120],
      T: [142, 30, 60, 100],
    });
    expect(paths(placed)).toEqual({
      "C>T #0": [
        [90, 50],
        [152, 50],
      ],
    });
  });

  test("lines up by its middle when its children lie side by side across the flow", () => {
    expect(
      boxes(
        place(
          "right",
          [leaf("C", 80, 30), group("G", "right", [captionedTile("T"), captionedTile("U")])],
          ["C>T", "C>U"],
        ),
      ),
    ).toEqual({
      C: [10, 115, 80, 30],
      G: [110, 10, 86, 240],
      T: [126, 20, 60, 100],
      U: [126, 140, 60, 100],
    });
  });

  test("lines up by its child's middle line where the corridors before and after its one row differ", () => {
    const placed = boxes(
      place(
        "down",
        [
          leaf("X", 80, 30, { row: 0, column: 0 }),
          group("G", "down", [captionedTile("T")], { row: 1, column: 0 }),
          leaf("C", 80, 30, { row: 1, column: 1 }),
        ],
        ["X>T"],
      ),
    );
    const [, tileY = 0] = placed.T ?? [];
    const [, cardY = 0, , cardHeight = 0] = placed.C ?? [];

    expect(tileY + 20).toBe(cardY + cardHeight / 2);
  });

  test("lines up by a child whose middle lies after the middle of its box, and keeps its box as large as the child needs", () => {
    const low: GraphNode = {
      id: "T",
      size: { width: 60, height: 100 },
      lineUp: { middle: { x: 30, y: 80 }, edgeBox: { x: 10, y: 0, width: 40, height: 100 } },
    };
    const placed = place("right", [leaf("C", 80, 30), group("G", "right", [low])], ["C>T"]);

    expect(boxes(placed)).toEqual({
      C: [10, 85, 80, 30],
      G: [110, 10, 86, 120],
      T: [126, 20, 60, 100],
    });
    expect(paths(placed)).toEqual({
      "C>T #0": [
        [90, 100],
        [136, 100],
      ],
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

  test("leaves a node and comes back to it beside a group an edge gap a hair more than the clearance away", () => {
    const fine = { nodeGap: 0, padding: 0, edgeToNode: 0.5, edgeGap: 0.500001, minSegment: 0.5 };
    const placement = place(
      "down",
      [group("n0", "down", [leaf("n1", 2, 2), group("n2", "down", [leaf("n3", 2, 2)])])],
      ["n1>n1"],
      fine,
    );

    expect(verify(placement, fine)).toEqual([]);
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

const nestedGraph = (): Layout =>
  place(
    "down",
    [group("G", "right", [leaf("A", 50, 30), leaf("B", 50, 30)]), leaf("C", 50, 30)],
    ["A>C", "A>B", "G>C", "C>G"],
  );

describe("placeGraph: edges and groups", () => {
  test("draws an edge between two nodes of a group inside the group, and an edge to the group at its border", () => {
    const nested = nestedGraph();

    expect(boxes(nested)).toEqual({
      G: [10, 16, 140, 56],
      A: [20, 26, 50, 30],
      B: [90, 26, 50, 30],
      C: [55, 92, 50, 30],
    });
    expect(paths(nested)).toEqual({
      "A>C #0": [
        [70, 41],
        [80, 41],
        [80, 92],
      ],
      "A>B #1": [
        [70, 41],
        [90, 41],
      ],
      "G>C #2": [
        [80, 72],
        [80, 92],
      ],
      "C>G #3": [
        [80, 122],
        [80, 130],
        [158, 130],
        [158, 8],
        [80, 8],
        [80, 16],
      ],
    });
  });

  test("lists the edges it draws in the order of the graph, whichever grid each is in", () => {
    expect(nestedGraph().edges.map(({ id }) => id)).toEqual([
      "A>C #0",
      "A>B #1",
      "G>C #2",
      "C>G #3",
    ]);
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

/** Leaves of 50 by 30 named A, B, … that fill a grid row by row. */
const filling = (columnCount: number, rowCount: number): [GraphNode, ...GraphNode[]] => {
  const [first, ...rest] = Array.from({ length: columnCount * rowCount }, (_, at) =>
    leaf(String.fromCodePoint(65 + at), 50, 30, {
      row: Math.floor(at / columnCount),
      column: at % columnCount,
    }),
  );
  if (first === undefined) {
    throw new Error("A grid of no cells has no leaves.");
  }
  return [first, ...rest];
};

const checked = (placement: Layout, kept: Spacing = spacing): Layout => {
  expect(verify(placement, kept)).toEqual([]);
  return placement;
};

/** A group G that flows in `direction`, of leaves A, B, … one after another along its flow, each as long along the flow as given. */
const lined = (direction: Direction, ...lengths: number[]): GraphNode => {
  const [first, ...rest] = lengths.map((length, at) =>
    direction === "right"
      ? leaf(String.fromCodePoint(65 + at), length, 30, { row: 0, column: at })
      : leaf(String.fromCodePoint(65 + at), 50, length, { row: at, column: 0 }),
  );
  if (first === undefined) {
    throw new Error("A group of no leaves cannot be made.");
  }
  return group("G", direction, [first, ...rest]);
};

/** The points of each edge by its ends, written as the link that made it. */
const pathsByEnds = (placement: Pick<Layout, "edges">): Record<string, number[][]> =>
  Object.fromEntries(
    placement.edges.map(({ from, to, points }) => [
      `${from}>${to}`,
      points.map(({ x, y }) => [x, y]),
    ]),
  );

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

  test("goes around between two columns, straight on from the middle of the side when the lane lies there", () => {
    const placement = checked(
      place("down", [leaf("X", 50, 30), group("G", "down", filling(2, 2))], ["X>C"]),
    );

    expect(boxes(placement)["G"]).toEqual([10, 60, 140, 106]);
    expect(paths(placement)).toEqual({
      "X>C #0": [
        [80, 40],
        [80, 116],
        [45, 116],
        [45, 126],
      ],
    });
  });

  test("goes around on the side of the middle of four columns", () => {
    const placement = checked(
      place(
        "down",
        [leaf("X", 50, 30), group("Q", "down", filling(4, 2))],
        ["X>E", "X>F", "X>G", "X>H"],
      ),
    );

    expect(paths(placement)).toEqual({
      "X>E #0": [
        [150, 40],
        [150, 68],
        [80, 68],
        [80, 114],
        [45, 114],
        [45, 137],
      ],
      "X>F #1": [
        [150, 40],
        [150, 119],
        [115, 119],
        [115, 137],
      ],
      "X>G #2": [
        [150, 40],
        [150, 124],
        [185, 124],
        [185, 137],
      ],
      "X>H #3": [
        [150, 40],
        [150, 68],
        [220, 68],
        [220, 129],
        [255, 129],
        [255, 137],
      ],
    });
  });

  test("goes around from a node further back on the side of the middle column", () => {
    const placement = checked(
      place("down", [group("G", "down", filling(3, 2)), leaf("Y", 50, 30)], ["A>Y"]),
    );

    expect(boxes(placement)["G"]).toEqual([10, 10, 210, 106]);
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [45, 50],
        [45, 60],
        [80, 60],
        [80, 108],
        [115, 108],
        [115, 136],
      ],
    });
  });

  test("makes a group long enough between the edges that enter it and those that leave it, by the lane inside", () => {
    const flush = { ...spacing, padding: 0 };
    const placement = checked(
      place(
        "down",
        [group("G", "down", [group("K", "down", [leaf("N", 50, 3)]), leaf("B", 50, 30)])],
        ["K>K", "N>B"],
        flush,
      ),
      flush,
    );

    expect(boxes(placement)["K"]).toEqual([0, 16, 50, 25.5]);
    expect(paths(placement)["N>B #1"]).toEqual([
      [25, 25.5],
      [25, 61.5],
    ]);
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
        [58, 40],
        [58, 76],
      ],
      "C>A #1": [
        [58, 40],
        [58, 84],
        [28, 84],
        [28, 107],
        [36, 107],
      ],
    });
  });
});

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

  test.each([[["X>P", "X>T", "P>Y"]], [["X>T", "P>Y", "X>P"]]])(
    "is moved onto a line sooner than as far to a place clear of one, whichever edge is listed first: %j",
    (links) => {
      const placement = place(
        "down",
        [
          leaf("X", 50, 30, { row: 0, column: 0 }),
          group(
            "G",
            "down",
            [
              leaf("Z", 6, 30, { row: 0, column: 0 }),
              leaf("P", 12, 30, { row: 0, column: 1 }),
              leaf("T", 12, 30, { row: 1, column: 1 }),
            ],
            { row: 1, column: 0 },
          ),
          leaf("Y", 50, 30, { row: 2, column: 0 }),
        ],
        links,
      );

      expect(verify(placement, spacing)).toEqual([]);
      expect(boxes(placement)["G"]).toEqual([10, 60, 86, 116]);
      expect(boxes(placement)["P"]).toEqual([47, 76, 12, 30]);
      expect(
        placement.edges.find(({ to }) => to === "P")?.points.map(({ x, y }) => [x, y]),
      ).toEqual([
        [53, 40],
        [53, 76],
      ]);
    },
  );

  test.each([[["X>A", "X>B"]], [["X>B", "X>A"]]])(
    "is moved onto the earlier of two lines as near, whichever edge is listed first: %j",
    (links) => {
      const narrow = { ...spacing, padding: 3 };
      const placement = place(
        "down",
        [leaf("X", 50, 30), group("G", "down", [leaf("A", 10, 30), leaf("B", 10, 30)])],
        ["A>B", ...links],
        narrow,
      );

      expect(verify(placement, narrow)).toEqual([]);
      expect(boxes(placement)["G"]).toEqual([7, 53, 42, 99]);
      expect(
        Object.fromEntries(
          placement.edges
            .filter(({ from }) => from === "X")
            .map(({ to, points }) => [to, points.map(({ x, y }) => [x, y])]),
        ),
      ).toEqual({
        A: [
          [28, 33],
          [28, 61],
          [41, 61],
          [41, 69],
        ],
        B: [
          [28, 33],
          [28, 109],
          [41, 109],
          [41, 119],
        ],
      });
    },
  );

  test("is kept from the line by the gap between edges and the shortest stretch, not by the room an edge keeps from a node", () => {
    const clearance = { ...spacing, edgeToNode: 12 };
    const placement = place("down", [leaf("X", 50, 30), columns(40, 50, 50)], ["X>B"], clearance);

    expect(verify(placement, clearance)).toEqual([]);
    expect(boxes(placement)["G"]).toEqual([10, 60, 206, 64]);
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [113, 40],
        [113, 72],
        [105, 72],
        [105, 84],
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

describe("placeGraph: an edge into or out of a group that flows right in a grid that flows down", () => {
  test("comes in at the middle of the side beside the group's nodes, runs along the outside's lane there, and turns along the lane before a node at the start of the group's flow", () => {
    const placement = checked(
      place("down", [leaf("X", 50, 30), group("G", "right", filling(2, 1))], ["X>A"]),
    );

    expect(boxes(placement)).toEqual({
      X: [58, 10, 50, 30],
      G: [10, 60, 146, 56],
      A: [26, 76, 50, 30],
      B: [96, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [83, 40],
        [83, 68],
        [18, 68],
        [18, 91],
        [26, 91],
      ],
    });
  });

  test("runs straight on along the lane before a node further along the group's flow, when that lane lies at the middle of the side", () => {
    const placement = checked(
      place("down", [leaf("X", 50, 30), group("G", "right", filling(2, 1))], ["X>B"]),
    );

    expect(boxes(placement)).toEqual({
      X: [55, 10, 50, 30],
      G: [10, 60, 140, 56],
      A: [20, 76, 50, 30],
      B: [90, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [80, 40],
        [80, 91],
        [90, 91],
      ],
    });
  });

  test("turns along the outside's lane to the lane before a node further along the group's flow", () => {
    const placement = checked(place("down", [leaf("X", 50, 30), lined("right", 30, 50)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [45, 10, 50, 30],
      G: [10, 60, 120, 56],
      A: [20, 76, 30, 30],
      B: [70, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [70, 40],
        [70, 68],
        [60, 68],
        [60, 91],
        [70, 91],
      ],
    });
  });

  test("runs back along the outside's lane to the lane before a node that lies before the middle of the side", () => {
    const placement = checked(
      place("down", [leaf("X", 50, 30), group("G", "right", filling(3, 1))], ["X>B"]),
    );

    expect(boxes(placement)).toEqual({
      X: [90, 10, 50, 30],
      G: [10, 60, 210, 56],
      A: [20, 76, 50, 30],
      B: [90, 76, 50, 30],
      C: [160, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [115, 40],
        [115, 68],
        [80, 68],
        [80, 91],
        [90, 91],
      ],
    });
  });

  test("comes in at the middle of a side of three nodes along the group's flow, and on to the last of them", () => {
    const placement = checked(
      place("down", [leaf("X", 50, 30), group("G", "right", filling(3, 1))], ["X>C"]),
    );

    expect(boxes(placement)).toEqual({
      X: [90, 10, 50, 30],
      G: [10, 60, 210, 56],
      A: [20, 76, 50, 30],
      B: [90, 76, 50, 30],
      C: [160, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>C #0": [
        [115, 40],
        [115, 68],
        [150, 68],
        [150, 91],
        [160, 91],
      ],
    });
  });

  test("runs from the lane after a node at the end of the group's flow along the outside's lane beside the group's nodes, and goes out at the middle of the side", () => {
    const placement = checked(
      place("down", [group("G", "right", filling(2, 1)), leaf("Y", 50, 30)], ["B>Y"]),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 146, 56],
      A: [20, 20, 50, 30],
      B: [90, 20, 50, 30],
      Y: [58, 86, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "B>Y #0": [
        [140, 35],
        [148, 35],
        [148, 58],
        [83, 58],
        [83, 86],
      ],
    });
  });

  test("goes out straight on from the lane after a node further back, when that lane lies at the middle of the side", () => {
    const placement = checked(
      place("down", [group("G", "right", filling(2, 1)), leaf("Y", 50, 30)], ["A>Y"]),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 140, 56],
      A: [20, 20, 50, 30],
      B: [90, 20, 50, 30],
      Y: [55, 86, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [70, 35],
        [80, 35],
        [80, 86],
      ],
    });
  });

  test("turns from the lane after a node further back along the outside's lane", () => {
    const placement = checked(place("down", [lined("right", 50, 30), leaf("Y", 50, 30)], ["A>Y"]));

    expect(boxes(placement)).toEqual({
      G: [10, 10, 120, 56],
      A: [20, 20, 50, 30],
      B: [90, 20, 30, 30],
      Y: [45, 86, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [70, 35],
        [80, 35],
        [80, 58],
        [70, 58],
        [70, 86],
      ],
    });
  });

  test("goes out of a group of three nodes along the group's flow from the first of them", () => {
    const placement = checked(
      place("down", [group("G", "right", filling(3, 1)), leaf("Y", 50, 30)], ["A>Y"]),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 210, 56],
      A: [20, 20, 50, 30],
      B: [90, 20, 50, 30],
      C: [160, 20, 50, 30],
      Y: [90, 86, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [70, 35],
        [80, 35],
        [80, 58],
        [115, 58],
        [115, 86],
      ],
    });
  });

  test("passes a group of one node, in beside it on one side and out on the other", () => {
    const placement = checked(
      place(
        "down",
        [leaf("X", 50, 30), group("G", "right", [leaf("A", 50, 30)]), leaf("Y", 50, 30)],
        ["X>A", "A>Y"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [26, 10, 50, 30],
      G: [10, 60, 82, 62],
      A: [26, 76, 50, 30],
      Y: [26, 142, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [51, 40],
        [51, 68],
        [18, 68],
        [18, 91],
        [26, 91],
      ],
      "A>Y #1": [
        [76, 91],
        [84, 91],
        [84, 114],
        [51, 114],
        [51, 142],
      ],
    });
  });

  test("comes in to each node of a group of two nodes across its flow along that node's own lane", () => {
    const placement = checked(
      place(
        "down",
        [leaf("X", 50, 30), group("G", "right", filling(2, 2))],
        ["X>A", "X>C", "X>B", "X>D"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [66, 10, 50, 30],
      G: [10, 60, 162, 106],
      A: [41, 76, 50, 30],
      B: [112, 76, 50, 30],
      C: [41, 126, 50, 30],
      D: [112, 126, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [91, 40],
        [91, 68],
        [28, 68],
        [28, 91],
        [41, 91],
      ],
      "X>C #1": [
        [91, 40],
        [91, 68],
        [33, 68],
        [33, 141],
        [41, 141],
      ],
      "X>B #2": [
        [91, 40],
        [91, 68],
        [99, 68],
        [99, 91],
        [112, 91],
      ],
      "X>D #3": [
        [91, 40],
        [91, 68],
        [104, 68],
        [104, 141],
        [112, 141],
      ],
    });
  });

  test("goes out from each node of a group of two nodes across its flow along that node's own lane", () => {
    const placement = checked(
      place(
        "down",
        [group("G", "right", filling(2, 2)), leaf("Y", 50, 30)],
        ["A>Y", "C>Y", "B>Y", "D>Y"],
      ),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 162, 106],
      A: [20, 20, 50, 30],
      B: [91, 20, 50, 30],
      C: [20, 70, 50, 30],
      D: [91, 70, 50, 30],
      Y: [66, 136, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [70, 35],
        [78, 35],
        [78, 108],
        [91, 108],
        [91, 136],
      ],
      "C>Y #1": [
        [70, 85],
        [83, 85],
        [83, 108],
        [91, 108],
        [91, 136],
      ],
      "B>Y #2": [
        [141, 35],
        [149, 35],
        [149, 108],
        [91, 108],
        [91, 136],
      ],
      "D>Y #3": [
        [141, 85],
        [154, 85],
        [154, 108],
        [91, 108],
        [91, 136],
      ],
    });
  });

  test("comes in to the nodes further along, and goes out from the nodes further back, of a group of three nodes across its flow", () => {
    const placement = checked(
      place(
        "down",
        [leaf("X", 50, 30), group("G", "right", filling(2, 3)), leaf("Y", 50, 30)],
        ["X>B", "X>D", "X>F", "A>Y", "C>Y", "E>Y"],
      ),
    );

    expect(boxes(placement)["G"]).toEqual([10, 60, 208, 162]);
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [114, 40],
        [114, 68],
        [140, 68],
        [140, 91],
        [158, 91],
      ],
      "X>D #1": [
        [114, 40],
        [114, 68],
        [145, 68],
        [145, 141],
        [158, 141],
      ],
      "X>F #2": [
        [114, 40],
        [114, 68],
        [150, 68],
        [150, 191],
        [158, 191],
      ],
      "A>Y #3": [
        [114, 91],
        [122, 91],
        [122, 214],
        [114, 214],
        [114, 242],
      ],
      "C>Y #4": [
        [114, 141],
        [127, 141],
        [127, 214],
        [114, 214],
        [114, 242],
      ],
      "E>Y #5": [
        [114, 191],
        [132, 191],
        [132, 214],
        [114, 214],
        [114, 242],
      ],
    });
  });

  test("runs between nodes of two such groups, out of one and into the other", () => {
    const placement = checked(
      place(
        "down",
        [
          group("G", "right", filling(2, 1)),
          group("H", "right", [
            leaf("C", 50, 30, { row: 0, column: 0 }),
            leaf("D", 50, 30, { row: 0, column: 1 }),
          ]),
        ],
        ["A>D", "B>C"],
      ),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 152, 56],
      A: [26, 20, 50, 30],
      B: [96, 20, 50, 30],
      H: [10, 86, 152, 56],
      C: [26, 102, 50, 30],
      D: [96, 102, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>D #0": [
        [76, 35],
        [86, 35],
        [86, 117],
        [96, 117],
      ],
      "B>C #1": [
        [146, 35],
        [154, 35],
        [154, 58],
        [86, 58],
        [86, 94],
        [18, 94],
        [18, 117],
        [26, 117],
      ],
    });
  });

  test("runs out of the group into a node of a group that flows as the grid does", () => {
    const placement = checked(
      place(
        "down",
        [
          group("G", "right", filling(2, 1)),
          group("H", "down", [
            leaf("C", 50, 30, { row: 0, column: 0 }),
            leaf("D", 50, 30, { row: 1, column: 0 }),
          ]),
        ],
        ["A>D", "B>C"],
      ),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 152, 56],
      A: [26, 20, 50, 30],
      B: [96, 20, 50, 30],
      H: [45, 86, 82, 106],
      C: [61, 102, 50, 30],
      D: [61, 152, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>D #0": [
        [76, 35],
        [86, 35],
        [86, 94],
        [53, 94],
        [53, 142],
        [86, 142],
        [86, 152],
      ],
      "B>C #1": [
        [146, 35],
        [154, 35],
        [154, 58],
        [86, 58],
        [86, 102],
      ],
    });
  });

  test("runs into the group out of a node of a group that flows as the grid does", () => {
    const placement = checked(
      place(
        "down",
        [
          group("H", "down", [
            leaf("C", 50, 30, { row: 0, column: 0 }),
            leaf("D", 50, 30, { row: 1, column: 0 }),
          ]),
          group("G", "right", filling(2, 1)),
        ],
        ["C>B", "D>A"],
      ),
    );

    expect(boxes(placement)).toEqual({
      H: [45, 10, 82, 106],
      C: [61, 20, 50, 30],
      D: [61, 70, 50, 30],
      G: [10, 136, 152, 56],
      A: [26, 152, 50, 30],
      B: [96, 152, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "C>B #0": [
        [86, 50],
        [86, 60],
        [53, 60],
        [53, 108],
        [86, 108],
        [86, 167],
        [96, 167],
      ],
      "D>A #1": [
        [86, 100],
        [86, 144],
        [18, 144],
        [18, 167],
        [26, 167],
      ],
    });
  });

  test("goes back around the group into a node inside it", () => {
    const placement = checked(
      place("down", [group("G", "right", filling(2, 1)), leaf("Y", 50, 30)], ["Y>A"]),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 16, 146, 56],
      A: [26, 32, 50, 30],
      B: [96, 32, 50, 30],
      Y: [176, 29, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "Y>A #0": [
        [201, 59],
        [201, 80],
        [166, 80],
        [166, 8],
        [83, 8],
        [83, 24],
        [18, 24],
        [18, 47],
        [26, 47],
      ],
    });
  });

  test("goes back out of a node inside the group and around the group", () => {
    const placement = checked(
      place("down", [leaf("X", 50, 30), group("G", "right", filling(2, 1))], ["B>X"]),
    );

    expect(boxes(placement)).toEqual({
      X: [10, 29, 50, 30],
      G: [80, 16, 146, 56],
      A: [90, 26, 50, 30],
      B: [160, 26, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "B>X #0": [
        [210, 41],
        [218, 41],
        [218, 64],
        [153, 64],
        [153, 80],
        [70, 80],
        [70, 8],
        [35, 8],
        [35, 29],
      ],
    });
  });

  test("shares the stretch through the border with an edge into another node of the group", () => {
    const placement = checked(
      place(
        "down",
        [leaf("X", 50, 30), leaf("Z", 50, 30), group("G", "right", filling(2, 1))],
        ["X>A", "Z>B"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [61, 10, 50, 30],
      Z: [182, 10, 50, 30],
      G: [10, 60, 152, 56],
      A: [26, 76, 50, 30],
      B: [96, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [86, 40],
        [86, 68],
        [18, 68],
        [18, 91],
        [26, 91],
      ],
      "Z>B #1": [
        [207, 40],
        [207, 50],
        [86, 50],
        [86, 91],
        [96, 91],
      ],
    });
  });

  test("shares the stretch through the border with an edge out of another node of the group", () => {
    const placement = checked(
      place(
        "down",
        [group("G", "right", filling(2, 1)), leaf("Y", 50, 30), leaf("Z", 50, 30)],
        ["A>Y", "B>Z"],
      ),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 152, 56],
      A: [26, 20, 50, 30],
      B: [96, 20, 50, 30],
      Y: [61, 86, 50, 30],
      Z: [182, 86, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [76, 35],
        [86, 35],
        [86, 86],
      ],
      "B>Z #1": [
        [146, 35],
        [154, 35],
        [154, 58],
        [86, 58],
        [86, 76],
        [207, 76],
        [207, 86],
      ],
    });
  });

  test("passes the points where an edge to the group itself ends and an edge from it starts", () => {
    const placement = checked(
      place(
        "down",
        [leaf("X", 50, 30), group("G", "right", filling(2, 1)), leaf("Y", 50, 30)],
        ["X>A", "B>Y", "X>G", "G>Y"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [61, 10, 50, 30],
      G: [10, 60, 152, 62],
      A: [26, 76, 50, 30],
      B: [96, 76, 50, 30],
      Y: [61, 142, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [86, 40],
        [86, 68],
        [18, 68],
        [18, 91],
        [26, 91],
      ],
      "B>Y #1": [
        [146, 91],
        [154, 91],
        [154, 114],
        [86, 114],
        [86, 142],
      ],
      "X>G #2": [
        [86, 40],
        [86, 60],
      ],
      "G>Y #3": [
        [86, 122],
        [86, 142],
      ],
    });
  });

  test("goes out along a lane nearer the border than the lane of a node of the group that goes around beside it", () => {
    const placement = checked(
      place("down", [group("G", "right", filling(2, 1)), leaf("Y", 50, 30)], ["B>A", "B>Y"]),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 152, 61],
      A: [26, 20, 50, 30],
      B: [96, 20, 50, 30],
      Y: [61, 91, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "B>A #0": [
        [146, 35],
        [154, 35],
        [154, 58],
        [18, 58],
        [18, 35],
        [26, 35],
      ],
      "B>Y #1": [
        [146, 35],
        [154, 35],
        [154, 63],
        [86, 63],
        [86, 91],
      ],
    });
  });

  test("is drawn to a group inside the group as to any node of it", () => {
    const placement = checked(
      place(
        "down",
        [
          leaf("X", 50, 30),
          group("G", "right", [group("K", "down", [leaf("N", 50, 30)]), leaf("B", 50, 30)]),
        ],
        ["X>K"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [33, 10, 50, 30],
      G: [10, 60, 96, 126],
      K: [26, 76, 70, 50],
      N: [36, 86, 50, 30],
      B: [36, 146, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>K #0": [
        [58, 40],
        [58, 68],
        [18, 68],
        [18, 101],
        [26, 101],
      ],
    });
  });
});

describe("placeGraph: a group that flows the other way than the grid around it", () => {
  test.each([
    ["down", "right", "G>A"],
    ["down", "right", "B>G"],
    ["right", "down", "G>A"],
    ["right", "down", "B>G"],
  ] as const)(
    "has no edge drawn between it and a node inside it, where the grid flows %s and the group %s, as %s",
    (outer, inner, link) => {
      const placement = place(outer, [group("G", inner, pair())], [link]);

      expect(paths(placement)).toEqual({});
    },
  );

  test("is made long enough between the edges that enter it and those that leave it by the lane inside it", () => {
    const kept = { ...spacing, padding: 0, edgeToNode: 1, edgeGap: 12 };
    const placement = checked(
      place(
        "down",
        [group("G", "down", [group("K", "right", [leaf("N", 50, 3)]), leaf("B", 50, 30)])],
        ["K>K", "N>B"],
        kept,
      ),
      kept,
    );

    expect(boxes(placement)["K"]).toEqual([0, 24, 74, 37.5]);
    expect(paths(placement)["N>B #1"]).toEqual([
      [50, 36],
      [62, 36],
      [62, 49.5],
      [37, 49.5],
      [37, 85.5],
    ]);
  });
});

describe("placeGraph: an edge into or out of a group that flows down in a grid that flows right", () => {
  test("comes in at the middle of the side beside the group's nodes, runs along the outside's lane there, and turns along the lane before a node at the start of the group's flow", () => {
    const placement = checked(
      place("right", [leaf("X", 50, 30), group("G", "down", filling(1, 2))], ["X>A"]),
    );

    expect(boxes(placement)).toEqual({
      X: [10, 48, 50, 30],
      G: [80, 10, 76, 106],
      A: [96, 26, 50, 30],
      B: [96, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [60, 63],
        [88, 63],
        [88, 18],
        [121, 18],
        [121, 26],
      ],
    });
  });

  test("runs straight on along the lane before a node further along the group's flow, when that lane lies at the middle of the side", () => {
    const placement = checked(
      place("right", [leaf("X", 50, 30), group("G", "down", filling(1, 2))], ["X>B"]),
    );

    expect(boxes(placement)).toEqual({
      X: [10, 45, 50, 30],
      G: [80, 10, 76, 100],
      A: [96, 20, 50, 30],
      B: [96, 70, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [60, 60],
        [121, 60],
        [121, 70],
      ],
    });
  });

  test("turns along the outside's lane to the lane before a node further along the group's flow", () => {
    const placement = checked(place("right", [leaf("X", 50, 30), lined("down", 30, 50)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [10, 55, 50, 30],
      G: [80, 10, 76, 120],
      A: [96, 20, 50, 30],
      B: [96, 70, 50, 50],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [60, 70],
        [88, 70],
        [88, 60],
        [121, 60],
        [121, 70],
      ],
    });
  });

  test("runs back along the outside's lane to the lane before a node that lies before the middle of the side", () => {
    const placement = checked(
      place("right", [leaf("X", 50, 30), group("G", "down", filling(1, 3))], ["X>B"]),
    );

    expect(boxes(placement)).toEqual({
      X: [10, 70, 50, 30],
      G: [80, 10, 76, 150],
      A: [96, 20, 50, 30],
      B: [96, 70, 50, 30],
      C: [96, 120, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [60, 85],
        [88, 85],
        [88, 60],
        [121, 60],
        [121, 70],
      ],
    });
  });

  test("comes in at the middle of a side of three nodes along the group's flow, and on to the last of them", () => {
    const placement = checked(
      place("right", [leaf("X", 50, 30), group("G", "down", filling(1, 3))], ["X>C"]),
    );

    expect(boxes(placement)).toEqual({
      X: [10, 70, 50, 30],
      G: [80, 10, 76, 150],
      A: [96, 20, 50, 30],
      B: [96, 70, 50, 30],
      C: [96, 120, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>C #0": [
        [60, 85],
        [88, 85],
        [88, 110],
        [121, 110],
        [121, 120],
      ],
    });
  });

  test("runs from the lane after a node at the end of the group's flow along the outside's lane beside the group's nodes, and goes out at the middle of the side", () => {
    const placement = checked(
      place("right", [group("G", "down", filling(1, 2)), leaf("Y", 50, 30)], ["B>Y"]),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 76, 106],
      A: [20, 20, 50, 30],
      B: [20, 70, 50, 30],
      Y: [106, 48, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "B>Y #0": [
        [45, 100],
        [45, 108],
        [78, 108],
        [78, 63],
        [106, 63],
      ],
    });
  });

  test("goes out straight on from the lane after a node further back, when that lane lies at the middle of the side", () => {
    const placement = checked(
      place("right", [group("G", "down", filling(1, 2)), leaf("Y", 50, 30)], ["A>Y"]),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 76, 100],
      A: [20, 20, 50, 30],
      B: [20, 70, 50, 30],
      Y: [106, 45, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [45, 50],
        [45, 60],
        [106, 60],
      ],
    });
  });

  test("turns from the lane after a node further back along the outside's lane", () => {
    const placement = checked(place("right", [lined("down", 50, 30), leaf("Y", 50, 30)], ["A>Y"]));

    expect(boxes(placement)).toEqual({
      G: [10, 10, 76, 120],
      A: [20, 20, 50, 50],
      B: [20, 90, 50, 30],
      Y: [106, 55, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [45, 70],
        [45, 80],
        [78, 80],
        [78, 70],
        [106, 70],
      ],
    });
  });

  test("goes out of a group of three nodes along the group's flow from the first of them", () => {
    const placement = checked(
      place("right", [group("G", "down", filling(1, 3)), leaf("Y", 50, 30)], ["A>Y"]),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 76, 150],
      A: [20, 20, 50, 30],
      B: [20, 70, 50, 30],
      C: [20, 120, 50, 30],
      Y: [106, 70, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [45, 50],
        [45, 60],
        [78, 60],
        [78, 85],
        [106, 85],
      ],
    });
  });

  test("passes a group of one node, in beside it on one side and out on the other", () => {
    const placement = checked(
      place(
        "right",
        [leaf("X", 50, 30), group("G", "down", [leaf("A", 50, 30)]), leaf("Y", 50, 30)],
        ["X>A", "A>Y"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [10, 26, 50, 30],
      G: [80, 10, 82, 62],
      A: [96, 26, 50, 30],
      Y: [182, 26, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [60, 41],
        [88, 41],
        [88, 18],
        [121, 18],
        [121, 26],
      ],
      "A>Y #1": [
        [121, 56],
        [121, 64],
        [154, 64],
        [154, 41],
        [182, 41],
      ],
    });
  });

  test("comes in to each node of a group of two nodes across its flow along that node's own lane", () => {
    const placement = checked(
      place(
        "right",
        [leaf("X", 50, 30), group("G", "down", filling(2, 2))],
        ["X>A", "X>B", "X>C", "X>D"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [10, 56, 50, 30],
      G: [80, 10, 146, 122],
      A: [96, 41, 50, 30],
      B: [166, 41, 50, 30],
      C: [96, 92, 50, 30],
      D: [166, 92, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [60, 71],
        [88, 71],
        [88, 28],
        [121, 28],
        [121, 41],
      ],
      "X>B #1": [
        [60, 71],
        [88, 71],
        [88, 33],
        [191, 33],
        [191, 41],
      ],
      "X>C #2": [
        [60, 71],
        [88, 71],
        [88, 79],
        [121, 79],
        [121, 92],
      ],
      "X>D #3": [
        [60, 71],
        [88, 71],
        [88, 84],
        [191, 84],
        [191, 92],
      ],
    });
  });

  test("goes out from each node of a group of two nodes across its flow along that node's own lane", () => {
    const placement = checked(
      place(
        "right",
        [group("G", "down", filling(2, 2)), leaf("Y", 50, 30)],
        ["A>Y", "B>Y", "C>Y", "D>Y"],
      ),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 146, 122],
      A: [20, 20, 50, 30],
      B: [90, 20, 50, 30],
      C: [20, 71, 50, 30],
      D: [90, 71, 50, 30],
      Y: [176, 56, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [45, 50],
        [45, 58],
        [148, 58],
        [148, 71],
        [176, 71],
      ],
      "B>Y #1": [
        [115, 50],
        [115, 63],
        [148, 63],
        [148, 71],
        [176, 71],
      ],
      "C>Y #2": [
        [45, 101],
        [45, 109],
        [148, 109],
        [148, 71],
        [176, 71],
      ],
      "D>Y #3": [
        [115, 101],
        [115, 114],
        [148, 114],
        [148, 71],
        [176, 71],
      ],
    });
  });

  test("comes in to the nodes further along, and goes out from the nodes further back, of a group of three nodes across its flow", () => {
    const placement = checked(
      place(
        "right",
        [leaf("X", 50, 30), group("G", "down", filling(3, 2)), leaf("Y", 50, 30)],
        ["X>D", "X>E", "X>F", "A>Y", "B>Y", "C>Y"],
      ),
    );

    expect(boxes(placement)["G"]).toEqual([80, 10, 222, 168]);
    expect(paths(placement)).toEqual({
      "X>D #0": [
        [60, 94],
        [88, 94],
        [88, 120],
        [121, 120],
        [121, 138],
      ],
      "X>E #1": [
        [60, 94],
        [88, 94],
        [88, 125],
        [191, 125],
        [191, 138],
      ],
      "X>F #2": [
        [60, 94],
        [88, 94],
        [88, 130],
        [261, 130],
        [261, 138],
      ],
      "A>Y #3": [
        [121, 94],
        [121, 102],
        [294, 102],
        [294, 94],
        [322, 94],
      ],
      "B>Y #4": [
        [191, 94],
        [191, 107],
        [294, 107],
        [294, 94],
        [322, 94],
      ],
      "C>Y #5": [
        [261, 94],
        [261, 112],
        [294, 112],
        [294, 94],
        [322, 94],
      ],
    });
  });

  test("runs between nodes of two such groups, out of one and into the other", () => {
    const placement = checked(
      place(
        "right",
        [
          group("G", "down", filling(1, 2)),
          group("H", "down", [
            leaf("C", 50, 30, { row: 0, column: 0 }),
            leaf("D", 50, 30, { row: 1, column: 0 }),
          ]),
        ],
        ["A>D", "B>C"],
      ),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 76, 112],
      A: [20, 26, 50, 30],
      B: [20, 76, 50, 30],
      H: [106, 10, 76, 112],
      C: [122, 26, 50, 30],
      D: [122, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>D #0": [
        [45, 56],
        [45, 66],
        [147, 66],
        [147, 76],
      ],
      "B>C #1": [
        [45, 106],
        [45, 114],
        [78, 114],
        [78, 66],
        [114, 66],
        [114, 18],
        [147, 18],
        [147, 26],
      ],
    });
  });

  test("runs out of the group into a node of a group that flows as the grid does", () => {
    const placement = checked(
      place(
        "right",
        [
          group("G", "down", filling(1, 2)),
          group("H", "right", [
            leaf("C", 50, 30, { row: 0, column: 0 }),
            leaf("D", 50, 30, { row: 0, column: 1 }),
          ]),
        ],
        ["A>D", "B>C"],
      ),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 76, 112],
      A: [20, 26, 50, 30],
      B: [20, 76, 50, 30],
      H: [106, 35, 146, 62],
      C: [122, 51, 50, 30],
      D: [192, 51, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>D #0": [
        [45, 56],
        [45, 66],
        [114, 66],
        [114, 43],
        [182, 43],
        [182, 66],
        [192, 66],
      ],
      "B>C #1": [
        [45, 106],
        [45, 114],
        [78, 114],
        [78, 66],
        [122, 66],
      ],
    });
  });

  test("runs into the group out of a node of a group that flows as the grid does", () => {
    const placement = checked(
      place(
        "right",
        [
          group("H", "right", [
            leaf("C", 50, 30, { row: 0, column: 0 }),
            leaf("D", 50, 30, { row: 0, column: 1 }),
          ]),
          group("G", "down", filling(1, 2)),
        ],
        ["C>B", "D>A"],
      ),
    );

    expect(boxes(placement)).toEqual({
      H: [10, 35, 146, 62],
      C: [20, 51, 50, 30],
      D: [90, 51, 50, 30],
      G: [176, 10, 76, 112],
      A: [192, 26, 50, 30],
      B: [192, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "C>B #0": [
        [70, 66],
        [80, 66],
        [80, 43],
        [148, 43],
        [148, 66],
        [217, 66],
        [217, 76],
      ],
      "D>A #1": [
        [140, 66],
        [184, 66],
        [184, 18],
        [217, 18],
        [217, 26],
      ],
    });
  });

  test("goes back around the group into a node inside it", () => {
    const placement = checked(
      place("right", [group("G", "down", filling(1, 2)), leaf("Y", 50, 30)], ["Y>A"]),
    );

    expect(boxes(placement)).toEqual({
      G: [16, 10, 76, 106],
      A: [32, 26, 50, 30],
      B: [32, 76, 50, 30],
      Y: [29, 136, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "Y>A #0": [
        [79, 151],
        [100, 151],
        [100, 126],
        [8, 126],
        [8, 63],
        [24, 63],
        [24, 18],
        [57, 18],
        [57, 26],
      ],
    });
  });

  test("goes back out of a node inside the group and around the group", () => {
    const placement = checked(
      place("right", [leaf("X", 50, 30), group("G", "down", filling(1, 2))], ["B>X"]),
    );

    expect(boxes(placement)).toEqual({
      X: [29, 10, 50, 30],
      G: [16, 60, 76, 106],
      A: [26, 70, 50, 30],
      B: [26, 120, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "B>X #0": [
        [51, 150],
        [51, 158],
        [84, 158],
        [84, 113],
        [100, 113],
        [100, 50],
        [8, 50],
        [8, 25],
        [29, 25],
      ],
    });
  });

  test("shares the stretch through the border with an edge into another node of the group", () => {
    const placement = checked(
      place(
        "right",
        [leaf("X", 50, 30), leaf("Z", 50, 30), group("G", "down", filling(1, 2))],
        ["X>A", "Z>B"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [10, 51, 50, 30],
      Z: [10, 142, 50, 30],
      G: [80, 10, 76, 112],
      A: [96, 26, 50, 30],
      B: [96, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [60, 66],
        [88, 66],
        [88, 18],
        [121, 18],
        [121, 26],
      ],
      "Z>B #1": [
        [60, 157],
        [70, 157],
        [70, 66],
        [121, 66],
        [121, 76],
      ],
    });
  });

  test("shares the stretch through the border with an edge out of another node of the group", () => {
    const placement = checked(
      place(
        "right",
        [group("G", "down", filling(1, 2)), leaf("Y", 50, 30), leaf("Z", 50, 30)],
        ["A>Y", "B>Z"],
      ),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 76, 112],
      A: [20, 26, 50, 30],
      B: [20, 76, 50, 30],
      Y: [106, 51, 50, 30],
      Z: [106, 142, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [45, 56],
        [45, 66],
        [106, 66],
      ],
      "B>Z #1": [
        [45, 106],
        [45, 114],
        [78, 114],
        [78, 66],
        [96, 66],
        [96, 157],
        [106, 157],
      ],
    });
  });

  test("passes the points where an edge to the group itself ends and an edge from it starts", () => {
    const placement = checked(
      place(
        "right",
        [leaf("X", 50, 30), group("G", "down", filling(1, 2)), leaf("Y", 50, 30)],
        ["X>A", "B>Y", "X>G", "G>Y"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [10, 51, 50, 30],
      G: [80, 10, 82, 112],
      A: [96, 26, 50, 30],
      B: [96, 76, 50, 30],
      Y: [182, 51, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [60, 66],
        [88, 66],
        [88, 18],
        [121, 18],
        [121, 26],
      ],
      "B>Y #1": [
        [121, 106],
        [121, 114],
        [154, 114],
        [154, 66],
        [182, 66],
      ],
      "X>G #2": [
        [60, 66],
        [80, 66],
      ],
      "G>Y #3": [
        [162, 66],
        [182, 66],
      ],
    });
  });

  test("goes out along a lane nearer the border than the lane of a node of the group that goes around beside it", () => {
    const placement = checked(
      place("right", [group("G", "down", filling(1, 2)), leaf("Y", 50, 30)], ["B>A", "B>Y"]),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 81, 112],
      A: [20, 26, 50, 30],
      B: [20, 76, 50, 30],
      Y: [111, 51, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "B>A #0": [
        [45, 106],
        [45, 114],
        [78, 114],
        [78, 18],
        [45, 18],
        [45, 26],
      ],
      "B>Y #1": [
        [45, 106],
        [45, 114],
        [83, 114],
        [83, 66],
        [111, 66],
      ],
    });
  });

  test("is drawn to a group inside the group as to any node of it", () => {
    const placement = checked(
      place(
        "right",
        [
          leaf("X", 50, 30),
          group("G", "down", [group("K", "right", [leaf("N", 50, 30)]), leaf("B", 50, 30)]),
        ],
        ["X>K"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [10, 33, 50, 30],
      G: [80, 10, 166, 76],
      K: [96, 26, 70, 50],
      N: [106, 36, 50, 30],
      B: [186, 36, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>K #0": [
        [60, 48],
        [88, 48],
        [88, 18],
        [131, 18],
        [131, 26],
      ],
    });
  });
});

describe("placeGraph: the middle of the side of a group that flows right in a grid that flows down, where edges cross it", () => {
  test("is left where it is when it is the gap between edges and the shortest stretch from the lane an edge turns onto", () => {
    const placement = checked(place("down", [leaf("X", 50, 30), lined("right", 34, 50)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [47, 10, 50, 30],
      G: [10, 60, 124, 56],
      A: [20, 76, 34, 30],
      B: [74, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [72, 40],
        [72, 68],
        [64, 68],
        [64, 91],
        [74, 91],
      ],
    });
  });

  test("is moved that far past the lane when that is the least move, by room after the last node along the flow", () => {
    const placement = checked(place("down", [leaf("X", 50, 30), lined("right", 40, 50)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [53, 10, 50, 30],
      G: [10, 60, 136, 56],
      A: [20, 76, 40, 30],
      B: [80, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [78, 40],
        [78, 68],
        [70, 68],
        [70, 91],
        [80, 91],
      ],
    });
  });

  test("is moved onto the lane when that is the least move, by room before the first node along the flow", () => {
    const placement = checked(place("down", [leaf("X", 50, 30), lined("right", 44, 50)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [55, 10, 50, 30],
      G: [10, 60, 140, 56],
      A: [26, 76, 44, 30],
      B: [90, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [80, 40],
        [80, 91],
        [90, 91],
      ],
    });
  });

  test("is moved onto the lane by room after the last node when the lane lies past it", () => {
    const placement = checked(place("down", [leaf("X", 50, 30), lined("right", 50, 44)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [55, 10, 50, 30],
      G: [10, 60, 140, 56],
      A: [20, 76, 50, 30],
      B: [90, 76, 44, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [80, 40],
        [80, 91],
        [90, 91],
      ],
    });
  });

  test("is moved that far short of the lane when that is the least move, by room before the first node", () => {
    const placement = checked(place("down", [leaf("X", 50, 30), lined("right", 50, 40)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [53, 10, 50, 30],
      G: [10, 60, 136, 56],
      A: [26, 76, 50, 30],
      B: [96, 76, 40, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [78, 40],
        [78, 68],
        [86, 68],
        [86, 91],
        [96, 91],
      ],
    });
  });

  test("is moved onto the lane when that is no further than moving it clear", () => {
    const placement = checked(place("down", [leaf("X", 50, 30), lined("right", 42, 50)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [55, 10, 50, 30],
      G: [10, 60, 140, 56],
      A: [28, 76, 42, 30],
      B: [90, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [80, 40],
        [80, 91],
        [90, 91],
      ],
    });
  });

  test("is moved clear of the lane after its source for an edge that goes out", () => {
    const placement = checked(place("down", [lined("right", 40, 50), leaf("Y", 50, 30)], ["A>Y"]));

    expect(boxes(placement)).toEqual({
      G: [10, 10, 136, 56],
      A: [20, 20, 40, 30],
      B: [80, 20, 50, 30],
      Y: [53, 86, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [60, 35],
        [70, 35],
        [70, 58],
        [78, 58],
        [78, 86],
      ],
    });
  });

  test("is moved onto the lane after its source for an edge that goes out, by room before the first node", () => {
    const placement = checked(place("down", [lined("right", 44, 50), leaf("Y", 50, 30)], ["A>Y"]));

    expect(boxes(placement)).toEqual({
      G: [10, 10, 140, 56],
      A: [26, 20, 44, 30],
      B: [90, 20, 50, 30],
      Y: [55, 86, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [70, 35],
        [80, 35],
        [80, 86],
      ],
    });
  });

  test("moves the lanes before and after the nodes with them, and leaves the lanes beside them where they are", () => {
    const placement = checked(
      place("down", [leaf("X", 50, 30), lined("right", 44, 50)], ["X>B", "B>A"]),
    );

    expect(boxes(placement)).toEqual({
      X: [61, 10, 50, 30],
      G: [10, 60, 152, 62],
      A: [32, 76, 44, 30],
      B: [96, 76, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [86, 40],
        [86, 91],
        [96, 91],
      ],
      "B>A #1": [
        [146, 91],
        [154, 91],
        [154, 114],
        [24, 114],
        [24, 91],
        [32, 91],
      ],
    });
  });

  test("is kept from the lane by the gap between edges and the shortest stretch, not by the room an edge keeps from a node", () => {
    const kept = { ...spacing, edgeToNode: 12 };
    const placement = checked(
      place("down", [leaf("X", 50, 30), lined("right", 34, 50)], ["X>B"], kept),
      kept,
    );

    expect(boxes(placement)).toEqual({
      X: [49, 10, 50, 30],
      G: [10, 60, 128, 64],
      A: [20, 84, 34, 30],
      B: [78, 84, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [74, 40],
        [74, 72],
        [66, 72],
        [66, 99],
        [78, 99],
      ],
    });
  });

  test("is kept the larger of the gap between edges and the shortest stretch from the lane", () => {
    const kept = { ...spacing, edgeGap: 12 };
    const placement = checked(
      place("down", [leaf("X", 50, 30), lined("right", 30, 50)], ["X>B"], kept),
      kept,
    );

    expect(boxes(placement)).toEqual({
      X: [49, 10, 50, 30],
      G: [10, 60, 128, 64],
      A: [20, 84, 30, 30],
      B: [74, 84, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [74, 40],
        [74, 72],
        [62, 72],
        [62, 99],
        [74, 99],
      ],
    });
  });

  test.each([[["X>B", "A>Y"]], [["A>Y", "X>B"]]])(
    "is moved onto the earlier of two lanes as near, whichever edge is listed first: %j",
    (links) => {
      const placement = checked(
        place("down", [leaf("X", 50, 30), lined("right", 50, 50), leaf("Y", 50, 30)], [...links]),
      );

      expect(boxes(placement)).toEqual({
        X: [61, 10, 50, 30],
        G: [10, 60, 152, 62],
        A: [28, 76, 50, 30],
        B: [102, 76, 50, 30],
        Y: [61, 142, 50, 30],
      });
      expect(pathsByEnds(placement)).toEqual({
        "A>Y": [
          [78, 91],
          [86, 91],
          [86, 142],
        ],
        "X>B": [
          [86, 40],
          [86, 68],
          [94, 68],
          [94, 91],
          [102, 91],
        ],
      });
    },
  );
});

describe("placeGraph: the middle of the side of a group that flows down in a grid that flows right, where edges cross it", () => {
  test("is left where it is when it is the gap between edges and the shortest stretch from the lane an edge turns onto", () => {
    const placement = checked(place("right", [leaf("X", 50, 30), lined("down", 34, 50)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [10, 57, 50, 30],
      G: [80, 10, 76, 124],
      A: [96, 20, 50, 34],
      B: [96, 74, 50, 50],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [60, 72],
        [88, 72],
        [88, 64],
        [121, 64],
        [121, 74],
      ],
    });
  });

  test("is moved that far past the lane when that is the least move, by room after the last node along the flow", () => {
    const placement = checked(place("right", [leaf("X", 50, 30), lined("down", 40, 50)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [10, 63, 50, 30],
      G: [80, 10, 76, 136],
      A: [96, 20, 50, 40],
      B: [96, 80, 50, 50],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [60, 78],
        [88, 78],
        [88, 70],
        [121, 70],
        [121, 80],
      ],
    });
  });

  test("is moved onto the lane when that is the least move, by room before the first node along the flow", () => {
    const placement = checked(place("right", [leaf("X", 50, 30), lined("down", 44, 50)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [10, 65, 50, 30],
      G: [80, 10, 76, 140],
      A: [96, 26, 50, 44],
      B: [96, 90, 50, 50],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [60, 80],
        [121, 80],
        [121, 90],
      ],
    });
  });

  test("is moved onto the lane by room after the last node when the lane lies past it", () => {
    const placement = checked(place("right", [leaf("X", 50, 30), lined("down", 50, 44)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [10, 65, 50, 30],
      G: [80, 10, 76, 140],
      A: [96, 20, 50, 50],
      B: [96, 90, 50, 44],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [60, 80],
        [121, 80],
        [121, 90],
      ],
    });
  });

  test("is moved that far short of the lane when that is the least move, by room before the first node", () => {
    const placement = checked(place("right", [leaf("X", 50, 30), lined("down", 50, 40)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [10, 63, 50, 30],
      G: [80, 10, 76, 136],
      A: [96, 26, 50, 50],
      B: [96, 96, 50, 40],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [60, 78],
        [88, 78],
        [88, 86],
        [121, 86],
        [121, 96],
      ],
    });
  });

  test("is moved onto the lane when that is no further than moving it clear", () => {
    const placement = checked(place("right", [leaf("X", 50, 30), lined("down", 42, 50)], ["X>B"]));

    expect(boxes(placement)).toEqual({
      X: [10, 65, 50, 30],
      G: [80, 10, 76, 140],
      A: [96, 28, 50, 42],
      B: [96, 90, 50, 50],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [60, 80],
        [121, 80],
        [121, 90],
      ],
    });
  });

  test("is moved clear of the lane after its source for an edge that goes out", () => {
    const placement = checked(place("right", [lined("down", 40, 50), leaf("Y", 50, 30)], ["A>Y"]));

    expect(boxes(placement)).toEqual({
      G: [10, 10, 76, 136],
      A: [20, 20, 50, 40],
      B: [20, 80, 50, 50],
      Y: [106, 63, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [45, 60],
        [45, 70],
        [78, 70],
        [78, 78],
        [106, 78],
      ],
    });
  });

  test("is moved onto the lane after its source for an edge that goes out, by room before the first node", () => {
    const placement = checked(place("right", [lined("down", 44, 50), leaf("Y", 50, 30)], ["A>Y"]));

    expect(boxes(placement)).toEqual({
      G: [10, 10, 76, 140],
      A: [20, 26, 50, 44],
      B: [20, 90, 50, 50],
      Y: [106, 65, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [45, 70],
        [45, 80],
        [106, 80],
      ],
    });
  });

  test("moves the lanes before and after the nodes with them, and leaves the lanes beside them where they are", () => {
    const placement = checked(
      place("right", [leaf("X", 50, 30), lined("down", 44, 50)], ["X>B", "B>A"]),
    );

    expect(boxes(placement)).toEqual({
      X: [10, 71, 50, 30],
      G: [80, 10, 82, 152],
      A: [96, 32, 50, 44],
      B: [96, 96, 50, 50],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [60, 86],
        [121, 86],
        [121, 96],
      ],
      "B>A #1": [
        [121, 146],
        [121, 154],
        [154, 154],
        [154, 24],
        [121, 24],
        [121, 32],
      ],
    });
  });

  test("is kept from the lane by the gap between edges and the shortest stretch, not by the room an edge keeps from a node", () => {
    const kept = { ...spacing, edgeToNode: 12 };
    const placement = checked(
      place("right", [leaf("X", 50, 30), lined("down", 34, 50)], ["X>B"], kept),
      kept,
    );

    expect(boxes(placement)).toEqual({
      X: [10, 59, 50, 30],
      G: [80, 10, 84, 128],
      A: [104, 20, 50, 34],
      B: [104, 78, 50, 50],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [60, 74],
        [92, 74],
        [92, 66],
        [129, 66],
        [129, 78],
      ],
    });
  });

  test("is kept the larger of the gap between edges and the shortest stretch from the lane", () => {
    const kept = { ...spacing, edgeGap: 12 };
    const placement = checked(
      place("right", [leaf("X", 50, 30), lined("down", 30, 50)], ["X>B"], kept),
      kept,
    );

    expect(boxes(placement)).toEqual({
      X: [10, 59, 50, 30],
      G: [80, 10, 84, 128],
      A: [104, 20, 50, 30],
      B: [104, 74, 50, 50],
    });
    expect(paths(placement)).toEqual({
      "X>B #0": [
        [60, 74],
        [92, 74],
        [92, 62],
        [129, 62],
        [129, 74],
      ],
    });
  });

  test.each([[["X>B", "A>Y"]], [["A>Y", "X>B"]]])(
    "is moved onto the earlier of two lanes as near, whichever edge is listed first: %j",
    (links) => {
      const placement = checked(
        place("right", [leaf("X", 50, 30), lined("down", 50, 50), leaf("Y", 50, 30)], [...links]),
      );

      expect(boxes(placement)).toEqual({
        X: [10, 71, 50, 30],
        G: [80, 10, 82, 152],
        A: [96, 28, 50, 50],
        B: [96, 102, 50, 50],
        Y: [182, 71, 50, 30],
      });
      expect(pathsByEnds(placement)).toEqual({
        "A>Y": [
          [121, 78],
          [121, 86],
          [182, 86],
        ],
        "X>B": [
          [60, 86],
          [88, 86],
          [88, 94],
          [121, 94],
          [121, 102],
        ],
      });
    },
  );
});

describe("placeGraph: a node too small for an edge that crosses the border of its group, which flows the other way than the grid around it", () => {
  test.each([
    ["comes into its group to it", "B>N"],
    ["goes out of its group from it", "N>B"],
  ])("is refused when the edge it is too narrow for %s", (_, link) => {
    expect(() =>
      place("down", [group("G", "right", [leaf("N", 50, 9)]), leaf("B", 50, 30)], [link]),
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
        [leaf("B", 50, 30), group("G", "right", [leaf("N", 4, 30)]), leaf("C", 50, 30)],
        ["B>N", "N>C"],
      ),
    ).toThrow(
      new InvalidGraphError(
        'Node "N" is 4 long between the edges that enter it and the edges that leave it, less than the gap of 5 between edges.',
      ),
    );
  });
});

describe("placeGraph: an edge whose end lies in a group inside a group", () => {
  test("comes in through the middle of the side of each group, when every group flows as the grid around it does", () => {
    const placement = checked(
      place(
        "down",
        [leaf("X", 50, 30), group("G", "down", [group("H", "down", [leaf("A", 50, 30)])])],
        ["X>A"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [30, 10, 50, 30],
      G: [10, 60, 90, 82],
      H: [20, 76, 70, 56],
      A: [30, 92, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [55, 40],
        [55, 92],
      ],
    });
  });

  test("comes in through the middle of the side of each group, when their flows alternate", () => {
    const placement = checked(
      place(
        "down",
        [leaf("X", 50, 30), group("G", "right", [group("H", "down", [leaf("A", 50, 30)])])],
        ["X>A"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [36, 10, 50, 30],
      G: [10, 60, 102, 82],
      H: [26, 76, 76, 56],
      A: [42, 92, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [61, 40],
        [61, 68],
        [18, 68],
        [18, 104],
        [34, 104],
        [34, 84],
        [67, 84],
        [67, 92],
      ],
    });
  });

  test("goes out through the middle of the side of each group, when their flows alternate", () => {
    const placement = checked(
      place(
        "down",
        [group("G", "right", [group("H", "down", [leaf("A", 50, 30)])]), leaf("Y", 50, 30)],
        ["A>Y"],
      ),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 102, 82],
      H: [20, 20, 76, 56],
      A: [30, 30, 50, 30],
      Y: [36, 112, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [55, 60],
        [55, 68],
        [88, 68],
        [88, 48],
        [104, 48],
        [104, 84],
        [61, 84],
        [61, 112],
      ],
    });
  });

  test("comes in through groups whose flows alternate in a grid that flows right", () => {
    const placement = checked(
      place(
        "right",
        [leaf("X", 50, 30), group("G", "down", [group("H", "right", [leaf("A", 50, 30)])])],
        ["X>A"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [10, 36, 50, 30],
      G: [80, 10, 102, 82],
      H: [96, 26, 76, 56],
      A: [112, 42, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [60, 51],
        [88, 51],
        [88, 18],
        [134, 18],
        [134, 34],
        [104, 34],
        [104, 57],
        [112, 57],
      ],
    });
  });

  test("runs out of two groups and into two others", () => {
    const placement = checked(
      place(
        "down",
        [
          group("G", "down", [group("H", "right", [leaf("A", 50, 30)])]),
          group("K", "right", [group("L", "down", [leaf("B", 50, 30)])]),
        ],
        ["A>B"],
      ),
    );

    expect(boxes(placement)).toEqual({
      G: [13, 10, 96, 82],
      H: [23, 20, 76, 56],
      A: [33, 30, 50, 30],
      K: [10, 112, 102, 82],
      L: [26, 128, 76, 56],
      B: [42, 144, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>B #0": [
        [83, 45],
        [91, 45],
        [91, 68],
        [61, 68],
        [61, 120],
        [18, 120],
        [18, 156],
        [34, 156],
        [34, 136],
        [67, 136],
        [67, 144],
      ],
    });
  });

  test("comes in through three groups", () => {
    const placement = checked(
      place(
        "down",
        [
          leaf("X", 50, 30),
          group("G", "right", [group("H", "down", [group("K", "right", [leaf("A", 50, 30)])])]),
        ],
        ["X>A"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [49, 10, 50, 30],
      G: [10, 60, 128, 108],
      H: [26, 76, 102, 82],
      K: [42, 92, 76, 56],
      A: [58, 108, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [74, 40],
        [74, 68],
        [18, 68],
        [18, 117],
        [34, 117],
        [34, 84],
        [80, 84],
        [80, 100],
        [50, 100],
        [50, 123],
        [58, 123],
      ],
    });
  });

  test("runs from a node of a group into two groups inside it", () => {
    const placement = checked(
      place(
        "down",
        [
          group("G", "down", [
            leaf("A", 50, 30),
            group("H", "right", [group("K", "down", [leaf("B", 50, 30)])]),
          ]),
        ],
        ["A>B"],
      ),
    );

    expect(boxes(placement)).toEqual({
      G: [10, 10, 122, 152],
      A: [46, 20, 50, 30],
      H: [20, 70, 102, 82],
      K: [36, 86, 76, 56],
      B: [52, 102, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>B #0": [
        [71, 50],
        [71, 78],
        [28, 78],
        [28, 114],
        [44, 114],
        [44, 94],
        [77, 94],
        [77, 102],
      ],
    });
  });

  test("goes back out of two groups to a node before them", () => {
    const placement = checked(
      place(
        "down",
        [leaf("X", 50, 30), group("G", "right", [group("H", "down", [leaf("A", 50, 30)])])],
        ["X>A", "A>X"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [42, 16, 50, 30],
      G: [10, 66, 114, 94],
      H: [26, 82, 82, 62],
      A: [42, 98, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [67, 46],
        [67, 74],
        [18, 74],
        [18, 113],
        [34, 113],
        [34, 90],
        [67, 90],
        [67, 98],
      ],
      "A>X #1": [
        [67, 128],
        [67, 136],
        [100, 136],
        [100, 113],
        [116, 113],
        [116, 152],
        [67, 152],
        [67, 168],
        [132, 168],
        [132, 8],
        [67, 8],
        [67, 16],
      ],
    });
  });

  test("shares the stretch through the border with an edge to another node of the outer group", () => {
    const placement = checked(
      place(
        "down",
        [
          leaf("X", 50, 30),
          group("G", "right", [group("H", "down", [leaf("A", 50, 30)]), leaf("B", 50, 30)]),
        ],
        ["X>A", "X>B"],
      ),
    );

    expect(boxes(placement)).toEqual({
      X: [38.5, 10, 50, 30],
      G: [10, 60, 107, 132],
      H: [31, 76, 76, 56],
      A: [47, 92, 50, 30],
      B: [44, 152, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "X>A #0": [
        [63.5, 40],
        [63.5, 68],
        [18, 68],
        [18, 104],
        [39, 104],
        [39, 84],
        [72, 84],
        [72, 92],
      ],
      "X>B #1": [
        [63.5, 40],
        [63.5, 68],
        [23, 68],
        [23, 167],
        [44, 167],
      ],
    });
  });

  test("goes out of and comes back into three groups whose flows alternate", () => {
    const placement = checked(
      place(
        "right",
        [
          group("G", "down", [
            group("H", "right", [group("K", "down", [leaf("A", 50, 30), leaf("C", 50, 30)])]),
          ]),
          leaf("Y", 50, 30),
        ],
        ["A>Y", "Y>C"],
      ),
    );

    expect(boxes(placement)).toEqual({
      G: [16, 10, 216, 126],
      H: [32, 26, 184, 94],
      K: [48, 42, 152, 62],
      A: [64, 58, 50, 30],
      C: [134, 58, 50, 30],
      Y: [252, 58, 50, 30],
    });
    expect(paths(placement)).toEqual({
      "A>Y #0": [
        [89, 88],
        [89, 96],
        [192, 96],
        [192, 73],
        [208, 73],
        [208, 112],
        [124, 112],
        [124, 128],
        [224, 128],
        [224, 73],
        [252, 73],
      ],
      "Y>C #1": [
        [302, 73],
        [310, 73],
        [310, 144],
        [8, 144],
        [8, 73],
        [24, 73],
        [24, 18],
        [124, 18],
        [124, 34],
        [40, 34],
        [40, 73],
        [56, 73],
        [56, 50],
        [159, 50],
        [159, 58],
      ],
    });
  });

  test("is refused when the node inside is too short between an edge in and an edge out", () => {
    expect(() =>
      place(
        "down",
        [
          leaf("B", 50, 30),
          group("G", "right", [group("H", "down", [leaf("N", 50, 4)])]),
          leaf("C", 50, 30),
        ],
        ["B>N", "N>C"],
      ),
    ).toThrow(
      new InvalidGraphError(
        'Node "N" is 4 long between the edges that enter it and the edges that leave it, less than the gap of 5 between edges.',
      ),
    );
  });

  test("is refused when the node inside is too narrow for it", () => {
    expect(() =>
      place(
        "down",
        [leaf("B", 50, 30), group("G", "right", [group("H", "down", [leaf("N", 9, 30)])])],
        ["B>N"],
      ),
    ).toThrow(
      new InvalidGraphError(
        'Node "N" is 9 across where its edges meet it, too narrow for an edge to keep 5 from its corners.',
      ),
    );
  });
});

/** Two leaves and an edge "A>B" between them with `room`. */
const withRoom = (room: number): Graph => ({
  direction: "down",
  nodes: [leaf("A", 50, 30), leaf("B", 50, 30)],
  edges: [{ id: "A>B", from: "A", to: "B", room }],
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
    ["an edge with a negative room", withRoom(-1), 'room of edge "A>B" is -1'],
    ["an edge with a room that is not a number", withRoom(Number.NaN), "NaN"],
    ["an edge with a room without end", withRoom(Number.POSITIVE_INFINITY), "Infinity"],
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
      [group("G", "right", [group("K", "right", [leaf("N", 1, 1)])])],
      ["G>N", "N>G"],
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

const spacings = fc.record({
  nodeGap: fc.double({ min: 0, max: 60, noNaN: true }),
  padding: fc.double({ min: 0, max: 40, noNaN: true }),
  edgeToNode: fc.double({ min: 0.5, max: 30, noNaN: true }),
  edgeGap: fc.double({ min: 0.5, max: 30, noNaN: true }),
  minSegment: fc.double({ min: 0.5, max: 30, noNaN: true }),
});

/** The leaves of `nodes` at any depth. */
const leavesOf = (nodes: readonly PlacedNode[]): PlacedNode[] =>
  nodes.flatMap((node) => (node.children.length === 0 ? [node] : leavesOf(node.children)));

/** How far `point` lies from the nearest point of `box`, 0 inside it. */
const distanceTo = (point: Point, box: Rect): number =>
  Math.hypot(
    Math.max(box.x - point.x, 0, point.x - (box.x + box.width)),
    Math.max(box.y - point.y, 0, point.y - (box.y + box.height)),
  );

describe("placeGraph: edges with room", () => {
  test("move the middle of a group's side that edges cross the gap between edges and both rooms from the line an edge with room turns onto", () => {
    const placement = placeGraph(
      {
        direction: "down",
        nodes: [
          group("G", "right", [
            group("H", "down", [
              group("K", "right", [leaf("A", 40, 22)]),
              leaf("B", 40, 22, { row: 1, column: 0 }),
              leaf("C", 40, 22),
            ]),
            leaf("D", 40, 22),
          ]),
        ],
        edges: [
          { id: "K>D", from: "K", to: "D" },
          { id: "B>D", from: "B", to: "D" },
          { id: "C>D", from: "C", to: "D", room: 11 },
        ],
      },
      { nodeGap: 32, padding: 16, edgeToNode: 8, edgeGap: 8, minSegment: 8 },
    );

    expect(branchPoints(placement.edges)).toEqual([
      { point: { x: 211, y: 146 }, edges: ["K>D"] },
      { point: { x: 211, y: 165 }, edges: ["C>D"] },
    ]);
  });

  /** Rooms from 0 to 30, or none, for the edges of a generated graph in order. */
  const rooms = fc.array(
    fc.option(fc.double({ min: 0, max: 30, noNaN: true }), { nil: undefined }),
    { minLength: 12, maxLength: 12 },
  );
  /** `any` with `roomOfEach` on its edges in order. */
  const withRooms = (any: Graph, roomOfEach: readonly (number | undefined)[]): Graph => ({
    ...any,
    edges: any.edges.map((edge, index) => {
      const room = roomOfEach[index];
      return room === undefined ? edge : { ...edge, room };
    }),
  });

  test("in any graph with room for its edges, and any rooms on them, is laid out with nothing broken", () => {
    fc.assert(
      fc.property(graphs, spacings, rooms, (any, anySpacing, roomOfEach) => {
        const roomed = withRooms(roomy(any, anySpacing), roomOfEach);
        expect(verify(placeGraph(roomed, anySpacing), anySpacing)).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  test("in any graph whose leaves are at least as wide and tall as twice the largest room, keep the room clear around each point where an edge with room parts from edges that share an end: inside the canvas, the clearance from every leaf, and clear of the room around every other such point", () => {
    fc.assert(
      fc.property(graphs, spacings, rooms, (any, anySpacing, roomOfEach) => {
        const widest = Math.max(0, ...roomOfEach.map((room) => room ?? 0));
        const by = Math.max(anySpacing.edgeGap, anySpacing.edgeToNode * 2) + widest * 2;
        const roomed = withRooms(
          { ...any, nodes: any.nodes.map((node) => widenedNode(node, by)) },
          roomOfEach,
        );
        const layout = placeGraph(roomed, anySpacing);
        const roomOf = new Map(roomed.edges.map((edge) => [edge.id, edge.room ?? 0]));
        const points = branchPoints(layout.edges).map(({ point, edges }) => ({
          point,
          room: Math.max(...edges.map((id) => roomOf.get(id) ?? 0)),
        }));
        const leaves = leavesOf(layout.nodes);
        const near = 1e-6;
        for (const { point, room } of points.filter((each) => each.room > 0)) {
          const { x, y } = point;
          expect(Math.min(x, y, layout.width - x, layout.height - y)).toBeGreaterThanOrEqual(
            room - near,
          );
          for (const { box } of leaves) {
            expect(distanceTo(point, box)).toBeGreaterThanOrEqual(
              room + anySpacing.edgeToNode - near,
            );
          }
          for (const other of points.filter((each) => each.point !== point)) {
            expect(Math.hypot(other.point.x - x, other.point.y - y)).toBeGreaterThanOrEqual(
              room + other.room - near,
            );
          }
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe("placeGraph: any graph", () => {
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

  test("draws every edge except one between a group and a node inside it, and no others, in the order they are listed", () => {
    /** Each node with the groups around it. */
    const groupsAround = (
      nodes: readonly GraphNode[],
      around: readonly string[] = [],
    ): [string, readonly string[]][] =>
      nodes.flatMap((node): [string, readonly string[]][] => [
        [node.id, around],
        ...("children" in node ? groupsAround(node.children, [...around, node.id]) : []),
      ]);

    fc.assert(
      fc.property(graphs, (any) => {
        const around = new Map(groupsAround(any.nodes));
        const expected = any.edges.filter(
          (edge) =>
            !(around.get(edge.from) ?? []).includes(edge.to) &&
            !(around.get(edge.to) ?? []).includes(edge.from),
        );
        const drawn = placeGraph(roomy(any, spacing), spacing).edges;
        expect(drawn.map(({ id, from, to }) => ({ id, from, to }))).toEqual(expected);
      }),
    );
  });
});

/** Every one of the graph given what `lineUpOf` makes of it, in the order the leaves are written. */
const linedUp = (any: Graph, lineUpOf: (one: Leaf, index: number) => Leaf): Graph => {
  let index = 0;
  const visit = (node: GraphNode): GraphNode => {
    if (!("children" in node)) {
      index += 1;
      return lineUpOf(node, index - 1);
    }
    const [first, ...rest] = node.children;
    return { ...node, children: [visit(first), ...rest.map(visit)] };
  };
  return { ...any, nodes: any.nodes.map(visit) };
};

/** How far in from each side an edge box lies, as parts of the one, and where in its middle half the middle lies. */
const insets = fc.record({
  left: fc.double({ min: 0.01, max: 0.24, noNaN: true }),
  top: fc.double({ min: 0.01, max: 0.24, noNaN: true }),
  right: fc.double({ min: 0.01, max: 0.24, noNaN: true }),
  bottom: fc.double({ min: 0.01, max: 0.24, noNaN: true }),
  across: fc.double({ min: 0.3, max: 0.7, noNaN: true }),
  down: fc.double({ min: 0.3, max: 0.7, noNaN: true }),
});

/**
 * A roomy graph whose leaves are made four times as large and line up by a part of them. The edge box is
 * at least half the one each way and the middle at least a quarter of it in from its sides, so a one
 * `roomy` made room on keeps that room where its edges meet it.
 */
const linedUpGraphs = fc
  .record({
    any: graphs,
    anySpacing: spacings,
    each: fc.array(insets, { minLength: 1, maxLength: 8 }),
  })
  .map(({ any, anySpacing, each }) => ({
    anySpacing,
    withLineUps: linedUp(roomy(any, anySpacing), (one, index): Leaf => {
      const width = one.size.width * 4;
      const height = one.size.height * 4;
      const { left, top, right, bottom, across, down } = each[index % each.length] ?? {
        left: 0.1,
        top: 0.1,
        right: 0.1,
        bottom: 0.1,
        across: 0.5,
        down: 0.5,
      };
      const x = width * left;
      const y = height * top;
      const box = { x, y, width: width * (1 - right) - x, height: height * (1 - bottom) - y };
      return {
        ...one,
        size: { width, height },
        lineUp: {
          middle: { x: x + box.width * across, y: y + box.height * down },
          edgeBox: box,
        },
      };
    }),
  }));

const leavesAtTop = (any: Graph): Map<string, Leaf> =>
  new Map(any.nodes.flatMap((node) => ("children" in node ? [] : [[node.id, node]])));

describe("placeGraph: any graph whose leaves line up by a part of them", () => {
  test("places a one withLineUps up by its middle and its own box as one with no line-up", () => {
    fc.assert(
      fc.property(graphs, spacings, (any, anySpacing) => {
        const plain = roomy(any, anySpacing);
        const whole = linedUp(plain, (one) => ({
          ...one,
          lineUp: {
            middle: { x: one.size.width / 2, y: one.size.height / 2 },
            edgeBox: { x: 0, y: 0, ...one.size },
          },
        }));
        expect(placeGraph(whole, anySpacing)).toEqual(placeGraph(plain, anySpacing));
      }),
    );
  });

  test("is laid out with nothing broken, but edges meeting a one's edge box inside the one", () => {
    fc.assert(
      fc.property(linedUpGraphs, ({ withLineUps, anySpacing }) => {
        const placed = placeGraph(withLineUps, anySpacing);
        const ends = new Map(withLineUps.edges.map((edge) => [edge.id, edge]));
        const leafIds = new Set(
          withLineUps.nodes.flatMap(function idsOf(node: GraphNode): string[] {
            return "children" in node ? node.children.flatMap(idsOf) : [node.id];
          }),
        );
        const broken = verify(placed, anySpacing).filter((violation) => {
          const edge = "edge" in violation ? ends.get(violation.edge) : undefined;
          if (violation.kind === "edge-not-attached") {
            return !leafIds.has(edge?.[violation.end] ?? "");
          }
          if (violation.kind === "edge-through-node") {
            const atItsEnd = edge?.from === violation.node || edge?.to === violation.node;
            return !(atItsEnd && leafIds.has(violation.node));
          }
          return true;
        });
        expect(broken).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  test("puts the middles of top-level leaves that name one row on one line, and of those that name one column", () => {
    fc.assert(
      fc.property(linedUpGraphs, ({ withLineUps, anySpacing }) => {
        const placed = new Map(
          placeGraph(withLineUps, anySpacing).nodes.map((node) => [node.id, node]),
        );
        const middles = [...leavesAtTop(withLineUps).values()].flatMap((one) => {
          const box = placed.get(one.id)?.box;
          return one.cell === undefined || box === undefined || one.lineUp === undefined
            ? []
            : [
                {
                  cell: one.cell,
                  x: box.x + one.lineUp.middle.x,
                  y: box.y + one.lineUp.middle.y,
                },
              ];
        });
        const apart = middles.flatMap((first) =>
          middles.flatMap((second) => [
            ...(first.cell.row === second.cell.row ? [Math.abs(first.y - second.y)] : []),
            ...(first.cell.column === second.cell.column ? [Math.abs(first.x - second.x)] : []),
          ]),
        );
        expect(apart.filter((distance) => distance > 1e-6)).toEqual([]);
      }),
    );
  });

  test("starts and ends an edge between two top-level leaves on their middle lines, at the sides of their edge boxes", () => {
    fc.assert(
      fc.property(linedUpGraphs, ({ withLineUps, anySpacing }) => {
        const leaves = leavesAtTop(withLineUps);
        const placement = placeGraph(withLineUps, anySpacing);
        const placed = new Map(placement.nodes.map((node) => [node.id, node.box]));
        /** Where an edge meets the leaf `one` on its side facing along the flow, or back. */
        const meeting = (one: Leaf, side: "along" | "back"): number[] => {
          const box = placed.get(one.id);
          const lineUp = one.lineUp;
          if (box === undefined || lineUp === undefined) {
            throw new Error(`Leaf "${one.id}" was not placed, or has no line-up.`);
          }
          const { middle, edgeBox } = lineUp;
          return withLineUps.direction === "down"
            ? [box.x + middle.x, box.y + edgeBox.y + (side === "along" ? edgeBox.height : 0)]
            : [box.x + edgeBox.x + (side === "along" ? edgeBox.width : 0), box.y + middle.y];
        };
        for (const edge of placement.edges) {
          const from = leaves.get(edge.from);
          const to = leaves.get(edge.to);
          const first = edge.points[0];
          const last = edge.points.at(-1);
          if (
            from === undefined ||
            to === undefined ||
            edge.from === edge.to ||
            last === undefined
          ) {
            continue;
          }
          const [startX = 0, startY = 0] = meeting(from, "along");
          const [endX = 0, endY = 0] = meeting(to, "back");
          expect(first.x).toBeCloseTo(startX, 6);
          expect(first.y).toBeCloseTo(startY, 6);
          expect(last.x).toBeCloseTo(endX, 6);
          expect(last.y).toBeCloseTo(endY, 6);
        }
      }),
    );
  });
});

/** A share of a length that keeps clear of its middle, so a middle placed there lies off it. */
const offMiddle = fc.oneof(
  fc.double({ min: 0.3, max: 0.45, noNaN: true }),
  fc.double({ min: 0.55, max: 0.7, noNaN: true }),
);

/**
 * A leaf L that lines up off its middle, in groups 0 to 3 deep that each flow as the canvas does, and a
 * node C beside the outermost group: before it along the flow with an edge C>L, or beside it across the
 * flow with a node X before the group and an edge X>L. L may also have an edge to itself.
 */
const linedUpInGroups = fc
  .record({
    direction: fc.constantFrom<Direction>("down", "right"),
    depth: fc.integer({ min: 0, max: 3 }),
    across: fc.boolean(),
    toItself: fc.boolean(),
    extra: fc.record({
      width: fc.double({ min: 0, max: 200, noNaN: true }),
      height: fc.double({ min: 0, max: 200, noNaN: true }),
    }),
    middle: fc.record({ x: offMiddle, y: offMiddle }),
    card: fc.record({
      width: fc.double({ min: 0, max: 200, noNaN: true }),
      height: fc.double({ min: 0, max: 200, noNaN: true }),
    }),
    anySpacing: spacings,
  })
  .map(({ direction, depth, across, toItself, extra, middle, card, anySpacing }) => {
    const least = 4 * (anySpacing.edgeToNode + anySpacing.edgeGap);
    const size = { width: least + extra.width, height: least + extra.height };
    const tile: Leaf = {
      id: "L",
      size,
      lineUp: {
        middle: { x: size.width * middle.x, y: size.height * middle.y },
        edgeBox: { x: 0, y: 0, ...size },
      },
    };
    let held: GraphNode = tile;
    for (let level = 0; level < depth; level += 1) {
      held = group(`G${level}`, direction, [held]);
    }
    const cardSize = { width: least + card.width, height: least + card.height };
    const at = (step: number, side: number): Cell =>
      direction === "down" ? { row: step, column: side } : { row: side, column: step };
    const nodes: GraphNode[] = across
      ? [
          leaf("X", cardSize.width, cardSize.height, at(0, 0)),
          { ...held, cell: at(1, 0) },
          leaf("C", cardSize.width, cardSize.height, at(1, 1)),
        ]
      : [leaf("C", cardSize.width, cardSize.height, at(0, 0)), { ...held, cell: at(1, 0) }];
    const links = [across ? "X>L" : "C>L", ...(toItself ? ["L>L"] : [])];
    return { across, tile, anySpacing, inGroups: graph(direction, nodes, links) };
  });

describe("placeGraph: any group whose one row and column hold a leaf that lines up by a part of it", () => {
  test("puts the leaf's middle on the middle line of the node beside the group, and runs the edge into it straight", () => {
    fc.assert(
      fc.property(linedUpInGroups, ({ across, tile, anySpacing, inGroups }) => {
        const placement = placeGraph(inGroups, anySpacing);
        const placed = new Map(flat(placement.nodes).map((node) => [node.id, node.box]));
        const leafBox = placed.get("L");
        const card = placed.get("C");
        if (leafBox === undefined || card === undefined || tile.lineUp === undefined) {
          throw new Error("L or C was not placed.");
        }
        // C before the group shares the line across the flow; C beside it, the line along the flow.
        const onX = (inGroups.direction === "down") !== across;
        const leafMiddle = onX
          ? leafBox.x + tile.lineUp.middle.x
          : leafBox.y + tile.lineUp.middle.y;
        const cardMiddle = onX ? card.x + card.width / 2 : card.y + card.height / 2;
        expect(leafMiddle).toBeCloseTo(cardMiddle, 6);

        const into = placement.edges.find((edge) => edge.from !== "L");
        expect(into?.points.length).toBe(2);
      }),
      { numRuns: 300 },
    );
  });
});
