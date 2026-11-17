import type { Layout, PlacedEdge, PlacedNode, Point, Rect, Spacing } from "../layout";
import {
  areTooClose,
  contains,
  containsPoint,
  cutAtBorder,
  cutAtStart,
  doubleBack,
  inflate,
  isAttached,
  isOrthogonal,
  lengthOf,
  reversedStretch,
  restsBetween,
  runsAlongside,
  segmentsOf,
  separation,
  sharedLead,
  sharedThroughCuts,
  sidesAlong,
  straightened,
  TOLERANCE,
  type Segment,
  type Side,
  type Stretch,
} from "./geometry";

/** One way a layout is broken, naming what is involved by id. */
export type Violation =
  /** Two nodes with the same parent are closer than `nodeGap`. */
  | { readonly kind: "nodes-overlap"; readonly nodes: readonly [string, string] }
  /** A node is not inside its parent's box, `padding` in from the border. */
  | { readonly kind: "node-outside-parent"; readonly node: string; readonly parent: string }
  | { readonly kind: "node-outside-canvas"; readonly node: string }
  | { readonly kind: "edge-outside-canvas"; readonly edge: string }
  | { readonly kind: "label-outside-canvas"; readonly edge: string; readonly label: number }
  /** An end of the edge does not meet a side of its node at a right angle, away from the corners. A slanted end only has to start on the border. */
  | { readonly kind: "edge-not-attached"; readonly edge: string; readonly end: "from" | "to" }
  /** A stretch of the edge is neither horizontal nor vertical. That stretch is not checked against other edges, nor the edge against nodes or groups. */
  | { readonly kind: "edge-not-orthogonal"; readonly edge: string; readonly segment: number }
  /** A stretch of the edge is shorter than `minSegment`. */
  | { readonly kind: "edge-segment-too-short"; readonly edge: string; readonly segment: number }
  /**
   * The edge touches or comes within `edgeToNode` of a node it does not connect, or runs into, along, or closer than that beside one it does.
   * A node inside a group the edge connects is not checked: the group's border lies between them.
   */
  | { readonly kind: "edge-through-node"; readonly edge: string; readonly node: string }
  /** Both ends of the edge are inside the group, and the edge is anything but a path that stays strictly inside it. */
  | { readonly kind: "edge-leaves-group"; readonly edge: string; readonly group: string }
  /** One end of the edge is inside the group, and the edge does not cross its border exactly once. */
  | { readonly kind: "edge-miscrosses-group"; readonly edge: string; readonly group: string }
  /** A stretch of the edge runs beside the border of a group around one of its ends, closer than `edgeToNode`. */
  | { readonly kind: "edge-hugs-group"; readonly edge: string; readonly group: string }
  /**
   * Two stretches, of two edges or of one, come closer than `edgeGap`.
   * Crossing at a right angle is allowed where each stretch reaches `edgeGap` past the other on both sides.
   * Two stretches that meet at a bend of one edge count only when the edge turns straight back.
   * Two edges arrive at a node when each ends at it or at a node inside it, and depart from it when each
   * starts at it or at a node inside it. Two that both arrive at a node, or both depart from it, and meet
   * its border at one point may run as one through that point, as far each way as their paths are the
   * same; the two stretches that meet where they part, or where they join, do not count. An edge meets
   * the border of the node at its end at that end, and the border of a group around that end where it
   * first comes to it from there, a millionth short counting as there.
   */
  | { readonly kind: "edges-too-close"; readonly edges: readonly [string, string] }
  /** Two labels cover part of each other. Labels that only touch do not. */
  | {
      readonly kind: "labels-overlap";
      readonly labels: readonly [LabelReference, LabelReference];
    }
  /** A label covers part of a node that is not a group around an end of its edge. */
  | {
      readonly kind: "label-overlaps-node";
      readonly edge: string;
      readonly label: number;
      readonly node: string;
    };

/** A label, by its edge and its place among that edge's labels. */
export interface LabelReference {
  readonly edge: string;
  readonly label: number;
}

interface Entry {
  readonly node: PlacedNode;
  /** The ids of the groups around the node, nearest first. */
  readonly groups: readonly string[];
}

type Index = ReadonlyMap<string, Entry>;

/** A stretch two edges share, as it lies on the first and on the second. */
type SharedStretch = readonly [Stretch, Stretch];

function indexOf(nodes: readonly PlacedNode[]): Index {
  const index = new Map<string, Entry>();
  const visit = (node: PlacedNode, groups: readonly string[]) => {
    if (index.has(node.id)) {
      throw new Error(`The layout has two nodes with the id "${node.id}".`);
    }
    index.set(node.id, { node, groups });
    for (const child of node.children) {
      visit(child, [node.id, ...groups]);
    }
  };
  for (const node of nodes) {
    visit(node, []);
  }
  return index;
}

