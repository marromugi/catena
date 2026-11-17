import type { Layout, PlacedEdge, PlacedNode, Point, Spacing } from "../layout";
import { assignCells, placeOf, stepOf } from "./cells";
import type { Direction, Graph, GraphEdge, GraphNode, Size } from "./graph";
import { InvalidGraphError } from "./graph";
import { assignLanes, type Spot } from "./lanes";

/** One row or one column of a grid. */
interface Track {
  readonly offset: number;
  readonly size: number;
}

/** Rows or columns in a line, with the length of the whole line. */
interface Line {
  readonly tracks: readonly Track[];
  readonly length: number;
}

/** A grid laid out on its own, measured from the top-left corner of the box around it. */
interface Arrangement {
  readonly size: Size;
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
}

/** A node as its grid sees it: its spot, and the room it takes across the flow and along it. */
interface Item extends Spot {
  readonly inner: Arrangement;
  readonly across: number;
  readonly along: number;
}

/** A point of a grid before the grid is turned to its direction. */
interface FlowPoint {
  readonly across: number;
  readonly along: number;
}

function idsIn(node: GraphNode): string[] {
  return "children" in node ? [node.id, ...node.children.flatMap(idsIn)] : [node.id];
}

function movedPoint(point: Point, dx: number, dy: number): Point {
  return { x: point.x + dx, y: point.y + dy };
}

function movedNode(node: PlacedNode, dx: number, dy: number): PlacedNode {
  return {
    id: node.id,
    box: { ...node.box, ...movedPoint(node.box, dx, dy) },
    children: node.children.map((child) => movedNode(child, dx, dy)),
  };
}

function movedEdge(edge: PlacedEdge, dx: number, dy: number): PlacedEdge {
  const [first, second, ...rest] = edge.points;
  return {
    ...edge,
    points: [
      movedPoint(first, dx, dy),
      movedPoint(second, dx, dy),
      ...rest.map((point) => movedPoint(point, dx, dy)),
    ],
  };
}

/** Each index in use, with its rank among those in use. */
function ranksOf(indices: readonly number[]): Map<number, number> {
  const inUse = [...new Set(indices)].toSorted((a, b) => a - b);
  return new Map(inUse.map((index, rank) => [index, rank]));
}

/** Lines up rows or columns with a corridor before each and one after the last. */
function lineUp(sizes: readonly number[], corridors: readonly number[]): Line {
  const tracks: Track[] = [];
  let end = 0;
  sizes.forEach((size, index) => {
    const offset = end + (corridors[index] ?? 0);
    tracks.push({ offset, size });
    end = offset + size;
  });
  return { tracks, length: end + (corridors[sizes.length] ?? 0) };
}

function trackOf(line: Line, index: number): Track {
  const track = line.tracks[index];
  if (track === undefined) {
    throw new Error(`No track was made for index ${index}, though a node sits in it.`);
  }
  return track;
}

/** Where the first of the lanes that take up `stack` lies, in the middle of the corridor before the track `index`. */
function firstLane(line: Line, corridors: readonly number[], index: number, stack: number): number {
  const end = line.tracks[index]?.offset ?? line.length;
  return end - ((corridors[index] ?? 0) + stack) / 2;
}

/**
 * Each edge as it bears on one grid: between the two nodes of the grid that hold its ends.
 * An edge with an end outside the grid is left out.
 */
