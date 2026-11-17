import { drawEdge } from "../edge";
import type { Layout, PlacedNode } from "../layout";
import { element, writeSvg, type Node, type SvgElement } from "../node";

/** A canvas of one colour under a grid of round dots. */
export interface DotGrid {
  readonly canvas: string;
  readonly dot: string;
  readonly dotRadius: number;
  /** Between the centres of two neighbouring dots, across and down alike. */
  readonly spacing: number;
}

/** How every edge's line is painted. */
export interface EdgePaint {
  readonly stroke: string;
  readonly strokeWidth: number;
}

/** How a diagram is drawn. What is left out is taken from the defaults. */
export interface DiagramOptions {
  readonly background?: Partial<DotGrid>;
  readonly edgePaint?: Partial<EdgePaint>;
}

/** The background a diagram gets when none is given. */
export const DEFAULT_DOT_GRID: DotGrid = {
  canvas: "#f5f5f5",
  dot: "#c4c4c4",
  dotRadius: 1,
  spacing: 16,
};

/** The paint of an edge when none is given. */
export const DEFAULT_EDGE_PAINT: EdgePaint = { stroke: "#8c8c8c", strokeWidth: 1.5 };

/** The id of the dot grid's `<pattern>`. A node's ids end in a count, so none is this one. */
const DOT_PATTERN_ID = "catena-dots";

/**
 * The layout as one SVG document of its size: the background over the whole canvas, then every edge,
 * then every placed node, group or child, whose id is in `nodes`, drawn at its box. A placed node with
 * no `Node` is not drawn, though its children are. Every document names its dot pattern `catena-dots`, so
 * documents inlined in one HTML page show the first one's dot grid.
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
  const { width, height } = layout;
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  const edges = element(
    "g",
    { fill: "none", stroke: paint.stroke, "stroke-width": paint.strokeWidth },
    layout.edges.map((edge) => drawEdge(edge)),
  );
  const drawn = placedNodes(layout.nodes).flatMap((placed) => {
    const node = nodes.get(placed.id);
    return node === undefined ? [] : [node.draw(placed.box)];
  });
  return [
    open,
    ...dotGrid(width, height, grid).map(writeSvg),
    writeSvg(edges),
    ...drawn,
    "</svg>",
  ].join("");
}

/** The canvas filled with `grid`: its colour, then its dots. */
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

/** Every placed node, each group before its children. */
function placedNodes(placed: readonly PlacedNode[]): PlacedNode[] {
  return placed.flatMap((node) => [node, ...placedNodes(node.children)]);
}

/** `given` over `defaults`, a field given as `undefined` keeping its default. */
function withDefaults<T extends object>(defaults: T, given: Partial<T> = {}): T {
  const kept = Object.entries(given).filter(([, value]) => value !== undefined);
  return { ...defaults, ...Object.fromEntries(kept) };
}
