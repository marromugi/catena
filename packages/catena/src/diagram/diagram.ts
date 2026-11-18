import { drawEdge, drawEdgeEnd, EDGE_END_RADIUS } from "../edge";
import type { Layout, PlacedEdge, PlacedNode, Point, Rect } from "../layout";
import type { Node } from "../node";
import { element, writeSvg, type SvgElement } from "../svg";
import { drawHeader, HEADER_HEIGHT, type DiagramHeader } from "./header";

export interface DotGrid {
  readonly canvas: string;
  readonly dot: string;
  readonly dotRadius: number;
  /** Between the centres of two neighbouring dots, across and down alike. */
  readonly spacing: number;
}

export interface EdgePaint {
  readonly stroke: string;
  readonly strokeWidth: number;
}

/** What is left out is taken from the defaults; with no header, none is drawn. */
export interface DiagramOptions {
  readonly background?: Partial<DotGrid>;
  readonly edgePaint?: Partial<EdgePaint>;
  readonly header?: DiagramHeader;
}

export const DEFAULT_DOT_GRID: DotGrid = {
  canvas: "#f5f5f5",
  dot: "#c4c4c4",
  dotRadius: 1,
  spacing: 16,
};

export const DEFAULT_EDGE_PAINT: EdgePaint = { stroke: "#ebebeb", strokeWidth: 1.5 };

/** The id of the dot grid's `<pattern>`. A node's ids end in a count, so none is this one. */
const DOT_PATTERN_ID = "catena-dots";

/**
 * A placed node with no `Node` is not drawn, though its children are. An end of an edge gets a dot in the
 * edges' stroke colour where its node's card has the end on one of its sides and its round outline comes
 * within half the dot's radius of it, drawn before the nodes so the card covers part of it; any other end, such as one on a group with no `Node`, gets none. Every
 * document names its dot pattern `catena-dots`, so documents inlined in one HTML page show the first
 * one's dot grid. Given a
 * header, the document is 72 higher, the header is drawn over the background at its top, and the edges
 * and nodes 72 lower, below it.
 * @throws RangeError when the dot radius or the edges' stroke width is below 0, the spacing is not above
 * 0, or any of them is not finite.
 */
export function drawDiagram(
  layout: Layout,
  nodes: ReadonlyMap<string, Node>,
  options: DiagramOptions = {},
): string {
  const grid = withDefaults(DEFAULT_DOT_GRID, options.background);
  const paint = withDefaults(DEFAULT_EDGE_PAINT, options.edgePaint);
  if (!(paint.strokeWidth >= 0 && Number.isFinite(paint.strokeWidth))) {
    throw new RangeError(
      `An edge's stroke width must be a finite number 0 or more, not ${paint.strokeWidth}.`,
    );
  }
  const { width } = layout;
  const edges = element(
    "g",
    { fill: "none", stroke: paint.stroke, "stroke-width": paint.strokeWidth },
    layout.edges.map((edge) => drawEdge(edge)),
  );
  const placed = placedNodes(layout.nodes);
  const boxes = new Map(placed.map(({ id, box }) => [id, box]));
  const ends = element(
    "g",
    { fill: paint.stroke },
    layout.edges
      .flatMap(edgeEnds)
      .filter(({ id, point }) => coveredBy(nodes.get(id), boxes.get(id), point))
      .map(({ point }) => drawEdgeEnd(point)),
  );
  const drawn = [
    writeSvg(edges),
    writeSvg(ends),
    ...placed.flatMap(({ id, box }) => {
      const node = nodes.get(id);
      return node === undefined ? [] : [node.draw(box)];
    }),
  ];
  const { header } = options;
  const height = layout.height + (header === undefined ? 0 : HEADER_HEIGHT);
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  return [
    open,
    ...dotGrid(width, height, grid).map(writeSvg),
    ...(header === undefined
      ? drawn
      : [
          ...drawHeader(width, header).map(writeSvg),
          `<g transform="translate(0 ${HEADER_HEIGHT})">`,
          ...drawn,
          "</g>",
        ]),
    "</svg>",
  ].join("");
}

function dotGrid(width: number, height: number, grid: DotGrid): SvgElement[] {
  const { canvas, dot, dotRadius, spacing } = grid;
  if (!(dotRadius >= 0 && Number.isFinite(dotRadius))) {
    throw new RangeError(`A dot's radius must be a finite number 0 or more, not ${dotRadius}.`);
  }
  if (!(spacing > 0 && Number.isFinite(spacing))) {
    throw new RangeError(`The dots' spacing must be a finite number more than 0, not ${spacing}.`);
  }
  const pattern = element(
    "pattern",
    { id: DOT_PATTERN_ID, width: spacing, height: spacing, patternUnits: "userSpaceOnUse" },
    [element("circle", { cx: spacing / 2, cy: spacing / 2, r: dotRadius, fill: dot })],
  );
  return [
    element("defs", {}, [pattern]),
    element("rect", { width, height, fill: canvas }),
    element("rect", { width, height, fill: `url(#${DOT_PATTERN_ID})` }),
  ];
}

/** The two ends of `edge`, each with the id of the node it meets. */
function edgeEnds(edge: PlacedEdge): { id: string; point: Point }[] {
  const [start] = edge.points;
  return [
    { id: edge.from, point: start },
    { id: edge.to, point: edge.points.at(-1) ?? start },
  ];
}

function coveredBy(node: Node | undefined, box: Rect | undefined, point: Point): boolean {
  return node !== undefined && box !== undefined && node.covers(box, point, EDGE_END_RADIUS / 2);
}

function placedNodes(placed: readonly PlacedNode[]): PlacedNode[] {
  return placed.flatMap((node) => [node, ...placedNodes(node.children)]);
}

/** `given` over `defaults`, a field given as `undefined` keeping its default. */
function withDefaults<T extends object>(defaults: T, given: Partial<T> = {}): T {
  const kept = Object.entries(given).filter(([, value]) => value !== undefined);
  return { ...defaults, ...Object.fromEntries(kept) };
}
