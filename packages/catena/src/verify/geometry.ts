import type { Point, Rect } from "../layout";

/** Lengths closer than this count as equal, so that sums of measured widths compare as intended. */
export const TOLERANCE = 1e-6;

export interface Segment {
  readonly from: Point;
  readonly to: Point;
}

/** Where a stretch of a segment lies relative to a box. */
export type Side = "inside" | "border" | "outside";

export function segmentsOf(points: readonly Point[]): Segment[] {
  return points.slice(1).map((to, index) => ({ from: points[index] ?? to, to }));
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE;
}

function isHorizontal(segment: Segment): boolean {
  return near(segment.from.y, segment.to.y);
}

function isVertical(segment: Segment): boolean {
  return near(segment.from.x, segment.to.x);
}

export function isOrthogonal(segment: Segment): boolean {
  return isHorizontal(segment) || isVertical(segment);
}

export function lengthOf(segment: Segment): number {
  return Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
}

function lengthOfPath(points: readonly Point[]): number {
  return segmentsOf(points).reduce((length, segment) => length + lengthOf(segment), 0);
}

export function inflate(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + by * 2,
    height: rect.height + by * 2,
  };
}

/** How far apart two boxes are along the axis that separates them most. Negative when they overlap. */
export function separation(a: Rect, b: Rect): number {
  const horizontal = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
  const vertical = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.max(horizontal, vertical);
}

export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - TOLERANCE &&
    inner.y >= outer.y - TOLERANCE &&
    inner.x + inner.width <= outer.x + outer.width + TOLERANCE &&
    inner.y + inner.height <= outer.y + outer.height + TOLERANCE
  );
}

export function containsPoint(rect: Rect, point: Point): boolean {
  return contains(rect, { ...point, width: 0, height: 0 });
}

function isStrictlyBetween(value: number, low: number, high: number): boolean {
  return value > low + TOLERANCE && value < high - TOLERANCE;
}

function isOnBorder(rect: Rect, point: Point): boolean {
  return (
    containsPoint(rect, point) &&
    (near(point.x, rect.x) ||
      near(point.x, rect.x + rect.width) ||
      near(point.y, rect.y) ||
      near(point.y, rect.y + rect.height))
  );
}

/**
 * Whether a segment that starts at `segment.from` is joined to the box there:
 * on one of its sides, away from the corners, and at a right angle to that side.
 * A slanted segment only has to start on the border.
 */
export function isAttached(rect: Rect, segment: Segment): boolean {
  const { from } = segment;
  if (isHorizontal(segment)) {
    return (
      (near(from.x, rect.x) || near(from.x, rect.x + rect.width)) &&
      isStrictlyBetween(from.y, rect.y, rect.y + rect.height)
    );
  }
  if (isVertical(segment)) {
    return (
      (near(from.y, rect.y) || near(from.y, rect.y + rect.height)) &&
      isStrictlyBetween(from.x, rect.x, rect.x + rect.width)
    );
  }
  return isOnBorder(rect, from);
}

interface Span {
  readonly low: number;
  readonly high: number;
}

/**
 * The sides a horizontal or vertical segment passes, in the order it passes them.
 * A stretch shorter than the tolerance is left out, so touching a border at one point is not "border".
 */
