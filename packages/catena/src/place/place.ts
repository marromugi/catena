import type { Layout, PlacedEdge, PlacedNode, Point, Spacing } from "../layout";
import { assignSpots } from "./cells";
import { frameOf, type FlowPoint, type Frame, type Item } from "./frame";
import type { Direction, EdgeEnds, Graph, GraphEdge, GraphNode, Size } from "./graph";
import { InvalidGraphError } from "./graph";
import { assignLanes, outside, type Route, type Run } from "./lanes";

/** A grid laid out on its own, measured from the top-left corner of the box around it. */
interface Arrangement {
  readonly size: Size;
  readonly nodes: readonly PlacedNode[];
  /** The edges drawn from end to end inside the grid. */
  readonly edges: readonly PlacedEdge[];
  /** The part inside the grid of each edge that crosses its border, by the edge's id, measured from the point where the edge crosses. */
  readonly crossings: ReadonlyMap<string, readonly Point[]>;
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

/**
 * Each edge as it bears on one grid: between the two nodes of the grid that hold its ends.
 * An edge with an end outside the grid is left out.
 */
function edgesBetween(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): EdgeEnds[] {
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
 * The edges one grid draws, in the order they are listed. An end of an edge is drawn to the node of the
 * grid that is that end, or that holds it as a child and flows as the grid does. An edge whose ends are
 * drawn to two nodes runs between them, and so does an edge from a node of the grid to itself; an edge
 * drawn to one node with an end inside it is left out. An edge in `crossing` runs between its end in
 * the grid and the outside.
 *
 * @param crossing The ids of the edges that the grid around this one draws across this grid's border.
 */
function runsOf(
  nodes: readonly GraphNode[],
  direction: Direction,
  edges: readonly GraphEdge[],
  crossing: ReadonlySet<string>,
): Run[] {
  const nodeAt = new Map<string, string>();
  for (const node of nodes) {
    nodeAt.set(node.id, node.id);
    if ("children" in node && node.direction === direction) {
      for (const child of node.children) {
        nodeAt.set(child.id, node.id);
      }
    }
  }
  return edges.flatMap((edge): Run[] => {
    const from = nodeAt.get(edge.from);
    const to = nodeAt.get(edge.to);
    if (from !== undefined && to !== undefined) {
      const startsInside = from !== edge.from;
      const endsInside = to !== edge.to;
      return from !== to || (!startsInside && !endsInside)
        ? [{ id: edge.id, from, to, startsInside, endsInside }]
        : [];
    }
    if (!crossing.has(edge.id)) {
      return [];
    }
    return [
      to === edge.to
        ? { id: edge.id, from: outside, to }
        : { id: edge.id, from: edge.from, to: outside },
    ];
  });
}

function crossingInto(id: string, runs: readonly Run[]): Set<string> {
  return new Set(
    runs.flatMap((run) =>
      run.from !== outside &&
      run.to !== outside &&
      ((run.from === id && run.startsInside) || (run.to === id && run.endsInside))
        ? [run.id]
        : [],
    ),
  );
}

function requireRoomForEdges(
  items: ReadonlyMap<string, Item>,
  edges: readonly Run[],
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

/** Two points that follow each other may be the same. */
function pathOf(edge: Run, route: Route, frame: Frame): FlowPoint[] {
  const start = edge.from === outside ? frame.entry : frame.exitOf(edge.from);
  const end = edge.to === outside ? frame.exit : frame.entryOf(edge.to);
  if (route.kind === "straight") {
    return [start, end];
  }
  if (route.kind === "direct" || route.kind === "joining") {
    const lane = route.kind === "direct" ? frame.laneAfter(edge.from) : frame.laneBefore(edge.to);
    return [start, { ...start, along: lane }, { ...end, along: lane }, end];
  }
  const out = frame.laneAfter(edge.from);
  const beside = frame.laneBeside(route.beside, edge.from);
  const back = frame.laneBefore(edge.to);
  return [
    start,
    { ...start, along: out },
    { across: beside, along: out },
    { across: beside, along: back },
    { ...end, along: back },
    end,
  ];
}

/** The path without the points that lie on a straight run between their neighbours, as a point that repeats its neighbour does. */
function withoutPointsOnRuns(points: readonly Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept.at(-1);
    const before = kept.at(-2);
    if (
      last !== undefined &&
      before !== undefined &&
      ((before.x === last.x && last.x === point.x) || (before.y === last.y && last.y === point.y))
    ) {
      kept.pop();
    }
    kept.push(point);
  }
  return kept;
}

function arrange(
  nodes: readonly GraphNode[],
  direction: Direction,
  edges: readonly GraphEdge[],
  spacing: Spacing,
  crossing: ReadonlySet<string>,
): Arrangement {
  const spots = assignSpots(nodes, direction, edgesBetween(nodes, edges));
  const runs = runsOf(nodes, direction, edges, crossing);
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const arranged = nodes.map((node) => {
    const spot = spots.get(node.id);
    if (spot === undefined) {
      throw new Error(`Node "${node.id}" was given no spot, though every node of a grid gets one.`);
    }
    const inner: Arrangement =
      "children" in node
        ? arrange(node.children, node.direction, edges, spacing, crossingInto(node.id, runs))
        : { size: node.size, nodes: [], edges: [], crossings: new Map() };
    const item: Item = {
      ...spot,
      across: direction === "down" ? inner.size.width : inner.size.height,
      along: direction === "down" ? inner.size.height : inner.size.width,
    };
    return { id: node.id, inner, item };
  });
  const items = new Map(arranged.map(({ id, item }) => [id, item]));

  requireRoomForEdges(items, runs, spacing);
  const lanes = assignLanes(items, runs);
  const frame = frameOf(items, runs, lanes, spacing);

  const turned = (point: FlowPoint): Point =>
    direction === "down"
      ? { x: point.across, y: point.along }
      : { x: point.along, y: point.across };
  const placed = arranged.map(({ id, inner }) => {
    const corner = turned(frame.cornerOf(id));
    return {
      node: {
        id,
        box: { ...corner, ...inner.size },
        children: inner.nodes.map((child) => movedNode(child, corner.x, corner.y)),
      },
      edges: inner.edges.map((edge) => movedEdge(edge, corner.x, corner.y)),
    };
  });
  const inners = new Map(arranged.map(({ id, inner }) => [id, inner]));
  /** The part of an edge inside the node at one of its ends, from the point `at` where it crosses the node's border. */
  const insideOf = (end: string, edge: string, at: Point): Point[] =>
    (inners.get(end)?.crossings.get(edge) ?? []).map((point) => movedPoint(point, at.x, at.y));

  const drawn: PlacedEdge[] = [];
  const crossings = new Map<string, Point[]>();
  for (const run of runs) {
    const route = lanes.routes.get(run.id);
    const edge = edgesById.get(run.id);
    if (route === undefined || edge === undefined) {
      throw new Error(`Edge "${run.id}" was given no route.`);
    }
    const between = pathOf(run, route, frame).map(turned);
    const first = between[0];
    const last = between.at(-1);
    if (first === undefined || last === undefined) {
      throw new Error(`Edge "${run.id}" was given a path of no points.`);
    }
    if (run.from === outside) {
      crossings.set(
        run.id,
        between.map((point) => movedPoint(point, -first.x, -first.y)),
      );
    } else if (run.to === outside) {
      crossings.set(
        run.id,
        between.map((point) => movedPoint(point, -last.x, -last.y)),
      );
    } else {
      const [start, second, ...rest] = withoutPointsOnRuns([
        ...insideOf(run.from, run.id, first),
        ...between,
        ...insideOf(run.to, run.id, last),
      ]);
      if (start === undefined || second === undefined) {
        throw new Error(`Edge "${run.id}" was given a path of fewer than two points.`);
      }
      drawn.push({ ...edge, points: [start, second, ...rest], labels: [] });
    }
  }
  const corner = turned(frame.size);

  return {
    size: { width: corner.x, height: corner.y },
    nodes: placed.map((each) => each.node),
    edges: [...drawn, ...placed.flatMap((each) => each.edges)],
    crossings,
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
 * Places the nodes of a graph, each grid in rows and columns, and draws the edges between two nodes of
 * one grid, and those that go on into a group of that grid as written below.
 *
 * The edges decide the order along the flow: a node goes after every node listed before it that leads to
 * it, unless it names its cell. In a grid, an edge counts between the two nodes that hold its ends, so an
 * edge out of a group moves the group. A node sits in the middle of its cell, a group is as large as its
 * grid, and the grid of a group and of the canvas keeps at least the padding around its nodes.
 *
 * An edge leaves the middle of the side of its source that faces along the flow and enters the middle of
 * the side of its target that faces back, turning only in the corridors between rows and columns. The
 * edges that leave a node run as one until they part, and so do the edges that enter a node once they
 * have met. A corridor is at least the gap between nodes, or the padding at the outside, and wider where
 * edges need the room: for their lanes, to keep clear of the next row or column, or for a straight stretch.
 *
 * An edge with an end that is a child of a group runs to the group as an edge to the group itself does,
 * through the middle of the group's side, and on inside the group to the child, when the group flows the
 * way the grid around it does. A group is made wider, on one side, where that keeps such an edge sound.
 * Any other edge between nodes of different grids orders them but is left out of the layout: one with an
 * end deeper than a child of a group, one through a group that flows the other way, and one between a
 * group and a node inside it.
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
  const { size, nodes, edges } = arrange(
    graph.nodes,
    graph.direction,
    graph.edges,
    spacing,
    new Set(),
  );
  const drawn = new Map(edges.map((edge) => [edge.id, edge]));
  return {
    ...size,
    nodes,
    edges: graph.edges.flatMap((edge) => drawn.get(edge.id) ?? []),
  };
}
