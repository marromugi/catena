import type { Layout, PlacedEdge, PlacedNode, Point, Spacing } from "../layout";
import { assignSpots } from "./cells";
import { frameOf, type FlowPoint, type Frame, type Item } from "./frame";
import type { Direction, EdgeEnds, Graph, GraphEdge, GraphNode, LineUp, Size } from "./graph";
import { InvalidGraphError } from "./graph";
import { assignLanes, outside, type BorderCrossing, type Route, type Run } from "./lanes";

/** A grid laid out on its own, measured from the top-left corner of the box around it. */
interface Arrangement {
  readonly size: Size;
  /** The part of the grid that lines up with its neighbours, and whose sides edges meet. */
  readonly lineUp: LineUp;
  readonly nodes: readonly PlacedNode[];
  /** The edges drawn from end to end inside the grid. */
  readonly edges: readonly PlacedEdge[];
  /** The part inside the grid of each edge that crosses its border, by the edge's id, measured from the point where the edge crosses. */
  readonly crossings: ReadonlyMap<string, readonly Point[]>;
}

/** A node of `size` that lines up by its middle, and whose own sides edges meet. */
function wholeBoxOf(size: Size): LineUp {
  return {
    middle: { x: size.width / 2, y: size.height / 2 },
    edgeBox: { x: 0, y: 0, ...size },
  };
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

/** The node of a grid that is each node, or holds it at any depth, by the id of that node. */
function nodeAroundOf(nodes: readonly GraphNode[]): Map<string, string> {
  const nodeAround = new Map<string, string>();
  for (const node of nodes) {
    for (const id of idsIn(node)) {
      nodeAround.set(id, node.id);
    }
  }
  return nodeAround;
}

/**
 * Each edge as it bears on one grid: between the two nodes of the grid that hold its ends.
 * An edge with an end outside the grid is left out.
 */
function edgesBetween(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): EdgeEnds[] {
  const nodeAround = nodeAroundOf(nodes);
  return edges.flatMap((edge) => {
    const from = nodeAround.get(edge.from);
    const to = nodeAround.get(edge.to);
    return from === undefined || to === undefined ? [] : [{ from, to }];
  });
}

/**
 * The edges one grid draws, in the order they are listed. An end of an edge is drawn to the node of the
 * grid that is that end, or that holds it at any depth. An edge whose ends are drawn to two nodes runs
 * between them, and so does an edge from a node of the grid to itself; an edge drawn to one node with an
 * end inside it is left out. An edge in `crossing` runs between its end in the grid and the outside.
 *
 * @param crossing The ids of the edges that the grid around this one draws across this grid's border.
 */
function runsOf(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  crossing: ReadonlySet<string>,
): Run[] {
  const nodeAround = nodeAroundOf(nodes);
  return edges.flatMap((edge): Run[] => {
    const from = nodeAround.get(edge.from);
    const to = nodeAround.get(edge.to);
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
    if (to !== undefined) {
      return [{ id: edge.id, from: outside, to, startsInside: false, endsInside: to !== edge.to }];
    }
    if (from !== undefined) {
      return [
        { id: edge.id, from, to: outside, startsInside: from !== edge.from, endsInside: false },
      ];
    }
    throw new Error(
      `Edge "${edge.id}" crosses the border of a grid that holds neither of its ends.`,
    );
  });
}

/** The ids of the edges among `runs` that start or end inside the node `id`. */
function crossingInto(id: string, runs: readonly Run[]): Set<string> {
  return new Set(
    runs.flatMap((run) =>
      (run.from === id && run.startsInside) || (run.to === id && run.endsInside) ? [run.id] : [],
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
  for (const [id, { middle, edgeBox }] of items) {
    const across =
      2 * Math.min(middle.across - edgeBox.start.across, edgeBox.end.across - middle.across);
    if ((entered.has(id) || left.has(id)) && across < spacing.edgeToNode * 2) {
      throw new InvalidGraphError(
        `Node "${id}" is ${across} across where its edges meet it, too narrow for an edge to keep ${spacing.edgeToNode} from its corners.`,
      );
    }
    const along = edgeBox.end.along - edgeBox.start.along;
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
  if (route.kind === "fromBeside") {
    const beside = frame.laneBeside(route.beside, outside);
    const back = frame.laneBefore(edge.to);
    return [
      start,
      { across: beside, along: start.along },
      { across: beside, along: back },
      { ...end, along: back },
      end,
    ];
  }
  if (route.kind === "toBeside") {
    const out = frame.laneAfter(edge.from);
    const beside = frame.laneBeside(route.beside, outside);
    return [
      start,
      { ...start, along: out },
      { across: beside, along: out },
      { across: beside, along: end.along },
      end,
    ];
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
  border: BorderCrossing,
): Arrangement {
  const spots = assignSpots(nodes, direction, edgesBetween(nodes, edges));
  const runs = runsOf(nodes, edges, crossing);
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const turned = (point: FlowPoint): Point =>
    direction === "down"
      ? { x: point.across, y: point.along }
      : { x: point.along, y: point.across };
  const flowOf = (point: Point): FlowPoint =>
    direction === "down"
      ? { across: point.x, along: point.y }
      : { across: point.y, along: point.x };
  const arranged = nodes.map((node) => {
    const spot = spots.get(node.id);
    if (spot === undefined) {
      throw new Error(`Node "${node.id}" was given no spot, though every node of a grid gets one.`);
    }
    const inner: Arrangement =
      "children" in node
        ? arrange(
            node.children,
            node.direction,
            edges,
            spacing,
            crossingInto(node.id, runs),
            node.direction === direction ? "along" : "across",
          )
        : {
            size: node.size,
            lineUp: node.lineUp ?? wholeBoxOf(node.size),
            nodes: [],
            edges: [],
            crossings: new Map(),
          };
    const { size, lineUp } = inner;
    const { edgeBox } = lineUp;
    const item: Item = {
      ...spot,
      ...flowOf({ x: size.width, y: size.height }),
      middle: flowOf(lineUp.middle),
      edgeBox: {
        start: flowOf(edgeBox),
        end: flowOf({ x: edgeBox.x + edgeBox.width, y: edgeBox.y + edgeBox.height }),
      },
    };
    return { id: node.id, inner, item };
  });
  const items = new Map(arranged.map(({ id, item }) => [id, item]));

  requireRoomForEdges(items, runs, spacing);
  const lanes = assignLanes(items, runs, border);
  const frame = frameOf(items, runs, lanes, spacing, border);

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
        [...between, ...insideOf(run.to, run.id, last)].map((point) =>
          movedPoint(point, -first.x, -first.y),
        ),
      );
    } else if (run.to === outside) {
      crossings.set(
        run.id,
        [...insideOf(run.from, run.id, first), ...between].map((point) =>
          movedPoint(point, -last.x, -last.y),
        ),
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
  const size = { width: corner.x, height: corner.y };

  return {
    size,
    lineUp: { middle: turned(frame.middle), edgeBox: { x: 0, y: 0, ...size } },
    nodes: placed.map((each) => each.node),
    edges: [...drawn, ...placed.flatMap((each) => each.edges)],
    crossings,
  };
}

const isLength = (value: number): boolean => Number.isFinite(value) && value >= 0;

const isBetween = (value: number, from: number, to: number): boolean =>
  Number.isFinite(value) && from <= value && value <= to;

/** Whether the edge box lies in a leaf of `size`, and the middle in the edge box. */
function liesInside({ middle, edgeBox }: LineUp, size: Size): boolean {
  const right = edgeBox.x + edgeBox.width;
  const bottom = edgeBox.y + edgeBox.height;
  return (
    isBetween(edgeBox.x, 0, size.width) &&
    isBetween(edgeBox.y, 0, size.height) &&
    isBetween(right, edgeBox.x, size.width) &&
    isBetween(bottom, edgeBox.y, size.height) &&
    isBetween(middle.x, edgeBox.x, right) &&
    isBetween(middle.y, edgeBox.y, bottom)
  );
}

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
      if (node.lineUp !== undefined && !liesInside(node.lineUp, node.size)) {
        throw new InvalidGraphError(
          `Node "${node.id}" lines up by a box or a middle that lies outside it, or a middle outside that box.`,
        );
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
 * edge out of a group moves the group. A row or a column reaches as far before and after its middle line as
 * its nodes do, and a node sits with its middle on the middle lines of its row and its column: the middle
 * a leaf's line-up names, or the middle of its box. A group's middle is moved off the middle of its box, on
 * each side, as far as the middle line of its one row or column lies off that track's own middle; a group
 * with more than one row or column that way keeps the middle of its box. A group is as large as its grid,
 * and the grid of a group and of the canvas keeps at least the padding around its nodes.
 *
 * An edge leaves its source on the middle line of the source's column or row, at the side that faces along
 * the flow, and enters its target on its middle line at the side that faces back; those sides are of the
 * edge box a leaf's line-up names, or else of the node's box. It turns only in the corridors between rows and columns. The
 * edges that leave a node run as one until they part, and so do the edges that enter a node once they
 * have met. A corridor is at least the gap between nodes, or the padding at the outside, and wider where
 * edges need the room: for their lanes, to keep clear of the next row or column, or for a straight stretch.
 *
 * An edge with an end inside a group runs to the group as an edge to the group itself does, through the
 * group's middle on its side, and on inside the group to the node that is its end or holds it, as far in
 * as that end lies; it enters or leaves that end along the flow of the grid it is in. A group is made
 * longer at one end of that side where that keeps such an edge sound, and lines up by where it crosses. An edge between a group and a node
 * inside it is left out of the layout and orders no nodes.
 *
 * @returns Node boxes in the order and nesting of `graph.nodes`, and the edges drawn in the order of
 * `graph.edges`, in canvas coordinates.
 * @throws InvalidGraphError when the graph cannot be laid out as written: two nodes share an id or a
 * cell, two edges share an id, an edge connects a node that is not in the graph, a cell is not a pair of
 * whole numbers from 0 up, a size is negative or not finite, a leaf's line-up lies outside it or its
 * middle outside its edge box, a node reaches less than `edgeToNode`
 * to one side of its middle line where edges meet it, or a node is shorter than `edgeGap` between the
 * edges that enter it and those that leave it.
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
    "along",
  );
  const drawn = new Map(edges.map((edge) => [edge.id, edge]));
  return {
    ...size,
    nodes,
    edges: graph.edges.flatMap((edge) => drawn.get(edge.id) ?? []),
  };
}
