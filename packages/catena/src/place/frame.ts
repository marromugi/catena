import type { Spacing } from "../layout";
import { outside, type BorderCrossing, type End, type Lanes, type Run } from "./lanes";
import type { Spot } from "./spot";

/** A point of a grid before the grid is turned to its direction. */
export interface FlowPoint {
  readonly across: number;
  readonly along: number;
}

/**
 * A node as its grid sees it: its spot, the room it takes across the flow and along it, the point of it
 * that sits on the middle lines of its row and column, and the box whose sides edges meet, both measured
 * from its corner nearest the start of the rows and the columns.
 */
export interface Item extends Spot, FlowPoint {
  readonly middle: FlowPoint;
  readonly edgeBox: { readonly start: FlowPoint; readonly end: FlowPoint };
}

/** Where everything in a grid lies, before the grid is turned to its direction. */
export interface Frame {
  /** The far corner of the grid, corridors included. */
  readonly size: FlowPoint;
  /** Where the edges from the outside come in: on the side they cross, where the grid lines up with its neighbours. */
  readonly entry: FlowPoint;
  /** Where the edges to the outside go out: on the side they cross, where the grid lines up with its neighbours. */
  readonly exit: FlowPoint;
  /** The point of the grid that lines up with its neighbours, on the line the edges from the outside cross its side on. */
  readonly middle: FlowPoint;
  /** The corner of a node nearest the start of both the rows and the columns. */
  cornerOf(id: string): FlowPoint;
  /** Where the edges of a node leave it: on its column's middle line, at the side of its edge box that faces along the flow. */
  exitOf(id: string): FlowPoint;
  /** Where the edges of a node enter it: on its column's middle line, at the side of its edge box that faces back along the flow. */
  entryOf(id: string): FlowPoint;
  /** How far along the flow the lane lies that the edges leaving a node, or coming in from the outside, share. */
  laneAfter(end: End): number;
  /** How far along the flow the lane lies that the edges running to a node along a lane, or going out to the outside, share. */
  laneBefore(end: End): number;
  /** How far across the flow the lane lies that the edges of a node, or of the outside, run along in a corridor between columns. */
  laneBeside(corridor: number, end: End): number;
}

/** How far a row or a column reaches before its middle line and after it. */
interface Reach {
  readonly before: number;
  readonly after: number;
}

/** One row or one column of a grid, with its middle line `before` in from its start. */
interface Track extends Reach {
  readonly offset: number;
}

/** Rows or columns in a line, with the length of the whole line. */
interface Line {
  readonly tracks: readonly Track[];
  readonly corridors: readonly number[];
  readonly length: number;
}

/** Lanes side by side in a corridor, each the edge gap beyond its room and the room of the lane before it. */
interface Stack {
  readonly lanes: number;
  /** From the first lane to the last. */
  readonly height: number;
  /** The room of the first lane. */
  readonly before: number;
  /** The room of the last lane. */
  readonly after: number;
}

/** A stack of the lanes of `ends`, in order, with how far each lies from the first. */
function stackOf(
  ends: readonly End[],
  rooms: ReadonlyMap<End, number> | undefined,
  gap: number,
): Stack & { readonly offsets: ReadonlyMap<End, number> } {
  const offsets = new Map<End, number>();
  let roomsBetween = 0;
  let before = 0;
  let after = 0;
  ends.forEach((end, index) => {
    const room = rooms?.get(end) ?? 0;
    if (index === 0) {
      before = room;
    } else {
      roomsBetween += after + room;
    }
    offsets.set(end, index * gap + roomsBetween);
    after = room;
  });
  return {
    lanes: ends.length,
    height: Math.max(0, ends.length - 1) * gap + roomsBetween,
    before,
    after,
    offsets,
  };
}

/** A place the middle of a grid's side may be moved to, and whether it is on a line an edge turns onto. */
interface Stop {
  readonly place: number;
  readonly onLine: boolean;
}

/** Lines up rows or columns with a corridor before each and one after the last. */
function lineUp(reaches: readonly Reach[], corridors: readonly number[]): Line {
  const tracks: Track[] = [];
  let end = 0;
  reaches.forEach((reach, index) => {
    const offset = end + (corridors[index] ?? 0);
    tracks.push({ offset, ...reach });
    end = offset + reach.before + reach.after;
  });
  return { tracks, corridors, length: end + (corridors[reaches.length] ?? 0) };
}

/**
 * The place along a line that lines up with its neighbours: the middle line of its one row or column,
 * where that track reaches further before the line than after it or the other way; else the middle of
 * the line.
 */
function middleOfLine(line: Line): number {
  const [only, ...others] = line.tracks;
  return only === undefined || others.length > 0 || only.before === only.after
    ? line.length / 2
    : only.offset + only.before;
}

function trackOf(line: Line, index: number): Track {
  const track = line.tracks[index];
  if (track === undefined) {
    throw new Error(`No track was made for index ${index}, though a node sits in it.`);
  }
  return track;
}