function entryOf(index: Index, edge: PlacedEdge, end: "from" | "to"): Entry {
  const entry = index.get(edge[end]);
  if (entry === undefined) {
    throw new Error(`Edge "${edge.id}" connects "${edge[end]}", which is not in the layout.`);
  }
  return entry;
}

function pairsOf<Item>(items: readonly Item[]): [Item, Item][] {
  return items.flatMap((first, index) =>
    items.slice(index + 1).map((second): [Item, Item] => [first, second]),
  );
}

function siblingViolations(
  siblings: readonly PlacedNode[],
  parent: PlacedNode | undefined,
  spacing: Spacing,
): Violation[] {
  const tooClose = pairsOf(siblings)
    .filter(([a, b]) => separation(a.box, b.box) < spacing.nodeGap - TOLERANCE)
    .map(([a, b]): Violation => ({ kind: "nodes-overlap", nodes: [a.id, b.id] }));
  const outside =
    parent === undefined
      ? []
      : siblings
          .filter((node) => !contains(inflate(parent.box, -spacing.padding), node.box))
          .map((node): Violation => ({
            kind: "node-outside-parent",
            node: node.id,
            parent: parent.id,
          }));
  return [
    ...tooClose,
    ...outside,
    ...siblings.flatMap((node) => siblingViolations(node.children, node, spacing)),
  ];
}

function canvasViolations(layout: Layout, canvas: Rect): Violation[] {
  return [
    ...layout.nodes
      .filter((node) => !contains(canvas, node.box))
      .map((node): Violation => ({ kind: "node-outside-canvas", node: node.id })),
    ...layout.edges
      .filter((edge) => !edge.points.every((point) => containsPoint(canvas, point)))
      .map((edge): Violation => ({ kind: "edge-outside-canvas", edge: edge.id })),
    ...layout.edges.flatMap((edge) =>
      edge.labels.flatMap((label, index): Violation[] =>
        contains(canvas, label.box)
          ? []
          : [{ kind: "label-outside-canvas", edge: edge.id, label: index }],
      ),
    ),
  ];
}

function shapeViolations(edge: PlacedEdge, index: Index, spacing: Spacing): Violation[] {
  const segments = segmentsOf(edge.points);
  const [first] = segments;
  const last = segments.at(-1);
  const violations: Violation[] = [];
  if (first !== undefined && !isAttached(entryOf(index, edge, "from").node.box, first)) {
    violations.push({ kind: "edge-not-attached", edge: edge.id, end: "from" });
  }
  if (
    last !== undefined &&
    !isAttached(entryOf(index, edge, "to").node.box, { from: last.to, to: last.from })
  ) {
    violations.push({ kind: "edge-not-attached", edge: edge.id, end: "to" });
  }
  segments.forEach((segment, segmentIndex) => {
    if (!isOrthogonal(segment)) {
      violations.push({ kind: "edge-not-orthogonal", edge: edge.id, segment: segmentIndex });
    } else if (lengthOf(segment) < spacing.minSegment - TOLERANCE) {
      violations.push({ kind: "edge-segment-too-short", edge: edge.id, segment: segmentIndex });
    }
  });
  return violations;
}

function sidesPassed(segments: readonly Segment[], rect: Rect): Side[] {
  const sides: Side[] = [];
  for (const side of segments.flatMap((segment) => sidesAlong(segment, rect))) {
    if (sides.at(-1) !== side) {
      sides.push(side);
    }
  }
  return sides;
}

function sameSides(actual: readonly Side[], expected: readonly Side[]): boolean {
  return actual.length === expected.length && actual.every((side, at) => side === expected[at]);
}

