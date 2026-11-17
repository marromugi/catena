import type { PlacedEdge, Point } from "../layout";
import { element, type SvgElement } from "../node";

/** How an edge is drawn. */
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

/**
 * The edge as an unfilled `<path>` along its points, each bend rounded. It carries no stroke, so the
 * caller paints it, for example from a `<g>` around it.
 */
export function drawEdge(edge: PlacedEdge, options: EdgeOptions = {}): SvgElement {
  const radius = options.radius ?? DEFAULT_EDGE_RADIUS;
  if (!(radius >= 0)) {
    throw new RangeError(`An edge's radius must be 0 or more, not ${radius}.`);
  }
  return element("path", { d: pathData(turningPoints(edge.points), radius), fill: "none" });
}

/** The points without repeats, and without a point the path goes straight through. */
function turningPoints(points: readonly Point[]): Point[] {
  const distinct = points.filter(
    (point, index) => index === 0 || !samePoint(point, points[index - 1]),
  );
  return distinct.filter((point, index) => {
    const before = distinct[index - 1];
    const after = distinct[index + 1];
    if (before === undefined || after === undefined) return true;
    const { cos, sin } = turn(before, point, after);
    return !(sin === 0 && cos === 1);
  });
}

function pathData(points: readonly Point[], radius: number): string {
  const [start, ...rest] = points;
  if (start === undefined) return "";
  const last = points.length - 1;
  const commands = [`M ${start.x} ${start.y}`];
  let pen = start;
  for (const [offset, point] of rest.slice(0, -1).entries()) {
    const index = offset + 1;
    const before = points[index - 1] ?? point;
    const after = points[index + 1] ?? point;
    const { cos, sin } = turn(before, point, after);
    const lent = Math.min(
      distance(before, point) * (index - 1 === 0 ? 1 : 1 / 2),
      distance(point, after) * (index + 1 === last ? 1 : 1 / 2),
    );
    const tanHalfTurn = sin === 0 ? Infinity : (1 - cos) / Math.abs(sin);
    const cut = Math.min(radius * tanHalfTurn, lent);
    if (tanHalfTurn === Infinity || cut === 0) {
      commands.push(`L ${point.x} ${point.y}`);
      pen = point;
      continue;
    }
    const into = toward(point, before, cut);
    const out = toward(point, after, cut);
    const arcRadius = cut / tanHalfTurn;
    if (!samePoint(into, pen)) commands.push(`L ${into.x} ${into.y}`);
    commands.push(`A ${arcRadius} ${arcRadius} 0 0 ${sin > 0 ? 1 : 0} ${out.x} ${out.y}`);
    pen = out;
  }
  const end = rest.at(-1);
  if (end !== undefined && !samePoint(end, pen)) commands.push(`L ${end.x} ${end.y}`);
  return commands.join(" ");
}

/** The cosine and sine of the angle the path turns by at `at`; the sine is positive for a clockwise turn on screen. */
function turn(before: Point, at: Point, after: Point): { cos: number; sin: number } {
  const inX = (at.x - before.x) / distance(before, at);
  const inY = (at.y - before.y) / distance(before, at);
  const outX = (after.x - at.x) / distance(at, after);
  const outY = (after.y - at.y) / distance(at, after);
  return { cos: inX * outX + inY * outY, sin: inX * outY - inY * outX };
}

/** The point `length` from `from` on the way to `to`. */
function toward(from: Point, to: Point, length: number): Point {
  const whole = distance(from, to);
  return {
    x: from.x + ((to.x - from.x) / whole) * length,
    y: from.y + ((to.y - from.y) / whole) * length,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function samePoint(a: Point, b: Point | undefined): boolean {
  return b !== undefined && a.x === b.x && a.y === b.y;
}
