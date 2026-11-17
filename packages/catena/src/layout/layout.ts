/** A point of the canvas, measured from its top-left corner. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A box with its top-left corner at (`x`, `y`). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A node where it was placed. A group is a node with children, which lie inside its box. */
export interface PlacedNode {
  readonly id: string;
  readonly box: Rect;
  readonly children: readonly PlacedNode[];
}

/** Something drawn on an edge, such as a caption or a button. */
export interface PlacedLabel {
  readonly box: Rect;
}

/** An edge as the line it follows, from a point on the border of `from` to one on the border of `to`. */
export interface PlacedEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly points: readonly [Point, Point, ...Point[]];
  readonly labels: readonly PlacedLabel[];
}

/** Where everything in a diagram goes. Every coordinate is measured from the canvas's top-left corner. */
export interface Layout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
}

/** The distances a layout keeps. */
export interface Spacing {
  /** Between two nodes, unless one contains the other. */
  readonly nodeGap: number;
  /** Between a group's border and the nodes inside it. */
  readonly padding: number;
  /** Between an edge and a node, a corner of a node it meets, or the border of a group around one of its ends. A node inside a group the edge connects is left out. */
  readonly edgeToNode: number;
  /** Between any two stretches of edge, except where they cross at a right angle clear of their ends, meet at a bend without turning straight back, or are shared by edges that meet a node's border at one point. */
  readonly edgeGap: number;
  /** The shortest stretch of an edge between two bends, or between a bend and an end. */
  readonly minSegment: number;
}
