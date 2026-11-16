import type { Layout, PlacedEdge, PlacedNode, Rect, Spacing } from "../layout";
import {
  contains,
  containsPoint,
  distanceBetweenParallels,
  inflate,
  isHorizontal,
  isOnBorder,
  isVertical,
  lengthOf,
  segmentsOf,
  separation,
  sharedRun,
  sidesAlong,
  TOLERANCE,
  type Segment,
  type Side,
} from "./geometry";

/** One way a layout is broken, naming what is involved by id. A label is named by its edge and its place in that edge's labels. */
export type Violation =
  /** Two nodes with the same parent are closer than `nodeGap`. */
  | { readonly kind: "nodes-overlap"; readonly nodes: readonly [string, string] }
  /** A node is not inside its parent's box, `padding` in from the border. */
  | { readonly kind: "node-outside-parent"; readonly node: string; readonly parent: string }
  | { readonly kind: "node-outside-canvas"; readonly node: string }
  | { readonly kind: "edge-outside-canvas"; readonly edge: string }
  | { readonly kind: "label-outside-canvas"; readonly edge: string; readonly label: number }
  /** An end of the edge is not on the border of the node it connects. */
  | { readonly kind: "edge-not-attached"; readonly edge: string; readonly end: "from" | "to" }
  /** A stretch of the edge is neither horizontal nor vertical. The edge is not checked against nodes or other edges. */
  | { readonly kind: "edge-not-orthogonal"; readonly edge: string; readonly segment: number }
  /** A stretch of the edge is shorter than `minSegment`. */
  | { readonly kind: "edge-segment-too-short"; readonly edge: string; readonly segment: number }
  /** The edge comes within `edgeToNode` of a node it does not connect, or runs into or along one it does. */
  | { readonly kind: "edge-through-node"; readonly edge: string; readonly node: string }
  /** Both ends of the edge are inside the group, and the edge is not. */
  | { readonly kind: "edge-leaves-group"; readonly edge: string; readonly group: string }
  /** One end of the edge is inside the group, and the edge does not cross its border exactly once. */
  | { readonly kind: "edge-miscrosses-group"; readonly edge: string; readonly group: string }
  /** Two stretches, of two edges or of one, run side by side closer than `edgeGap`. */
  | { readonly kind: "edges-overlap"; readonly edges: readonly [string, string] }
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

function isOrthogonal(segment: Segment): boolean {
  return isHorizontal(segment) || isVertical(segment);
}

function shapeViolations(edge: PlacedEdge, index: Index, spacing: Spacing): Violation[] {
  const [first] = edge.points;
  const last = edge.points.at(-1) ?? first;
  const violations: Violation[] = [];
  if (!isOnBorder(entryOf(index, edge, "from").node.box, first)) {
    violations.push({ kind: "edge-not-attached", edge: edge.id, end: "from" });
  }
  if (!isOnBorder(entryOf(index, edge, "to").node.box, last)) {
    violations.push({ kind: "edge-not-attached", edge: edge.id, end: "to" });
  }
  segmentsOf(edge.points).forEach((segment, segmentIndex) => {
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

  const violations: Violation[] = [];
  for (const { node } of index.values()) {
    const aroundFrom = groupsOfFrom.includes(node.id);
    const aroundTo = groupsOfTo.includes(node.id);
    if (node.id === edge.from || node.id === edge.to) {
      if (!sameSides(sidesPassed(segments, node.box), ["outside"])) {
        violations.push({ kind: "edge-through-node", edge: edge.id, node: node.id });
      }
    } else if (aroundFrom && aroundTo) {
      if (!sameSides(sidesPassed(segments, node.box), ["inside"])) {
        violations.push({ kind: "edge-leaves-group", edge: edge.id, group: node.id });
      }
    } else if (aroundFrom || aroundTo) {
      const expected: Side[] = aroundFrom ? ["inside", "outside"] : ["outside", "inside"];
      if (!sameSides(sidesPassed(segments, node.box), expected)) {
        violations.push({ kind: "edge-miscrosses-group", edge: edge.id, group: node.id });
      }
    } else if (sidesPassed(segments, inflate(node.box, spacing.edgeToNode)).includes("inside")) {
      violations.push({ kind: "edge-through-node", edge: edge.id, node: node.id });
    }
  }
  return violations;
}

function overlapViolations(edges: readonly PlacedEdge[], spacing: Spacing): Violation[] {
  const stretches = edges.flatMap((edge) =>
    segmentsOf(edge.points).map((segment) => ({ edge: edge.id, segment })),
  );
  const reported = new Set<string>();
  const violations: Violation[] = [];
  for (const [a, b] of pairsOf(stretches)) {
    const sideBySide =
      sharedRun(a.segment, b.segment) > TOLERANCE &&
      distanceBetweenParallels(a.segment, b.segment) < spacing.edgeGap - TOLERANCE;
    const key = JSON.stringify([a.edge, b.edge]);
    if (sideBySide && !reported.has(key)) {
      reported.add(key);
      violations.push({ kind: "edges-overlap", edges: [a.edge, b.edge] });
    }
  }
  return violations;
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

/**
 * Lists every way `layout` is broken; an empty list means it is sound.
 * Edges that cross at a right angle are not a violation.
 * @throws Error when the layout is not a layout: two nodes share an id, or an edge connects a node that is not there.
 */
export function verify(layout: Layout, spacing: Spacing): Violation[] {
  const index = indexOf(layout.nodes);
  const canvas = { x: 0, y: 0, width: layout.width, height: layout.height };
  return [
    ...siblingViolations(layout.nodes, undefined, spacing),
    ...canvasViolations(layout, canvas),
    ...layout.edges.flatMap((edge) => [
      ...shapeViolations(edge, index, spacing),
      ...routeViolations(edge, index, spacing),
    ]),
    ...overlapViolations(layout.edges, spacing),
    ...labelViolations(layout.edges, index),
  ];
}
