import type { Spacing } from "../layout";
import { outside, type BorderCrossing, type End, type Lanes, type Run } from "./lanes";
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
  /** Where the edges from the outside come in: the middle of the side they cross. */
  readonly entry: FlowPoint;
  /** Where the edges to the outside go out: the middle of the side they cross. */
  readonly exit: FlowPoint;
  /** The corner of a node nearest the start of both the rows and the columns. */
  cornerOf(id: string): FlowPoint;
  /** Where the edges of a node leave it: the middle of its side that faces along the flow. */
  exitOf(id: string): FlowPoint;
  /** Where the edges of a node enter it: the middle of its side that faces back along the flow. */
  entryOf(id: string): FlowPoint;
  /** How far along the flow the lane lies that the edges leaving a node, or coming in from the outside, share. */
  laneAfter(end: End): number;
  /** How far along the flow the lane lies that the edges running to a node along a lane, or going out to the outside, share. */
  laneBefore(end: End): number;
  /** How far across the flow the lane lies that the edges of a node, or of the outside, run along in a corridor between columns. */
  laneBeside(corridor: number, end: End): number;
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

interface Stack {
  readonly lanes: number;
  readonly height: number;
}

/** A place the middle of a grid's side may be moved to, and whether it is on a line an edge turns onto. */
interface Stop {
  readonly place: number;
  readonly onLine: boolean;
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
 * The place nearest `from` that is on each of `lines` or at least `apart` from it. Of two as near, a
 * place on a line comes first, then the smaller.
 */
function clearOf(lines: readonly number[], from: number, apart: number): number {
  const isClear = (place: number, measuredFrom?: number): boolean =>
    lines.every((line) => line === measuredFrom || Math.abs(place - line) >= apart);
  const comesFirst = (one: Stop, other: Stop): boolean => {
    const nearer = Math.abs(one.place - from) - Math.abs(other.place - from);
    if (nearer !== 0) {
      return nearer < 0;
    }
    return one.onLine === other.onLine ? one.place < other.place : one.onLine;
  };
  return [
    ...[{ place: from, onLine: false }].filter(({ place }) => isClear(place)),
    ...lines.flatMap((line) =>
      [
        { place: line, onLine: true },
        { place: line - apart, onLine: false },
        { place: line + apart, onLine: false },
      ].filter(({ place }) => isClear(place, line)),
    ),
  ].reduce((first, stop) => (comesFirst(stop, first) ? stop : first)).place;
}

/**
 * Measures a grid: rows and columns as large as the largest node in them, and corridors as wide as the
 * spacing asks, as the lanes in them need, and, in a grid with edges, wide enough to keep the middle of
 * each row and column clear of the next. A corridor before a row that an edge enters is at least the
 * shortest stretch long, and at least the edge gap where that edge starts inside its source or ends
 * inside its target. Lanes lie in the middle of their corridor.
 *
 * An edge that crosses the border turns off the line through the middle of the side it crosses: where
 * that line runs along the flow, onto the middle line of a column or a lane beside one; where it runs
 * across the flow, onto the lane before its target or the lane after its source. The grid is made
 * longer at one end of that side by the least that puts the middle of the side on each such line, or
 * the edge gap and the shortest stretch from it.
 *
 * @param items The nodes of the grid by id, with no row or column left empty.
 * @param edges The edges `lanes` was made for.
 * @param border The crossing `lanes` was made for.
 */
export function frameOf(
  items: ReadonlyMap<string, Item>,
  edges: readonly Run[],
  lanes: Lanes,
  spacing: Spacing,
  border: BorderCrossing,
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
  const entered = new Set(
    edges.flatMap((edge) => (edge.to === outside ? [] : [itemOf(edge.to).step])),
  );
  const enteredFromInside = new Set(
    edges.flatMap((edge) =>
      edge.from !== outside && edge.to !== outside && (edge.startsInside || edge.endsInside)
        ? [itemOf(edge.to).step]
        : [],
    ),
  );

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
      Math.max(
        entered.has(corridor) ? spacing.minSegment : 0,
        enteredFromInside.has(corridor) ? spacing.edgeGap : 0,
      ),
    ),
  );
  const columns = lineUp(
    columnSizes,
    corridorsOf(columnSizes, columnStacks, () => 0),
  );

  const laneOf = (list: readonly (readonly End[])[], corridor: number, end: End): number => {
    const lane = list[corridor]?.indexOf(end) ?? -1;
    if (lane === -1) {
      throw new Error(
        `${end === outside ? "The outside" : `Node "${end}"`} has no lane in corridor ${corridor}, though an edge runs in it.`,
      );
    }
    return lane * spacing.edgeGap;
  };
  const middleOf = (place: number): number => {
    const column = trackOf(columns, place);
    return column.offset + column.size / 2;
  };
  const laneBeside = (corridor: number, end: End): number =>
    firstLane(columns, corridor, columnStacks[corridor]?.height ?? 0) +
    laneOf(lanes.beside, corridor, end);

  const laneAfter = (end: End): number => {
    const corridor = end === outside ? 0 : itemOf(end).step + 1;
    return (
      firstLane(rows, corridor, rowStacks[corridor]?.height ?? 0) +
      laneOf(lanes.leaving, corridor, end)
    );
  };
  const laneBefore = (end: End): number => {
    const corridor = end === outside ? rowSizes.length : itemOf(end).step;
    return (
      firstLane(rows, corridor, rowStacks[corridor]?.height ?? 0) +
      (rowStacks[corridor]?.entering ?? 0) +
      laneOf(lanes.entering, corridor, end)
    );
  };

  const turns = edges.flatMap((edge): number[] => {
    if (edge.from !== outside && edge.to !== outside) {
      return [];
    }
    const node = edge.from === outside ? edge.to : edge.from;
    if (border === "across") {
      return [edge.from === outside ? laneBefore(node) : laneAfter(node)];
    }
    const route = lanes.routes.get(edge.id);
    return [
      route?.kind === "around" ? laneBeside(route.beside, edge.from) : middleOf(itemOf(node).place),
    ];
  });
  const [side, depth] = border === "along" ? [columns, rows] : [rows, columns];
  const crossing = clearOf(turns, side.length / 2, Math.max(spacing.edgeGap, spacing.minSegment));
  const moved = Math.max(0, side.length - crossing * 2);
  /** The point `onSide` along the side the edges come in at, and `inFrom` in from that side. */
  const pointOf = (onSide: number, inFrom: number): FlowPoint =>
    border === "along" ? { across: onSide, along: inFrom } : { across: inFrom, along: onSide };
  const shift = pointOf(moved, 0);
  const size = pointOf(Math.max(side.length, crossing * 2) + moved, depth.length);

  const cornerOf = (id: string): FlowPoint => {
    const item = itemOf(id);
    const row = trackOf(rows, item.step);
    const column = trackOf(columns, item.place);
    return {
      across: shift.across + column.offset + (column.size - item.across) / 2,
      along: shift.along + row.offset + (row.size - item.along) / 2,
    };
  };
  const entryOf = (id: string): FlowPoint => ({
    across: shift.across + middleOf(itemOf(id).place),
    along: cornerOf(id).along,
  });

  return {
    size,
    entry: pointOf(moved + crossing, 0),
    exit: pointOf(moved + crossing, depth.length),
    cornerOf,
    entryOf,
    exitOf: (id) => {
      const entry = entryOf(id);
      return { ...entry, along: entry.along + itemOf(id).along };
    },
    laneAfter: (end) => shift.along + laneAfter(end),
    laneBefore: (end) => shift.along + laneBefore(end),
    laneBeside: (corridor, end) => shift.across + laneBeside(corridor, end),
  };
}