function routeViolations(edge: PlacedEdge, index: Index, spacing: Spacing): Violation[] {
  const segments = segmentsOf(edge.points);
  if (!segments.every(isOrthogonal)) {
    return [];
  }
  const groupsOfFrom = entryOf(index, edge, "from").groups;
  const groupsOfTo = entryOf(index, edge, "to").groups;

  const hugs = (rect: Rect) =>
    segments.some((segment) => runsAlongside(segment, rect, spacing.edgeToNode));

  const violations: Violation[] = [];
  for (const { node, groups } of index.values()) {
    const aroundFrom = groupsOfFrom.includes(node.id);
    const aroundTo = groupsOfTo.includes(node.id);
    const behindAnEnd = groups.includes(edge.from) || groups.includes(edge.to);
    const passed = sidesPassed(segments, node.box);
    if (node.id === edge.from || node.id === edge.to) {
      if (!sameSides(passed, ["outside"]) || hugs(node.box)) {
        violations.push({ kind: "edge-through-node", edge: edge.id, node: node.id });
      }
    } else if (aroundFrom || aroundTo) {
      if (aroundFrom && aroundTo) {
        if (!sameSides(passed, ["inside"])) {
          violations.push({ kind: "edge-leaves-group", edge: edge.id, group: node.id });
        }
      } else if (!sameSides(passed, aroundFrom ? ["inside", "outside"] : ["outside", "inside"])) {
        violations.push({ kind: "edge-miscrosses-group", edge: edge.id, group: node.id });
      }
      if (hugs(node.box)) {
        violations.push({ kind: "edge-hugs-group", edge: edge.id, group: node.id });
      }
    } else if (
      !behindAnEnd &&
      (!sameSides(passed, ["outside"]) ||
        sidesPassed(segments, inflate(node.box, spacing.edgeToNode)).includes("inside"))
    ) {
      violations.push({ kind: "edge-through-node", edge: edge.id, node: node.id });
    }
  }
  return violations;
}

function isTooCloseToItself(edge: PlacedEdge, spacing: Spacing): boolean {
  const stretches = segmentsOf(edge.points)
    .map((segment, at) => ({ at, segment }))
    .filter(({ segment }) => isOrthogonal(segment));
  return pairsOf(stretches).some(([a, b]) =>
    b.at - a.at === 1
      ? doubleBack(a.segment, b.segment)
      : areTooClose(a.segment, b.segment, spacing.edgeGap),
  );
}

/** The stretches two edges may share through the border of a node that is not the end of both. */
function sharedThroughBorders(a: PlacedEdge, b: PlacedEdge, index: Index): SharedStretch[] {
  const through = (end: "from" | "to"): SharedStretch[] => {
    const isAt = (edge: PlacedEdge, id: string) =>
      edge[end] === id || entryOf(index, edge, end).groups.includes(id);
    const fromThatEnd = (edge: PlacedEdge): readonly Point[] =>
      end === "from" ? edge.points : edge.points.toReversed();
    const cutOf = (edge: PlacedEdge, node: PlacedNode) =>
      edge[end] === node.id
        ? cutAtStart(fromThatEnd(edge))
        : cutAtBorder(fromThatEnd(edge), node.box);
    return [...index.values()]
      .filter(({ node }) => isAt(a, node.id) && isAt(b, node.id))
      .filter(({ node }) => a[end] !== node.id || b[end] !== node.id)
      .flatMap(({ node }) => {
        const cutOfA = cutOf(a, node);
        const cutOfB = cutOf(b, node);
        const shared =
          cutOfA === undefined || cutOfB === undefined
            ? undefined
            : sharedThroughCuts(cutOfA, cutOfB);
        return shared === undefined ? [] : [shared];
      });
  };
  const reversed = ([onA, onB]: SharedStretch): SharedStretch => [
    reversedStretch(onA),
    reversedStretch(onB),
  ];
  return [...through("from"), ...through("to").map(reversed)];
}

/** The stretches two edges may share, each as it lies on the first edge and on the second. */
function sharedStretches(a: PlacedEdge, b: PlacedEdge, index: Index): SharedStretch[] {
  const lead = a.from === b.from ? sharedLead(a.points, b.points) : 0;
  const tail = a.to === b.to ? sharedLead(a.points.toReversed(), b.points.toReversed()) : 0;
  const fromStart = { lead, tail: Number.POSITIVE_INFINITY };
  const toEnd = { lead: Number.POSITIVE_INFINITY, tail };
  return [
    ...(lead > TOLERANCE ? [[fromStart, fromStart] as const] : []),
    ...sharedThroughBorders(a, b, index),
    ...(tail > TOLERANCE ? [[toEnd, toEnd] as const] : []),
  ];
}

function shareOne(some: readonly number[], others: readonly number[]): boolean {
  return some.some((one) => others.includes(one));
}

