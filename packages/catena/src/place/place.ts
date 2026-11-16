import type { Layout, PlacedNode, Spacing } from "../layout";
import { assignCells } from "./cells";
import type { Cell, Direction, Graph, GraphEdge, GraphNode, Size } from "./graph";
import { InvalidGraphError } from "./graph";

/** Where the nodes of a graph go, before its edges are drawn. */
export type NodePlacement = Omit<Layout, "edges">;

/** One row or one column of a grid. */
interface Track {
  readonly offset: number;
  readonly size: number;
}

/** A grid laid out on its own, measured from the top-left corner of the box around it. */
interface Arrangement {
  readonly size: Size;
  readonly nodes: readonly PlacedNode[];
}

function idsIn(node: GraphNode): string[] {
  return "children" in node ? [node.id, ...node.children.flatMap(idsIn)] : [node.id];
}

function moved(node: PlacedNode, dx: number, dy: number): PlacedNode {
  return {
    id: node.id,
    box: { ...node.box, x: node.box.x + dx, y: node.box.y + dy },
    children: node.children.map((child) => moved(child, dx, dy)),
  };
}

/**
 * Lines up the rows or the columns that hold something, each as large as the largest thing in it.
 * A row or column that holds nothing takes no room.
 */
function tracksOf(
  entries: readonly (readonly [index: number, extent: number])[],
  spacing: Spacing,
): { tracks: Map<number, Track>; length: number } {
  const sizes = new Map<number, number>();
  for (const [index, extent] of entries) {
    sizes.set(index, Math.max(sizes.get(index) ?? 0, extent));
  }
  const tracks = new Map<number, Track>();
  let end = spacing.padding;
  for (const [index, size] of [...sizes].toSorted(([a], [b]) => a - b)) {
    const offset = tracks.size === 0 ? end : end + spacing.nodeGap;
    tracks.set(index, { offset, size });
    end = offset + size;
  }
  return { tracks, length: end + spacing.padding };
}

function trackAt(tracks: Map<number, Track>, index: number): Track {
  const track = tracks.get(index);
  if (track === undefined) {
    throw new Error(`No track was made for index ${index}, though a node sits in it.`);
  }
  return track;
}

function cellOf(cells: Map<string, Cell>, node: GraphNode): Cell {
  const cell = cells.get(node.id);
  if (cell === undefined) {
    throw new Error(`Node "${node.id}" was given no cell, though every node of a grid gets one.`);
  }
  return cell;
}

/**
 * Each edge as it bears on one grid: between the two nodes of the grid that hold its ends.
 * An edge with an end outside the grid is left out.
 */
function edgesBetween(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): GraphEdge[] {
  const nodeAround = new Map<string, string>();
  for (const node of nodes) {
    for (const id of idsIn(node)) {
      nodeAround.set(id, node.id);
    }
  }
  return edges.flatMap((edge) => {
    const from = nodeAround.get(edge.from);
    const to = nodeAround.get(edge.to);
    return from === undefined || to === undefined ? [] : [{ from, to }];
  });
}

function arrange(
  nodes: readonly GraphNode[],
  direction: Direction,
  edges: readonly GraphEdge[],
  spacing: Spacing,
): Arrangement {
  const cells = assignCells(nodes, direction, edgesBetween(nodes, edges));

  const items = nodes.map((node) => ({
    id: node.id,
    cell: cellOf(cells, node),
    inner:
      "children" in node
        ? arrange(node.children, node.direction, edges, spacing)
        : { size: node.size, nodes: [] },
  }));
  const columns = tracksOf(
    items.map((item) => [item.cell.column, item.inner.size.width]),
    spacing,
  );
  const rows = tracksOf(
    items.map((item) => [item.cell.row, item.inner.size.height]),
    spacing,
  );

  return {
    size: { width: columns.length, height: rows.length },
    nodes: items.map(({ id, cell, inner }) => {
      const column = trackAt(columns.tracks, cell.column);
      const row = trackAt(rows.tracks, cell.row);
      const x = column.offset + (column.size - inner.size.width) / 2;
      const y = row.offset + (row.size - inner.size.height) / 2;
      return {
        id,
        box: { x, y, ...inner.size },
        children: inner.nodes.map((child) => moved(child, x, y)),
      };
    }),
  };
}

const isLength = (value: number): boolean => Number.isFinite(value) && value >= 0;

function requireSound(graph: Graph, spacing: Spacing): void {
  for (const [what, value] of [
    ["The gap between nodes", spacing.nodeGap],
    ["The padding", spacing.padding],
  ] as const) {
    if (!isLength(value)) {
      throw new Error(`${what} is ${value}, which is not a length.`);
    }
  }

  const ids = new Set<string>();
  const visit = (node: GraphNode): void => {
    if (ids.has(node.id)) {
      throw new InvalidGraphError(`The graph has two nodes with the id "${node.id}".`);
    }
    ids.add(node.id);
    if ("children" in node) {
      node.children.forEach(visit);
    } else {
      for (const [what, value] of [
        ["width", node.size.width],
        ["height", node.size.height],
      ] as const) {
        if (!isLength(value)) {
          throw new InvalidGraphError(
            `The ${what} of node "${node.id}" is ${value}, which is not a length.`,
          );
        }
      }
    }
  };
  graph.nodes.forEach(visit);

  for (const edge of graph.edges) {
    for (const end of [edge.from, edge.to]) {
      if (!ids.has(end)) {
        throw new InvalidGraphError(`An edge connects "${end}", which is not in the graph.`);
      }
    }
  }
}

/**
 * Places the nodes of a graph, each grid in rows and columns, without drawing its edges.
 *
 * The edges only decide the order along the flow: a node goes after every node listed before it that
 * leads to it, unless it names its cell. In a grid, an edge counts between the two nodes that hold its
 * ends, so an edge out of a group moves the group. A node sits in the middle of its cell, a group is as
 * large as its grid plus the padding, and the canvas keeps the same padding around the top-level nodes.
 *
 * @returns Node boxes in canvas coordinates, in the order and nesting of `graph.nodes`.
 * @throws InvalidGraphError when the graph cannot be laid out as written: two nodes share an id or a
 * cell, an edge connects a node that is not in the graph, a cell is not a pair of whole numbers from 0
 * up, or a size is negative or not finite.
 * @throws Error when the gap between nodes or the padding is negative or not finite.
 */
export function placeNodes(graph: Graph, spacing: Spacing): NodePlacement {
  requireSound(graph, spacing);
  const { size, nodes } = arrange(graph.nodes, graph.direction, graph.edges, spacing);
  return { width: size.width, height: size.height, nodes };
}
