import * as fc from "fast-check";
import type { Cell, Direction, Graph, GraphNode, Size } from "./graph";

/** A node before it has an id. */
type Shape =
  | { readonly size: Size; readonly cell: Cell | undefined }
  | {
      readonly direction: Direction;
      readonly children: readonly Shape[];
      readonly cell: Cell | undefined;
    };

const direction = fc.constantFrom<Direction>("down", "right");
const extent = fc.double({ min: 1, max: 300, noNaN: true });
const size = fc.record({ width: extent, height: extent });
const cell = fc.option(fc.record({ row: fc.nat({ max: 4 }), column: fc.nat({ max: 4 }) }), {
  nil: undefined,
});

const { node: shape } = fc.letrec<{ node: Shape; leaf: Shape; group: Shape }>((tie) => ({
  node: fc.oneof(tie("leaf"), tie("group")),
  leaf: fc.record({ size, cell }),
  group: fc.record({
    direction,
    cell,
    children: fc.array(tie("node"), { minLength: 1, maxLength: 4 }),
  }),
}));

/** Names the nodes n0, n1, … in the order they are written, and lets only the first of a grid keep a cell two of them name. */
function named(shapes: readonly Shape[], ids: string[]): GraphNode[] {
  const taken = new Set<string>();
  return shapes.map((each): GraphNode => {
    const id = `n${ids.length}`;
    ids.push(id);
    const key = each.cell === undefined ? undefined : `${each.cell.row}:${each.cell.column}`;
    const kept = key === undefined || taken.has(key) ? undefined : each.cell;
    if (key !== undefined) {
      taken.add(key);
    }
    if (!("children" in each)) {
      return { id, size: each.size, cell: kept };
    }
    const [first, ...rest] = named(each.children, ids);
    if (first === undefined) {
      throw new Error("A generated group has no children.");
    }
    return { id, direction: each.direction, children: [first, ...rest], cell: kept };
  });
}

/**
 * Graphs of the kinds `placeGraph` lays out when their leaves are large enough for their edges, which
 * these are not always: nested groups,
 * both directions, sizes from 1 up that are not whole numbers, nodes that name a cell up to row 4 and
 * column 4, and edges between any two nodes, including edges that go back, edges from a node to itself,
 * and edges between a group and a node inside it.
 */
export const graphs: fc.Arbitrary<Graph> = fc
  .record({
    direction,
    shapes: fc.array(shape, { maxLength: 6 }),
    links: fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 12 }),
  })
  .map(({ direction: flow, shapes, links }) => {
    const ids: string[] = [];
    const nodes = named(shapes, ids);
    const edges = links.flatMap(([from, to], index) => {
      const source = ids[from % ids.length];
      const target = ids[to % ids.length];
      return source === undefined || target === undefined
        ? []
        : [{ id: `e${index}`, from: source, to: target }];
    });
    return { direction: flow, nodes, edges };
  });
