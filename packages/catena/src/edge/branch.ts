import type { PlacedEdge, Point } from "../layout";
import { heading, turningPoints, type Heading } from "./edge";

/** How far apart two coordinates may be and still count as one: placement leaves edges that share a line a few ulps apart. */
const TOLERANCE = 1e-6;

/**
 * A point where edges out of one node that ran along one stretch part ways, or where edges into one node
 * come together onto one.
 */
export interface BranchPoint {
  readonly point: Point;
  /** The ids of the edges that bend off the stretch here, or onto it. */
  readonly edges: readonly string[];
}

/**
 * The bends where an edge runs along another edge from the same node or to the same node on one side and
 * not on the other, each point once, in the order the edges and their bends come. An edge's ends are
 * never branch points.
 */
export function branchPoints(edges: readonly PlacedEdge[]): BranchPoint[] {
  const paths = edges.map(({ id, from, to, points }) => ({
    id,
    from,
    to,
    points: turningPoints(points),
  }));
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
          (other.from === path.from || other.to === path.to) &&
          runsAlong(other.points, point, back) !== runsAlong(other.points, point, forward),
      );
      if (!parts) continue;
      const branch = found.find(
        (known) => near(known.point.x, point.x) && near(known.point.y, point.y),
      );
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
      return (
        near(start.y, point.y) && near(end.y, point.y) && covers(start.x, end.x, point.x, toward.x)
      );
    }
    return (
      toward.x === 0 &&
      near(start.x, point.x) &&
      near(end.x, point.x) &&
      covers(start.y, end.y, point.y, toward.y)
    );
  });
}

/** Whether the span from `a` to `b` holds `at` and some of what lies past it in the direction `sign`. */
function covers(a: number, b: number, at: number, sign: number): boolean {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return sign > 0
    ? low - TOLERANCE <= at && at < high - TOLERANCE
    : low + TOLERANCE < at && at <= high + TOLERANCE;
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE;
}
