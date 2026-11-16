import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { PlacedNode } from "../layout";
import { verify } from "../verify";
import { graphs } from "./graph.arbitrary";
import { InvalidGraphError, placeNodes } from "./index";
import type { Cell, Direction, Graph, GraphNode, NodePlacement } from "./index";

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
  edges: links.map((link) => {
    const [from = "", to = ""] = link.split(">");
    return { from, to };
  }),
});

const flat = (nodes: readonly PlacedNode[]): PlacedNode[] =>
  nodes.flatMap((node) => [node, ...flat(node.children)]);

/** Every node's box as [x, y, width, height], by id. */
const boxes = (placement: NodePlacement): Record<string, number[]> =>
  Object.fromEntries(
    flat(placement.nodes).map(({ id, box }) => [id, [box.x, box.y, box.width, box.height]]),
  );

const place = (direction: Direction, nodes: GraphNode[], links: string[] = []) =>
  placeNodes(graph(direction, nodes, links), spacing);

describe("placeNodes: the canvas", () => {
  test("is only its padding when the graph has no nodes", () => {
    expect(place("down", [])).toEqual({ width: 20, height: 20, nodes: [] });
  });

  test("keeps the padding around a single node", () => {
    expect(place("down", [leaf("A", 50, 30)])).toEqual({
      width: 70,
      height: 50,
      nodes: [{ id: "A", box: { x: 10, y: 10, width: 50, height: 30 }, children: [] }],
    });
  });
});

describe("placeNodes: order along the flow", () => {
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
    ["an edge that goes back to an earlier node", ["A>B", "B>A"]],
    ["an edge from a node to itself", ["A>B", "A>A", "B>B"]],
    ["the same edge twice", ["A>B", "A>B"]],
  ])("is not moved by %s", (_, links) => {
    expect(boxes(place("down", [leaf("A", 50, 30), leaf("B", 50, 30)], links))).toEqual({
      A: [10, 10, 50, 30],
      B: [10, 60, 50, 30],
    });
  });

  test("leaves a node where it is when only later nodes lead to it", () => {
    expect(boxes(place("down", chain, ["C>A", "B>A"]))).toEqual({
      A: [10, 15, 50, 30],
      B: [80, 10, 80, 40],
      C: [180, 15, 50, 30],
    });
  });
});

describe("placeNodes: a node that names its cell", () => {
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
      A: [10, 10, 50, 30],
      P: [80, 10, 50, 30],
    });
  });
});

describe("placeNodes: a group", () => {
  test("is its grid plus the padding, with its children inside", () => {
    const placement = place(
      "down",
      [group("G", "down", [leaf("A", 50, 30), leaf("B", 50, 30)])],
      ["A>B"],
    );
    expect(placement).toEqual({
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
      G: [10, 60, 70, 50],
      A: [20, 70, 50, 30],
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

describe("placeNodes: a graph that cannot be laid out", () => {
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
    expect(() => placeNodes(broken, spacing)).toThrow(InvalidGraphError);
    expect(() => placeNodes(broken, spacing)).toThrow(said);
  });

  test.each([
    ["a negative gap between nodes", { nodeGap: -1 }, "gap between nodes is -1"],
    ["a gap between nodes that is not a number", { nodeGap: Number.NaN }, "gap between nodes"],
    ["a negative padding", { padding: -1 }, "padding is -1"],
    ["a padding without end", { padding: Number.POSITIVE_INFINITY }, "padding is Infinity"],
  ])("refuses %s", (_, wrong, said) => {
    expect(() => placeNodes(graph("down", []), { ...spacing, ...wrong })).toThrow(said);
  });

  test("accepts a node of no size and a spacing of nothing", () => {
    expect(
      placeNodes(graph("down", [leaf("A", 0, 0), leaf("B", 50, 30)], ["A>B"]), {
        ...spacing,
        nodeGap: 0,
        padding: 0,
      }),
    ).toEqual({
      width: 50,
      height: 30,
      nodes: [
        { id: "A", box: { x: 25, y: 0, width: 0, height: 0 }, children: [] },
        { id: "B", box: { x: 0, y: 0, width: 50, height: 30 }, children: [] },
      ],
    });
  });
});

describe("placeNodes: any graph", () => {
  const spacings = fc.record({
    nodeGap: fc.double({ min: 0, max: 60, noNaN: true }),
    padding: fc.double({ min: 0, max: 40, noNaN: true }),
    edgeToNode: fc.constant(5),
    edgeGap: fc.constant(5),
    minSegment: fc.constant(8),
  });

  test("is laid out with nothing broken", () => {
    fc.assert(
      fc.property(graphs, spacings, (any, anySpacing) => {
        expect(verify({ ...placeNodes(any, anySpacing), edges: [] }, anySpacing)).toEqual([]);
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
        expect(placeNodes(any, spacing).nodes.map(placedShapeOf)).toEqual(any.nodes.map(shapeOf));
      }),
    );
  });

  test("puts a top-level node past every earlier top-level node that leads to it, unless it names its cell", () => {
    const idsIn = (node: GraphNode): string[] =>
      "children" in node ? [node.id, ...node.children.flatMap(idsIn)] : [node.id];

    fc.assert(
      fc.property(graphs, (any) => {
        const placed = placeNodes(any, spacing).nodes;
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
});