function edgesBetween(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): Omit<GraphEdge, "id">[] {
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

/**
 * Refuses a node that edges cannot meet soundly: one too narrow for an edge to meet the middle of its
 * side clear of its corners, or too short for the edges that enter it and the edges that leave it to
 * keep apart.
 */
function requireRoomForEdges(
  items: ReadonlyMap<string, Item>,
  edges: readonly GraphEdge[],
  spacing: Spacing,
): void {
  const entered = new Set(edges.map((edge) => edge.to));
  const left = new Set(edges.map((edge) => edge.from));
  for (const [id, { across, along }] of items) {
    if ((entered.has(id) || left.has(id)) && across < spacing.edgeToNode * 2) {
      throw new InvalidGraphError(
        `Node "${id}" is ${across} across where its edges meet it, too narrow for an edge to keep ${spacing.edgeToNode} from its corners.`,
      );
    }
    if (entered.has(id) && left.has(id) && along < spacing.edgeGap) {
      throw new InvalidGraphError(
        `Node "${id}" is ${along} long between the edges that enter it and the edges that leave it, less than the gap of ${spacing.edgeGap} between edges.`,
      );
    }
  }
}

function arrange(
  nodes: readonly GraphNode[],
  direction: Direction,
  edges: readonly GraphEdge[],
  spacing: Spacing,
): Arrangement {
  const cells = assignCells(nodes, direction, edgesBetween(nodes, edges));
  const stepRanks = ranksOf([...cells.values()].map((cell) => stepOf(cell, direction)));
  const placeRanks = ranksOf([...cells.values()].map((cell) => placeOf(cell, direction)));
  const items = new Map(
    nodes.map((node): [string, Item] => {
      const cell = cells.get(node.id);
      if (cell === undefined) {
        throw new Error(
          `Node "${node.id}" was given no cell, though every node of a grid gets one.`,
        );
      }
      const inner: Arrangement =
        "children" in node
          ? arrange(node.children, node.direction, edges, spacing)
          : { size: node.size, nodes: [], edges: [] };
      return [
        node.id,
        {
          inner,
          step: stepRanks.get(stepOf(cell, direction)) ?? 0,
          place: placeRanks.get(placeOf(cell, direction)) ?? 0,
          across: direction === "down" ? inner.size.width : inner.size.height,
          along: direction === "down" ? inner.size.height : inner.size.width,
        },
      ];
    }),
  );
  const itemOf = (id: string): Item => {
    const item = items.get(id);
    if (item === undefined) {
      throw new Error(`Node "${id}" is not in the grid, though an edge of the grid connects it.`);
    }
    return item;
  };

  const own = edges.filter((edge) => items.has(edge.from) && items.has(edge.to));
  requireRoomForEdges(items, own, spacing);
  const lanes = assignLanes(items, own);

  const rowSizes = Array.from({ length: stepRanks.size }, () => 0);
  const columnSizes = Array.from({ length: placeRanks.size }, () => 0);
  for (const item of items.values()) {
    rowSizes[item.step] = Math.max(rowSizes[item.step] ?? 0, item.along);
    columnSizes[item.place] = Math.max(columnSizes[item.place] ?? 0, item.across);
  }

  // The clear room an edge keeps: from a node beside it, from another edge, and for its own shortest stretch.
  const margin = Math.max(spacing.edgeToNode, spacing.edgeGap, spacing.minSegment);
  const stackOf = (count: number): number => Math.max(0, count - 1) * spacing.edgeGap;
  const rowStacks = rowSizes.concat(0).map((_, corridor) => {
    const leaving = lanes.leaving[corridor]?.length ?? 0;
    const entering = lanes.entering[corridor]?.length ?? 0;
    const between = leaving > 0 && entering > 0 ? Math.max(spacing.edgeGap, spacing.minSegment) : 0;
    return {
      lanes: leaving + entering,
      entering: stackOf(leaving) + between,
      height: stackOf(leaving) + between + stackOf(entering),
    };
  });
  const columnStacks = columnSizes
    .concat(0)
    .map((_, corridor) => ({ lanes: lanes.beside[corridor]?.length ?? 0 }))
    .map((stack) => ({ ...stack, height: stackOf(stack.lanes) }));
  const crossed = new Set(
    own
      .filter((edge) => lanes.routes.get(edge.id)?.kind === "straight")
      .map((edge) => itemOf(edge.to).step),
  );

  /**
   * The corridors around tracks of `sizes`: as wide as the spacing asks, as the lanes in them need, and,
   * in a grid with edges, wide enough to keep the middle of each track `margin` from the next track.
   */
  const corridorsOf = (
    sizes: readonly number[],
    stacks: readonly { lanes: number; height: number }[],
    crossing: (corridor: number) => number,
  ): number[] =>
    stacks.map((stack, corridor) => {
      const narrowest = Math.min(
        sizes[corridor - 1] ?? Number.POSITIVE_INFINITY,
        sizes[corridor] ?? Number.POSITIVE_INFINITY,
      );
      return Math.max(
        corridor === 0 || corridor === sizes.length ? spacing.padding : spacing.nodeGap,
        own.length > 0 ? margin - narrowest / 2 : 0,
        stack.lanes > 0 ? margin * 2 + stack.height : 0,
        crossing(corridor),
      );
    });
  const rowCorridors = corridorsOf(rowSizes, rowStacks, (corridor) =>
    crossed.has(corridor) ? spacing.minSegment : 0,
  );
  const columnCorridors = corridorsOf(columnSizes, columnStacks, () => 0);
  const rows = lineUp(rowSizes, rowCorridors);
  const columns = lineUp(columnSizes, columnCorridors);

  const laneOf = (list: readonly (readonly string[])[], corridor: number, id: string): number => {
    const lane = list[corridor]?.indexOf(id) ?? -1;
    if (lane === -1) {
      throw new Error(
        `Node "${id}" has no lane in corridor ${corridor}, though an edge runs in it.`,
      );
    }
    return lane * spacing.edgeGap;
  };
  const cornerOf = (id: string): FlowPoint => {
    const item = itemOf(id);
    const row = trackOf(rows, item.step);
    const column = trackOf(columns, item.place);
    return {
      across: column.offset + (column.size - item.across) / 2,
      along: row.offset + (row.size - item.along) / 2,
    };
  };

  const pathOf = (edge: GraphEdge): FlowPoint[] => {
    const route = lanes.routes.get(edge.id);
    if (route === undefined) {
      throw new Error(`Edge "${edge.id}" was given no route.`);
    }
    const from = itemOf(edge.from);
    const to = itemOf(edge.to);
    const start = {
      across: cornerOf(edge.from).across + from.across / 2,
      along: cornerOf(edge.from).along + from.along,
    };
    const end = {
      across: cornerOf(edge.to).across + to.across / 2,
      along: cornerOf(edge.to).along,
    };
    if (route.kind === "straight") {
      return [start, end];
    }
    const out =
      firstLane(rows, rowCorridors, from.step + 1, rowStacks[from.step + 1]?.height ?? 0) +
      laneOf(lanes.leaving, from.step + 1, edge.from);
    if (route.kind === "direct") {
      return [start, { ...start, along: out }, { ...end, along: out }, end];
    }
    const beside =
      firstLane(columns, columnCorridors, route.beside, columnStacks[route.beside]?.height ?? 0) +
      laneOf(lanes.beside, route.beside, edge.from);
    const back =
      firstLane(rows, rowCorridors, to.step, rowStacks[to.step]?.height ?? 0) +
      (rowStacks[to.step]?.entering ?? 0) +
      laneOf(lanes.entering, to.step, edge.to);
    return [
      start,
      { ...start, along: out },
      { across: beside, along: out },
      { across: beside, along: back },
      { ...end, along: back },
      end,
    ];
  };

  const turned = (point: FlowPoint): Point =>
    direction === "down"
      ? { x: point.across, y: point.along }
      : { x: point.along, y: point.across };
  const placed = nodes.map((node) => {
    const { inner } = itemOf(node.id);
    const corner = turned(cornerOf(node.id));
    return {
      node: {
        id: node.id,
        box: { ...corner, ...inner.size },
        children: inner.nodes.map((child) => movedNode(child, corner.x, corner.y)),
      },
      edges: inner.edges.map((edge) => movedEdge(edge, corner.x, corner.y)),
    };
  });
  const drawn = own.map((edge): PlacedEdge => {
    const [first, second, ...rest] = pathOf(edge).map(turned);
    if (first === undefined || second === undefined) {
      throw new Error(`Edge "${edge.id}" was given a path of fewer than two points.`);
    }
    return { ...edge, points: [first, second, ...rest], labels: [] };
  });
  const corner = turned({ across: columns.length, along: rows.length });

  return {
    size: { width: corner.x, height: corner.y },
    nodes: placed.map((each) => each.node),
    edges: [...drawn, ...placed.flatMap((each) => each.edges)],
  };
}

const isLength = (value: number): boolean => Number.isFinite(value) && value >= 0;

function requireSound(graph: Graph, spacing: Spacing): void {
  for (const [name, value] of Object.entries(spacing)) {
    if (!isLength(value)) {
      throw new Error(`The spacing ${name} is ${value}, which is not a length.`);
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

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      throw new InvalidGraphError(`The graph has two edges with the id "${edge.id}".`);
    }
    edgeIds.add(edge.id);
    for (const end of [edge.from, edge.to]) {
      if (!ids.has(end)) {
        throw new InvalidGraphError(
          `Edge "${edge.id}" connects "${end}", which is not in the graph.`,
        );
      }
    }
  }
}

/**
 * Places the nodes of a graph, each grid in rows and columns, and draws the edges between two nodes of one grid.
 *
 * The edges decide the order along the flow: a node goes after every node listed before it that leads to
 * it, unless it names its cell. In a grid, an edge counts between the two nodes that hold its ends, so an
 * edge out of a group moves the group. A node sits in the middle of its cell, a group is as large as its
 * grid plus the padding, and the canvas keeps the same padding around the top-level nodes.
 *
 * An edge leaves the middle of the side of its source that faces along the flow and enters the middle of
 * the side of its target that faces back, turning only in the corridors between rows and columns. The
 * edges that leave a node run as one until they part, and so do the edges that enter a node once they
 * have met. A corridor is widened past the gap between nodes, or the padding, when its lanes need the room.
 * An edge between nodes of different grids orders them but is left out of the layout.
 *
 * @returns Node boxes in the order and nesting of `graph.nodes`, and the edges drawn in the order of
 * `graph.edges`, in canvas coordinates.
 * @throws InvalidGraphError when the graph cannot be laid out as written: two nodes share an id or a
 * cell, two edges share an id, an edge connects a node that is not in the graph, a cell is not a pair of
 * whole numbers from 0 up, a size is negative or not finite, a node is narrower than twice `edgeToNode`
 * where edges meet it, or a node is shorter than `edgeGap` between the edges that enter it and those
 * that leave it.
 * @throws Error when a spacing is negative or not finite.
 */
export function placeGraph(graph: Graph, spacing: Spacing): Layout {
  requireSound(graph, spacing);
  if (graph.nodes.length === 0) {
    return { width: spacing.padding * 2, height: spacing.padding * 2, nodes: [], edges: [] };
  }
  const { size, nodes, edges } = arrange(graph.nodes, graph.direction, graph.edges, spacing);
  const drawn = new Map(edges.map((edge) => [edge.id, edge]));
  return {
    ...size,
    nodes,
    edges: graph.edges.flatMap((edge) => drawn.get(edge.id) ?? []),
  };
}