export function sidesAlong(segment: Segment, rect: Rect): Side[] {
  const horizontal = isHorizontal(segment);
  const start = horizontal ? segment.from.x : segment.from.y;
  const end = horizontal ? segment.to.x : segment.to.y;
  const level = horizontal ? segment.from.y : segment.from.x;
  const along: Span = horizontal
    ? { low: rect.x, high: rect.x + rect.width }
    : { low: rect.y, high: rect.y + rect.height };
  const across: Span = horizontal
    ? { low: rect.y, high: rect.y + rect.height }
    : { low: rect.x, high: rect.x + rect.width };

  let within: Side = "outside";
  if (near(level, across.low) || near(level, across.high)) {
    within = "border";
  } else if (level > across.low && level < across.high) {
    within = "inside";
  }

  const low = Math.min(start, end);
  const high = Math.max(start, end);
  const cuts = [low, along.low, along.high, high]
    .filter((cut) => cut >= low && cut <= high)
    .toSorted((a, b) => a - b);
  const sides: Side[] = [];
  cuts.slice(1).forEach((cut, index) => {
    const previous = cuts[index] ?? cut;
    if (cut - previous <= TOLERANCE) {
      return;
    }
    const middle = (previous + cut) / 2;
    const side = middle > along.low && middle < along.high ? within : "outside";
    if (sides.at(-1) !== side) {
      sides.push(side);
    }
  });
  return start <= end ? sides : sides.toReversed();
}

function spanOf(segment: Segment, horizontal: boolean): Span {
  const from = horizontal ? segment.from.x : segment.from.y;
  const to = horizontal ? segment.to.x : segment.to.y;
  return { low: Math.min(from, to), high: Math.max(from, to) };
}

function sharedRun(a: Segment, b: Segment): number {
  const horizontal = isHorizontal(a) && isHorizontal(b);
  if (!horizontal && !(isVertical(a) && isVertical(b))) {
    return 0;
  }
  const first = spanOf(a, horizontal);
  const second = spanOf(b, horizontal);
  return Math.max(0, Math.min(first.high, second.high) - Math.max(first.low, second.low));
}

function distanceBetweenParallels(a: Segment, b: Segment): number {
  return isHorizontal(a) ? Math.abs(a.from.y - b.from.y) : Math.abs(a.from.x - b.from.x);
}

/**
 * Whether a segment runs beside one of the box's sides closer than `clearance`, without crossing or lying on the border.
 * A segment that crosses the border, or lies on it, is for the caller to judge by {@link sidesAlong}.
 */
export function runsAlongside(segment: Segment, rect: Rect, clearance: number): boolean {
  const [side, ...others] = sidesAlong(segment, rect);
  if (side === undefined || side === "border" || others.length > 0) {
    return false;
  }
  const horizontal = isHorizontal(segment);
  const level = horizontal ? segment.from.y : segment.from.x;
  const lines = horizontal ? [rect.y, rect.y + rect.height] : [rect.x, rect.x + rect.width];
  const reach: Span = horizontal
    ? { low: rect.x - clearance, high: rect.x + rect.width + clearance }
    : { low: rect.y - clearance, high: rect.y + rect.height + clearance };
  const run = spanOf(segment, horizontal);
  const beside = Math.min(run.high, reach.high) - Math.max(run.low, reach.low) > TOLERANCE;
  return (
    beside &&
    lines.some((line) => {
      const distance = Math.abs(level - line);
      return distance > TOLERANCE && distance < clearance - TOLERANCE;
    })
  );
}

function boundsOf(segment: Segment): Rect {
  const x = Math.min(segment.from.x, segment.to.x);
  const y = Math.min(segment.from.y, segment.to.y);
  return {
    x,
    y,
    width: Math.max(segment.from.x, segment.to.x) - x,
    height: Math.max(segment.from.y, segment.to.y) - y,
  };
}

/** Whether two segments cross at a right angle with each reaching at least `gap` past the other on both sides. */
function crossCleanly(a: Segment, b: Segment, gap: number): boolean {
  const [across, down] = isHorizontal(a) ? [a, b] : [b, a];
  if (!isHorizontal(across) || !isVertical(down)) {
    return false;
  }
  const wide = spanOf(across, true);
  const tall = spanOf(down, false);
  const x = down.from.x;
  const y = across.from.y;
  return (
    x >= wide.low + gap - TOLERANCE &&
    x <= wide.high - gap + TOLERANCE &&
    y >= tall.low + gap - TOLERANCE &&
    y <= tall.high - gap + TOLERANCE
  );
}

