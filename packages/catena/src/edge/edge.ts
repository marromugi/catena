import type { PlacedEdge, Point } from "../layout";
import { element, type SvgElement } from "../svg";

export interface EdgeOptions {
  /**
   * The radius each bend is rounded by, {@link DEFAULT_EDGE_RADIUS} when not given; 0 draws sharp bends. A
   * bend whose stretches are too short for it gets the largest radius they allow: a stretch between two
   * bends lends each bend at most half its length, a stretch at an end lends its one bend all of it.
   */
  readonly radius?: number;
}

/** The radius of a bend when none is given: the corner radius of a default card. */
export const DEFAULT_EDGE_RADIUS = 8;

/** The radius of the dot at each end of an edge and at each of its branch points. */
export const EDGE_DOT_RADIUS = 4;

/** A circle {@link EDGE_DOT_RADIUS} round centred on `point`. It carries no fill, so the caller paints it. */
export function drawEdgeDot({ x, y }: Point): SvgElement {
  return element("circle", { cx: x, cy: y, r: EDGE_DOT_RADIUS });
}

/**
 * Where a horizontal stretch meets a vertical one the bend is rounded; any other turn, which `verify`
 * reports as `edge-not-orthogonal`, or a turn back, is drawn sharp. The path carries no stroke, so the
 * caller paints it, for example from a `<g>` around it.
 */
export function drawEdge(edge: PlacedEdge, options: EdgeOptions = {}): SvgElement {
  const radius = options.radius ?? DEFAULT_EDGE_RADIUS;
  if (!(radius >= 0)) {
    throw new RangeError(`An edge's radius must be 0 or more, not ${radius}.`);
  }
  return element("path", { d: pathData(turningPoints(edge.points), radius), fill: "none" });
}

/** Which way a stretch goes, each of `x` and `y` -1, 0 or 1. */
export interface Heading {
  readonly x: number;
  readonly y: number;
}

/** The points without repeats, and without a point a horizontal or vertical stretch goes straight through. */
export function turningPoints(points: readonly [Point, ...Point[]]): [Point, ...Point[]] {
  const [first, ...others] = points;
  const distinct: [Point, ...Point[]] = [first];
  let previous = first;
  for (const point of others) {
    if (samePoint(point, previous)) continue;
    distinct.push(point);
    previous = point;
  }
  const [start, ...rest] = distinct;
  const kept: [Point, ...Point[]] = [start];
  let before = start;
  for (const [index, point] of rest.entries()) {
    const after = rest[index + 1];
    const straight =
      after !== undefined &&
      isAxial(heading(before, point)) &&
      samePoint(heading(before, point), heading(point, after));
    if (straight) continue;
    kept.push(point);
    before = point;
  }
  return kept;
}

function pathData(points: readonly [Point, ...Point[]], radius: number): string {
  const [start] = points;
  const last = points.length - 1;
  const commands = [`M ${start.x} ${start.y}`];
  let pen = start;
  for (let index = 1; index < last; index++) {
    const before = points[index - 1] ?? start;
    const point = points[index] ?? start;
    const after = points[index + 1] ?? start;
    const into = heading(before, point);
    const out = heading(point, after);
    const cut = Math.min(
      radius,
      distance(before, point) * (index - 1 === 0 ? 1 : 1 / 2),
      distance(point, after) * (index + 1 === last ? 1 : 1 / 2),
    );
    if (!isRightAngle(into, out) || cut === 0) {
      commands.push(`L ${point.x} ${point.y}`);
      pen = point;
      continue;
    }
    const arcStart = { x: point.x - into.x * cut, y: point.y - into.y * cut };
    const arcEnd = { x: point.x + out.x * cut, y: point.y + out.y * cut };
    if (!samePoint(arcStart, pen)) commands.push(`L ${arcStart.x} ${arcStart.y}`);
    const clockwise = into.x * out.y - into.y * out.x > 0;
    commands.push(`A ${cut} ${cut} 0 0 ${clockwise ? 1 : 0} ${arcEnd.x} ${arcEnd.y}`);
    pen = arcEnd;
  }
  const end = points[last] ?? start;
  if (!samePoint(end, pen)) commands.push(`L ${end.x} ${end.y}`);
  return commands.join(" ");
}

export function heading(from: Point, to: Point): Heading {
  return { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
}

function isAxial(h: Heading): boolean {
  return h.x === 0 || h.y === 0;
}

function isRightAngle(a: Heading, b: Heading): boolean {
  return isAxial(a) && isAxial(b) && a.x * b.x + a.y * b.y === 0;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}
