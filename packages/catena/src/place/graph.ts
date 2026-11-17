/** Which way a diagram or a group flows: a node goes further down, or further right, than the nodes listed before it that lead to it, unless it names its cell. */
export type Direction = "down" | "right";

/** How wide and how high a node is. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A row and a column of a grid, each counted from 0, at the top and at the left. */
export interface Cell {
  readonly row: number;
  readonly column: number;
}

/** A node of a known size. */
export interface Leaf {
  readonly id: string;
  readonly size: Size;
  /** Where the node goes in its grid. Left out, the edges decide. */
  readonly cell?: Cell;
}

/** A node drawn around other nodes, which it lays out in a grid of its own. */
export interface Group {
  readonly id: string;
  readonly direction: Direction;
  readonly children: readonly [GraphNode, ...GraphNode[]];
  /** Where the group goes in its grid. Left out, the edges decide. */
  readonly cell?: Cell;
}

/** A node of a graph: a leaf, or a group of nodes. */
export type GraphNode = Leaf | Group;

/** The two nodes an edge connects, at any depth. */
export interface EdgeEnds {
  readonly from: string;
  readonly to: string;
}

/** A connection between two nodes. */
export interface GraphEdge extends EdgeEnds {
  readonly id: string;
}

/** What a layout is made from. */
export interface Graph {
  readonly direction: Direction;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/** A graph that cannot be laid out as written. */
export class InvalidGraphError extends Error {
  override readonly name = "InvalidGraphError";
}