export function areTooClose(a: Segment, b: Segment, gap: number): boolean {
  if (doubleBack(a, b)) {
    return true;
  }
  return !crossCleanly(a, b, gap) && separation(boundsOf(a), boundsOf(b)) < gap - TOLERANCE;
}

/** Whether two parallel segments lie on the same line and share a stretch of it. */
export function doubleBack(a: Segment, b: Segment): boolean {
  return sharedRun(a, b) > TOLERANCE && distanceBetweenParallels(a, b) <= TOLERANCE;
}

function isSamePoint(a: Point, b: Point): boolean {
  return near(a.x, b.x) && near(a.y, b.y);
}

function pointAlong(segment: Segment, distance: number): Point {
  const share = distance / lengthOf(segment);
  return {
    x: segment.from.x + (segment.to.x - segment.from.x) * share,
    y: segment.from.y + (segment.to.y - segment.from.y) * share,
  };
}

export function sharedLead(a: readonly Point[], b: readonly Point[]): number {
  const [start] = a;
  if (start === undefined || b[0] === undefined || !isSamePoint(start, b[0])) {
    return 0;
  }
  let at: Point = start;
  let lead = 0;
  let nextOfA = 1;
  let nextOfB = 1;
  for (;;) {
    const toA = a[nextOfA];
    const toB = b[nextOfB];
    if (toA === undefined || toB === undefined) {
      return lead;
    }
    const restOfA = { from: at, to: toA };
    const restOfB = { from: at, to: toB };
    const reach = Math.min(lengthOf(restOfA), lengthOf(restOfB));
    if (reach > TOLERANCE) {
      if (!isSamePoint(pointAlong(restOfA, reach), pointAlong(restOfB, reach))) {
        return lead;
      }
      lead += reach;
    }
    const endsA = lengthOf(restOfA) <= reach + TOLERANCE;
    const endsB = lengthOf(restOfB) <= reach + TOLERANCE;
    at = endsA ? toA : toB;
    nextOfA += endsA ? 1 : 0;
    nextOfB += endsB ? 1 : 0;
  }
}

/**
 * The share of the way from `from` to `to` at which a value between `low` and `high` reaches one of them.
 * Stopping within the tolerance of one counts as reaching it; stopping shorter gives infinity.
 */
function shareToBound(from: number, to: number, { low, high }: Span): number {
  if (to === from) {
    return Number.POSITIVE_INFINITY;
  }
  const bound = to > from ? high : low;
  return Math.abs(bound - from) <= Math.abs(to - from) + TOLERANCE
    ? (bound - from) / (to - from)
    : Number.POSITIVE_INFINITY;
}

/** A path in two parts that meet at one of its points. */
export interface PathCut {
  readonly before: readonly Point[];
  readonly after: readonly Point[];
}

export function cutAtStart(points: readonly Point[]): PathCut {
  return { before: points.slice(0, 1), after: points };
}

/** A path that starts inside a box, cut where it first comes to the box's border. Nothing when it starts outside or never comes to it. */
export function cutAtBorder(points: readonly Point[], rect: Rect): PathCut | undefined {
  const [start] = points;
  if (start === undefined || !containsPoint(rect, start)) {
    return undefined;
  }
  for (const [at, segment] of segmentsOf(points).entries()) {
    const share = Math.min(
      shareToBound(segment.from.x, segment.to.x, { low: rect.x, high: rect.x + rect.width }),
      shareToBound(segment.from.y, segment.to.y, { low: rect.y, high: rect.y + rect.height }),
    );
    if (share < Number.POSITIVE_INFINITY) {
      const point = pointAlong(segment, share * lengthOf(segment));
      return {
        before: [...points.slice(0, at + 1), point],
        after: [point, ...points.slice(at + 1)],
      };
    }
  }
  return undefined;
}

/**
 * Where a stretch of a path lies: its end is `lead` from the path's start, and its start `tail` from the path's end.
 * A stretch said to start at the path's start, whatever the path's length, has an infinite `tail`; one said to end at its end, an infinite `lead`.
 */
