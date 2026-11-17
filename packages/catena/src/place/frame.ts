import type { Spacing } from "../layout";
import type { GraphEdge } from "./graph";
import type { Lanes } from "./lanes";
import type { Spot } from "./spot";

/** A node as its grid sees it: its spot, and the room it takes across the flow and along it. */
export interface Item extends Spot {
  readonly across: number;
  readonly along: number;
}

/** A point of a grid before the grid is turned to its direction. */
export interface FlowPoint {
  readonly across: number;
  readonly along: number;
}

/** Where everything in a grid lies, before the grid is turned to its direction. */
export interface Frame {
  /** The far corner of the grid, corridors included. */
  readonly size: FlowPoint;
  /** The corner of a node nearest the start of both the rows and the columns. */
  cornerOf(id: string): FlowPoint;
  /** Where the edges of a node leave it: the middle of its side that faces along the flow. */
  exitOf(id: string): FlowPoint;
  /** Where the edges of a node enter it: the middle of its side that faces back along the flow. */
  entryOf(id: string): FlowPoint;
  /** How far along the flow the lane lies that the edges leaving a node share. */
  laneAfter(id: string): number;
  /** How far along the flow the lane lies that the edges coming around to a node share. */
  laneBefore(id: string): number;
  /** How far across the flow the lane lies that a node's edges run along in a corridor between columns. */
  laneBeside(corridor: number, id: string): number;
}

/** One row or one column of a grid. */
interface Track {
  readonly offset: number;
  readonly size: number;
}

/** Rows or columns in a line, with the length of the whole line. */
interface Line {
  readonly tracks: readonly Track[];
  readonly corridors: readonly number[];
  readonly length: number;
}

/** The room the lanes of one corridor take, and how many there are. */
interface Stack {
  readonly lanes: number;
  readonly height: number;
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
  return { tracks, corridors, length: end + (corridors[sizes.length] ?? 0) };
}

function trackOf(line: Line, index: number): Track {
  const track = line.tracks[index];
  if (track === undefined) {
    throw new Error(`No track was made for index ${index}, though a node sits in it.`);
  }
  return track;
}

/** Where the first of the lanes that take up `stack` lies, in the middle of the corridor before the track `index`. */
function firstLane(line: Line, index: number, stack: number): number {
  const end = line.tracks[index]?.offset ?? line.length;
  return end - ((line.corridors[index] ?? 0) + stack) / 2;
}

/**
 * Measures a grid: rows and columns as large as the largest node in them, and corridors as wide as the
 * spacing asks, as the lanes in them need, and, in a grid with edges, wide enough to keep the middle of
 * each row and column clear of the next. A corridor before a row that an edge enters is at least the
 * shortest stretch long. Lanes lie in the middle of their corridor.
 *
 * @param items The nodes of the grid by id, with no row or column left empty.
 * @param edges The edges `lanes` was made for.
 */
export function frameOf(
  items: ReadonlyMap<string, Item>,
  edges: readonly GraphEdge[],
  lanes: Lanes,
  spacing: Spacing,
): Frame {
  const itemOf = (id: string): Item => {
    const item = items.get(id);
    if (item === undefined) {
      throw new Error(`Node "${id}" is not in the grid, though the grid is measured for it.`);
    }
    return item;
  };

  const rowSizes: number[] = [];
  const columnSizes: number[] = [];
  for (const item of items.values()) {
    rowSizes[item.step] = Math.max(rowSizes[item.step] ?? 0, item.along);
    columnSizes[item.place] = Math.max(columnSizes[item.place] ?? 0, item.across);
  }

  const edgeRoom = Math.max(spacing.edgeToNode, spacing.edgeGap, spacing.minSegment);
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
  const columnStacks = columnSizes.concat(0).map((_, corridor): Stack => {
    const count = lanes.beside[corridor]?.length ?? 0;
    return { lanes: count, height: stackOf(count) };
  });
  const entered = new Set(edges.map((edge) => itemOf(edge.to).step));

  const corridorsOf = (
    sizes: readonly number[],
    stacks: readonly Stack[],
    crossing: (corridor: number) => number,
  ): number[] =>
    stacks.map((stack, corridor) => {
      const narrowest = Math.min(
        sizes[corridor - 1] ?? Number.POSITIVE_INFINITY,
        sizes[corridor] ?? Number.POSITIVE_INFINITY,
      );
      return Math.max(
        corridor === 0 || corridor === sizes.length ? spacing.padding : spacing.nodeGap,
        edges.length > 0 ? edgeRoom - narrowest / 2 : 0,
        stack.lanes > 0 ? edgeRoom * 2 + stack.height : 0,
        crossing(corridor),
      );
    });
  const rows = lineUp(
    rowSizes,
    corridorsOf(rowSizes, rowStacks, (corridor) =>
      entered.has(corridor) ? spacing.minSegment : 0,
    ),
  );
  const columns = lineUp(
    columnSizes,
    corridorsOf(columnSizes, columnStacks, () => 0),
  );

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
  const entryOf = (id: string): FlowPoint => {
    const corner = cornerOf(id);
    return { across: corner.across + itemOf(id).across / 2, along: corner.along };
  };

  return {
    size: { across: columns.length, along: rows.length },
    cornerOf,
    entryOf,
    exitOf: (id) => {
      const entry = entryOf(id);
      return { ...entry, along: entry.along + itemOf(id).along };
    },
    laneAfter: (id) => {
      const corridor = itemOf(id).step + 1;
      return (
        firstLane(rows, corridor, rowStacks[corridor]?.height ?? 0) +
        laneOf(lanes.leaving, corridor, id)
      );
    },
    laneBefore: (id) => {
      const corridor = itemOf(id).step;
      return (
        firstLane(rows, corridor, rowStacks[corridor]?.height ?? 0) +
        (rowStacks[corridor]?.entering ?? 0) +
        laneOf(lanes.entering, corridor, id)
      );
    },
    laneBeside: (corridor, id) =>
      firstLane(columns, corridor, columnStacks[corridor]?.height ?? 0) +
      laneOf(lanes.beside, corridor, id),
  };
}