/** How far the lane of `end` lies from the first lane of its stack in `corridor`. */
function laneOf(offsets: ReadonlyMap<End, number> | undefined, corridor: number, end: End): number {
  const offset = offsets?.get(end);
  if (offset === undefined) {
    throw new Error(
      `${end === outside ? "The outside" : `Node "${end}"`} has no lane in corridor ${corridor}, though an edge runs in it.`,
    );
  }
  return offset;
}

/** Where the first lane of `stack` lies, the stack and its rooms in the middle of the corridor before the track `index`. */
function firstLane(line: Line, index: number, stack: Stack | undefined): number {
  const end = line.tracks[index]?.offset ?? line.length;
  const { height = 0, before = 0, after = 0 } = stack ?? {};
  return end - ((line.corridors[index] ?? 0) + height + after - before) / 2;
}

/**
 * The place nearest `from` that is on each of `lines` or at least its `apart` from it. Of two as near, a
 * place on a line comes first, then the smaller.
 */
function clearOf(
  lines: readonly { readonly line: number; readonly apart: number }[],
  from: number,
): number {
  const isClear = (place: number, measuredFrom?: number): boolean =>
    lines.every(({ line, apart }) => line === measuredFrom || Math.abs(place - line) >= apart);
  const comesFirst = (one: Stop, other: Stop): boolean => {
    const nearer = Math.abs(one.place - from) - Math.abs(other.place - from);
    if (nearer !== 0) {
      return nearer < 0;
    }
    return one.onLine === other.onLine ? one.place < other.place : one.onLine;
  };
  return [
    ...[{ place: from, onLine: false }].filter(({ place }) => isClear(place)),
    ...lines.flatMap(({ line, apart }) =>
      [
        { place: line, onLine: true },
        { place: line - apart, onLine: false },
        { place: line + apart, onLine: false },
      ].filter(({ place }) => isClear(place, line)),
    ),
  ].reduce((first, stop) => (comesFirst(stop, first) ? stop : first)).place;
}