function areEdgesTooClose(a: PlacedEdge, b: PlacedEdge, index: Index, spacing: Spacing): boolean {
  const shared = sharedStretches(a, b, index);
  const restsOf = (edge: PlacedEdge, which: 0 | 1) =>
    restsBetween(
      edge.points,
      shared.map((stretch) => stretch[which]),
    ).map((rest) => ({
      ...rest,
      segments: shared.length > 0 ? straightened(rest.segments) : rest.segments,
    }));
  const restsOfA = restsOf(a, 0);
  const restsOfB = restsOf(b, 1);
  const meeting = restsOfA.flatMap((restOfA) =>
    restsOfB.flatMap((restOfB) => [
      ...(shareOne(restOfA.after, restOfB.after)
        ? [[restOfA.segments[0], restOfB.segments[0]]]
        : []),
      ...(shareOne(restOfA.before, restOfB.before)
        ? [[restOfA.segments.at(-1), restOfB.segments.at(-1)]]
        : []),
    ]),
  );
  const allOfB = restsOfB.flatMap((rest) => rest.segments);
  return restsOfA
    .flatMap((rest) => rest.segments)
    .some((first) =>
      allOfB.some(
        (second) =>
          isOrthogonal(first) &&
          isOrthogonal(second) &&
          !meeting.some(([ofA, ofB]) => ofA === first && ofB === second) &&
          areTooClose(first, second, spacing.edgeGap),
      ),
    );
}

function closenessViolations(
  edges: readonly PlacedEdge[],
  index: Index,
  spacing: Spacing,
): Violation[] {
  return edges.flatMap((edge, at): Violation[] => [
    ...(isTooCloseToItself(edge, spacing)
      ? [{ kind: "edges-too-close" as const, edges: [edge.id, edge.id] as const }]
      : []),
    ...edges
      .slice(at + 1)
      .filter((other) => areEdgesTooClose(edge, other, index, spacing))
      .map((other): Violation => ({ kind: "edges-too-close", edges: [edge.id, other.id] })),
  ]);
}

function overlaps(a: Rect, b: Rect): boolean {
  return separation(a, b) < -TOLERANCE;
}

function labelViolations(edges: readonly PlacedEdge[], index: Index): Violation[] {
  const labels = edges.flatMap((edge) =>
    edge.labels.map((label, at) => ({ edge, label: at, box: label.box })),
  );

  const onLabels = pairsOf(labels)
    .filter(([a, b]) => overlaps(a.box, b.box))
    .map(([a, b]): Violation => ({
      kind: "labels-overlap",
      labels: [
        { edge: a.edge.id, label: a.label },
        { edge: b.edge.id, label: b.label },
      ],
    }));
  const onNodes = labels.flatMap(({ edge, label, box }) => {
    const around = [...entryOf(index, edge, "from").groups, ...entryOf(index, edge, "to").groups];
    return [...index.values()]
      .filter(({ node }) => !around.includes(node.id) && overlaps(box, node.box))
      .map(({ node }): Violation => ({
        kind: "label-overlaps-node",
        edge: edge.id,
        label,
        node: node.id,
      }));
  });
  return [...onLabels, ...onNodes];
}

function requireCoordinate(value: number, what: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${what} is ${value}, which is not a coordinate.`);
  }
}

function requireLength(value: number, what: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${what} is ${value}, which is not a length.`);
  }
}

function requireBox(box: Rect, what: string): void {
  requireCoordinate(box.x, `The x of ${what}`);
  requireCoordinate(box.y, `The y of ${what}`);
  requireLength(box.width, `The width of ${what}`);
  requireLength(box.height, `The height of ${what}`);
}

function requireNumbers(layout: Layout, spacing: Spacing, index: Index): void {
  for (const [name, value] of Object.entries(spacing)) {
    requireLength(value, `The spacing ${name}`);
  }
  requireLength(layout.width, "The width of the canvas");
  requireLength(layout.height, "The height of the canvas");
  for (const { node } of index.values()) {
    requireBox(node.box, `node "${node.id}"`);
  }
  for (const edge of layout.edges) {
    for (const point of edge.points) {
      requireCoordinate(point.x, `The x of a point of edge "${edge.id}"`);
      requireCoordinate(point.y, `The y of a point of edge "${edge.id}"`);
    }
    for (const label of edge.labels) {
      requireBox(label.box, `a label of edge "${edge.id}"`);
    }
  }
}

/**
 * Lists every way `layout` is broken; an empty list means it is sound.
 * @throws Error when the layout or the spacing is not one: two nodes share an id, an edge connects a node
 * that is not there, a coordinate is not a finite number, or a size or a spacing is negative or not finite.
 */
export function verify(layout: Layout, spacing: Spacing): Violation[] {
  const index = indexOf(layout.nodes);
  requireNumbers(layout, spacing, index);
  const canvas = { x: 0, y: 0, width: layout.width, height: layout.height };
  return [
    ...siblingViolations(layout.nodes, undefined, spacing),
    ...canvasViolations(layout, canvas),
    ...layout.edges.flatMap((edge) => [
      ...shapeViolations(edge, index, spacing),
      ...routeViolations(edge, index, spacing),
    ]),
    ...closenessViolations(layout.edges, index, spacing),
    ...labelViolations(layout.edges, index),
  ];
}