export interface Stretch {
  readonly lead: number;
  readonly tail: number;
}

export function reversedStretch(stretch: Stretch): Stretch {
  return { lead: stretch.tail, tail: stretch.lead };
}

/**
 * The stretch two paths run as one through the point each is cut at, as it lies on the first and on the second.
 * Nothing when they are cut at different points, or share nothing on either side of the point.
 */
export function sharedThroughCuts(a: PathCut, b: PathCut): readonly [Stretch, Stretch] | undefined {
  const after = sharedLead(a.after, b.after);
  const before = sharedLead(a.before.toReversed(), b.before.toReversed());
  if (after === 0 && before === 0) {
    return undefined;
  }
  const on = (cut: PathCut): Stretch => ({
    lead: lengthOfPath(cut.before) + after,
    tail: lengthOfPath(cut.after) + before,
  });
  return [on(a), on(b)];
}

/** Whether `next`, which starts where `segment` ends, goes straight on from it, level or upright. */
function continues(segment: Segment, next: Segment): boolean {
  const level = isHorizontal(segment) && isHorizontal(next);
  if (!level && !(isVertical(segment) && isVertical(next))) {
    return false;
  }
  const along = (each: Segment) => (level ? each.to.x - each.from.x : each.to.y - each.from.y);
  return along(segment) * along(next) > 0;
}

export function straightened(segments: readonly Segment[]): Segment[] {
  const runs: Segment[] = [];
  for (const segment of segments) {
    const last = runs.at(-1);
    if (last !== undefined && continues(last, segment)) {
      runs[runs.length - 1] = { from: last.from, to: segment.to };
    } else {
      runs.push(segment);
    }
  }
  return runs;
}

/**
 * The stretches left of a path once `lead` is cut from its start and `tail` from its end.
 * A stretch that is not cut is left as it is, whatever its length.
 */
function segmentsBetween(points: readonly Point[], lead: number, tail: number): Segment[] {
  const segments = segmentsOf(points);
  const cutsAtEnd: number[] = [];
  let behind = 0;
  for (const segment of segments.toReversed()) {
    cutsAtEnd.unshift(Math.max(tail - behind, 0));
    behind += lengthOf(segment);
  }
  const kept: Segment[] = [];
  let passed = 0;
  segments.forEach((segment, index) => {
    const from = Math.max(lead - passed, 0);
    const cut = cutsAtEnd[index] ?? 0;
    const to = lengthOf(segment) - cut;
    if (from === 0 && cut === 0) {
      kept.push(segment);
    } else if (to - from > TOLERANCE) {
      kept.push({ from: pointAlong(segment, from), to: pointAlong(segment, to) });
    }
    passed += lengthOf(segment);
  });
  return kept;
}

/** A piece of a path that lies in none of a set of its stretches. */
export interface Rest {
  readonly segments: readonly Segment[];
  /** The stretches that end where the piece starts, each by its place among those given. */
  readonly after: readonly number[];
  /** The stretches that start where the piece ends. */
  readonly before: readonly number[];
}

/**
 * What is left of a path outside the given stretches, piece by piece along it: one piece before each
 * stretch and one after them all. A piece is empty where stretches meet or lie one on another.
 */
export function restsBetween(points: readonly Point[], stretches: readonly Stretch[]): Rest[] {
  const inOrder = stretches
    .map((stretch, at) => ({ ...stretch, at }))
    .toSorted((one, other) => other.tail - one.tail);
  return [...inOrder, undefined].map((next, passed) => {
    const earlier = inOrder.slice(0, passed);
    const from = Math.max(0, ...earlier.map(({ lead }) => lead));
    const to = next === undefined ? 0 : next.tail;
    return {
      segments: segmentsBetween(points, from, to),
      after: earlier.filter(({ lead }) => lead >= from - TOLERANCE).map(({ at }) => at),
      before: inOrder.filter(({ tail }) => Math.abs(tail - to) <= TOLERANCE).map(({ at }) => at),
    };
  });
}