/**
 * Measures a grid: rows and columns with the middle of each node on their middle line, reaching as far
 * before and after it as the nodes in them do, and corridors as wide as the
 * spacing asks, as the lanes in them need, and, in a grid with edges, wide enough to keep the middle line
 * of each row and column clear of the next. A corridor before a row that an edge enters is at least the
 * shortest stretch long, and at least the edge gap where that edge runs between two nodes of the grid
 * and starts inside its source or ends inside its target. Lanes lie in the middle of their corridor.
 *
 * A grid lines up with its neighbours, on each side, by the middle line of its one row or column where
 * that track reaches further before the line than after it or the other way, and else by its middle.
 *
 * An edge that crosses the border turns off the line through that middle on the side it crosses: where
 * that line runs along the flow, onto the middle line of a column or a lane beside one; where it runs
 * across the flow, onto the lane before its target or the lane after its source. The grid is made
 * longer at one end of that side by the least that puts that middle on each such line, or the edge gap
 * and the shortest stretch from it, and the room of that line and of the edges that cross, beyond that.
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

  const rowReaches: Reach[] = [];
  const columnReaches: Reach[] = [];
  const reachOver = (reach: Reach | undefined, middle: number, size: number): Reach => ({
    before: Math.max(reach?.before ?? 0, middle),
    after: Math.max(reach?.after ?? 0, size - middle),
  });
  for (const item of items.values()) {
    rowReaches[item.step] = reachOver(rowReaches[item.step], item.middle.along, item.along);
    columnReaches[item.place] = reachOver(
      columnReaches[item.place],
      item.middle.across,
      item.across,
    );
  }

  const edgeRoom = Math.max(spacing.edgeToNode, spacing.edgeGap, spacing.minSegment);
  const rowStacks = [...rowReaches, undefined].map((_, corridor) => {
    const leaving = stackOf(lanes.leaving[corridor] ?? [], lanes.rooms.leaving, spacing.edgeGap);
    const entering = stackOf(lanes.entering[corridor] ?? [], lanes.rooms.entering, spacing.edgeGap);
    const between =
      leaving.lanes > 0 && entering.lanes > 0
        ? Math.max(spacing.edgeGap, spacing.minSegment) + leaving.after + entering.before
        : 0;
    return {
      lanes: leaving.lanes + entering.lanes,
      height: leaving.height + between + entering.height,
      before: leaving.lanes > 0 ? leaving.before : entering.before,
      after: entering.lanes > 0 ? entering.after : leaving.after,
      leaving: leaving.offsets,
      entering: entering.offsets,
      enteringFrom: leaving.height + between,
    };
  });
  const columnStacks = [...columnReaches, undefined].map((_, corridor) =>
    stackOf(lanes.beside[corridor] ?? [], lanes.rooms.beside[corridor], spacing.edgeGap),
  );
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
    reaches: readonly Reach[],
    stacks: readonly Stack[],
    crossing: (corridor: number) => number,
  ): number[] =>
    stacks.map((stack, corridor) => {
      const nearestLine = Math.min(
        reaches[corridor - 1]?.after ?? Number.POSITIVE_INFINITY,
        reaches[corridor]?.before ?? Number.POSITIVE_INFINITY,
      );
      return Math.max(
        corridor === 0 || corridor === reaches.length ? spacing.padding : spacing.nodeGap,
        edges.length > 0 ? edgeRoom - nearestLine : 0,
        stack.lanes > 0 ? edgeRoom * 2 + stack.height + stack.before + stack.after : 0,
        crossing(corridor),
      );
    });
  const rows = lineUp(
    rowReaches,
    corridorsOf(rowReaches, rowStacks, (corridor) =>
      Math.max(
        entered.has(corridor) ? spacing.minSegment : 0,
        enteredFromInside.has(corridor) ? spacing.edgeGap : 0,
      ),
    ),
  );
  const columns = lineUp(
    columnReaches,
    corridorsOf(columnReaches, columnStacks, () => 0),
  );

  const middleOf = (place: number): number => {
    const column = trackOf(columns, place);
    return column.offset + column.before;
  };
  const laneBeside = (corridor: number, end: End): number =>
    firstLane(columns, corridor, columnStacks[corridor]) +
    laneOf(columnStacks[corridor]?.offsets, corridor, end);

  const laneAfter = (end: End): number => {
    const corridor = end === outside ? 0 : itemOf(end).step + 1;
    return (
      firstLane(rows, corridor, rowStacks[corridor]) +
      laneOf(rowStacks[corridor]?.leaving, corridor, end)
    );
  };
  const laneBefore = (end: End): number => {
    const corridor = end === outside ? rowReaches.length : itemOf(end).step;
    return (
      firstLane(rows, corridor, rowStacks[corridor]) +
      (rowStacks[corridor]?.enteringFrom ?? 0) +
      laneOf(rowStacks[corridor]?.entering, corridor, end)
    );
  };

  const crossingEdges = edges.filter((edge) => edge.from === outside || edge.to === outside);
  const crossingRoom = Math.max(0, ...crossingEdges.map((edge) => edge.room));
  /** A line a crossing edge turns onto, kept apart from the crossing by the gap and by its room and the crossing's. */
  const turn = (line: number, room: number | undefined) => ({
    line,
    apart: Math.max(spacing.edgeGap, spacing.minSegment) + (room ?? 0) + crossingRoom,
  });
  const turns = crossingEdges.map((edge) => {
    const node = edge.from === outside ? edge.to : edge.from;
    if (border === "across") {
      return edge.from === outside
        ? turn(laneBefore(node), lanes.rooms.entering.get(node))
        : turn(laneAfter(node), lanes.rooms.leaving.get(node));
    }
    const route = lanes.routes.get(edge.id);
    return route?.kind === "around"
      ? turn(laneBeside(route.beside, edge.from), lanes.rooms.beside[route.beside]?.get(edge.from))
      : turn(middleOf(itemOf(node).place), edge.room);
  });
  const [side, depth] = border === "along" ? [columns, rows] : [rows, columns];
  const lined = middleOfLine(side);
  const crossing = clearOf(turns, lined);
  const moved = Math.max(0, 2 * (lined - crossing));
  /** The point `onSide` along the side the edges come in at, and `inFrom` in from that side. */
  const pointOf = (onSide: number, inFrom: number): FlowPoint =>
    border === "along" ? { across: onSide, along: inFrom } : { across: inFrom, along: onSide };
  const shift = pointOf(moved, 0);
  const size = pointOf(
    Math.max(side.length, 2 * crossing + (side.length - 2 * lined)) + moved,
    depth.length,
  );

  const cornerOf = (id: string): FlowPoint => {
    const item = itemOf(id);
    const row = trackOf(rows, item.step);
    const column = trackOf(columns, item.place);
    return {
      across: shift.across + column.offset + column.before - item.middle.across,
      along: shift.along + row.offset + row.before - item.middle.along,
    };
  };
  const entryOf = (id: string): FlowPoint => ({
    across: shift.across + middleOf(itemOf(id).place),
    along: cornerOf(id).along + itemOf(id).edgeBox.start.along,
  });

  return {
    size,
    entry: pointOf(moved + crossing, 0),
    exit: pointOf(moved + crossing, depth.length),
    middle: pointOf(moved + crossing, middleOfLine(depth)),
    cornerOf,
    entryOf,
    exitOf: (id) => {
      const entry = entryOf(id);
      return { ...entry, along: cornerOf(id).along + itemOf(id).edgeBox.end.along };
    },
    laneAfter: (end) => shift.along + laneAfter(end),
    laneBefore: (end) => shift.along + laneBefore(end),
    laneBeside: (corridor, end) => shift.across + laneBeside(corridor, end),
  };
}
