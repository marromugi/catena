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

export function isHorizontal(segment: Segment): boolean {
  return near(segment.from.y, segment.to.y);
}

export function isVertical(segment: Segment): boolean {
  return near(segment.from.x, segment.to.x);
}

export function isOrthogonal(segment: Segment): boolean {
  return isHorizontal(segment) || isVertical(segment);
}

export function lengthOf(segment: Segment): number {
  return Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
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

  let within: Side = "inside";
  if (level < across.low - TOLERANCE || level > across.high + TOLERANCE) {
    within = "outside";
  } else if (near(level, across.low) || near(level, across.high)) {
    within = "border";
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

/** How long two parallel segments run side by side, or zero when they are not parallel. */
function sharedRun(a: Segment, b: Segment): number {
  const horizontal = isHorizontal(a) && isHorizontal(b);
  if (!horizontal && !(isVertical(a) && isVertical(b))) {
    return 0;
  }
  const span = (segment: Segment): Span => {
    const from = horizontal ? segment.from.x : segment.from.y;
    const to = horizontal ? segment.to.x : segment.to.y;
    return { low: Math.min(from, to), high: Math.max(from, to) };
  };
  const first = span(a);
  const second = span(b);
  return Math.max(0, Math.min(first.high, second.high) - Math.max(first.low, second.low));
}

function distanceBetweenParallels(a: Segment, b: Segment): number {
  return isHorizontal(a) ? Math.abs(a.from.y - b.from.y) : Math.abs(a.from.x - b.from.x);
}

function spanOf(segment: Segment, horizontal: boolean): Span {
  const from = horizontal ? segment.from.x : segment.from.y;
  const to = horizontal ? segment.to.x : segment.to.y;
  return { low: Math.min(from, to), high: Math.max(from, to) };
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
