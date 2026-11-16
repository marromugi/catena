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

export function isHorizontal(segment: Segment): boolean {
  return Math.abs(segment.from.y - segment.to.y) <= TOLERANCE;
}

export function isVertical(segment: Segment): boolean {
  return Math.abs(segment.from.x - segment.to.x) <= TOLERANCE;
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

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE;
}

export function isOnBorder(rect: Rect, point: Point): boolean {
  if (!containsPoint(rect, point)) {
    return false;
  }
  return (
    near(point.x, rect.x) ||
    near(point.x, rect.x + rect.width) ||
    near(point.y, rect.y) ||
    near(point.y, rect.y + rect.height)
  );
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
  } else if (
    Math.abs(level - across.low) <= TOLERANCE ||
    Math.abs(level - across.high) <= TOLERANCE
  ) {
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
export function sharedRun(a: Segment, b: Segment): number {
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

/** The distance between the lines two parallel segments lie on. */
export function distanceBetweenParallels(a: Segment, b: Segment): number {
  return isHorizontal(a) ? Math.abs(a.from.y - b.from.y) : Math.abs(a.from.x - b.from.x);
}
