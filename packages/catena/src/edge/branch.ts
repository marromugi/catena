import type { PlacedEdge, Point } from "../layout";
import { heading, samePoint, turningPoints, type Heading } from "./edge";

/** A point where edges that ran along one stretch part ways, or where edges come together onto one. */
export interface BranchPoint {
  readonly point: Point;
  /** The ids of the edges that bend off the stretch here, or onto it. */
  readonly edges: readonly string[];
}

/**
 * The bends where an edge runs along another edge on one side and not on the other, each point once, in
 * the order the edges and their bends come. An edge's ends are never branch points.
 */
export function branchPoints(edges: readonly PlacedEdge[]): BranchPoint[] {
  const paths = edges.map(({ id, points }) => ({ id, points: turningPoints(points) }));
  const found: { point: Point; edges: string[] }[] = [];
  for (const path of paths) {
    const { points } = path;
    for (let index = 1; index < points.length - 1; index++) {
      const point = points[index] ?? points[0];
      const back = heading(point, points[index - 1] ?? point);
      const forward = heading(point, points[index + 1] ?? point);
      const parts = paths.some(
        (other) =>
          other !== path &&
          runsAlong(other.points, point, back) !== runsAlong(other.points, point, forward),
      );
      if (!parts) continue;
      const branch = found.find((known) => samePoint(known.point, point));
      if (branch === undefined) found.push({ point, edges: [path.id] });
      else branch.edges.push(path.id);
    }
  }
  return found;
}

/** Whether a horizontal or vertical stretch of `points` goes through `point` and on from it towards `toward`. */
function runsAlong(points: readonly Point[], point: Point, toward: Heading): boolean {
  return points.slice(1).some((end, index) => {
    const start = points[index] ?? end;
    if (toward.y === 0) {
      return start.y === point.y && end.y === point.y && covers(start.x, end.x, point.x, toward.x);
    }
    return (
      toward.x === 0 &&
      start.x === point.x &&
      end.x === point.x &&
      covers(start.y, end.y, point.y, toward.y)
    );
  });
}

/** Whether the span from `a` to `b` holds `at` and some of what lies past it in the direction `sign`. */
function covers(a: number, b: number, at: number, sign: number): boolean {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return sign > 0 ? low <= at && at < high : low < at && at <= high;
}
