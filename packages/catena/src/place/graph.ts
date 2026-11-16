/** Which way a diagram or a group flows: each edge leads to a node further down, or further right. */
export type Direction = "down" | "right";

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A place in a grid, counted from 0 at the top and at the left. */
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

export type GraphNode = Leaf | Group;

/** A connection between two nodes, at any depth. */
export interface GraphEdge {
  readonly from: string;
  readonly to: string;
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
