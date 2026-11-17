// Path data for the shapes icons are drawn from, in absolute M, L, C and Z
// commands only: a curve then stays inside its control points, so the
// points written are a bound on what is drawn.

export type Point = readonly [x: number, y: number];
/** A cubic Bézier step: two control points, then where it ends. */
export type Cubic = readonly [Point, Point, Point];
type Step = Point | Cubic;

/** How far a cubic's control points sit along the tangent to draw a quarter circle. */
const QUARTER = 0.5523;

const num = (value: number) => String(Math.round(value * 1000) / 1000);
const at = ([x, y]: Point) => `${num(x)} ${num(y)}`;
const isCubic = (step: Step): step is Cubic => typeof step[0] !== "number";

export const cubic = (control1: Point, control2: Point, end: Point): Cubic => [
  control1,
  control2,
  end,
];

export function curve(start: Point, ...steps: readonly Step[]): string {
  const drawn = steps.map((step) =>
    isCubic(step) ? `C${step.map(at).join(" ")}` : `L${at(step)}`,
  );
  return [`M${at(start)}`, ...drawn].join(" ");
}

export const closedCurve = (start: Point, ...steps: readonly Step[]) =>
  `${curve(start, ...steps)} Z`;

export const polyline = (start: Point, ...points: readonly Point[]) => curve(start, ...points);

export const polygon = (start: Point, ...points: readonly Point[]) => closedCurve(start, ...points);

/** A quarter of an ellipse from `from` to `to`, bending toward `corner`. */
export function quarter(from: Point, corner: Point, to: Point): Cubic {
  const toward = (a: Point, b: Point): Point => [
    a[0] + (b[0] - a[0]) * QUARTER,
    a[1] + (b[1] - a[1]) * QUARTER,
  ];
  return [toward(from, corner), toward(to, corner), to];
}

/** Where `degrees` clockwise from the right lands on the circle around `center`. */
export function onCircle([cx, cy]: Point, radius: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return [cx + Math.cos(radians) * radius, cy + Math.sin(radians) * radius];
}

/** The arc around `center` from `from` to `to` degrees, clockwise from the right, as cubics of a quarter or less. */
export function arc(center: Point, radius: number, from: number, to: number): Cubic[] {
  const pieces = Math.ceil(Math.abs(to - from) / 90);
  const sweep = (to - from) / pieces;
  const reach = (4 / 3) * Math.tan((sweep * Math.PI) / 720) * radius;
  /** The control point `reach` along the tangent at `degrees`, forward when `sign` is 1. */
  const along = (degrees: number, sign: number): Point => {
    const [x, y] = onCircle(center, radius, degrees);
    const radians = (degrees * Math.PI) / 180;
    return [x - Math.sin(radians) * reach * sign, y + Math.cos(radians) * reach * sign];
  };
  return Array.from({ length: pieces }, (_, index) => {
    const start = from + sweep * index;
    const end = start + sweep;
    return cubic(along(start, 1), along(end, -1), onCircle(center, radius, end));
  });
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  const top: Point = [cx, cy - ry];
  const right: Point = [cx + rx, cy];
  const bottom: Point = [cx, cy + ry];
  const left: Point = [cx - rx, cy];
  return closedCurve(
    top,
    quarter(top, [cx + rx, cy - ry], right),
    quarter(right, [cx + rx, cy + ry], bottom),
    quarter(bottom, [cx - rx, cy + ry], left),
    quarter(left, [cx - rx, cy - ry], top),
  );
}

export const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r);

/** A dot as wide as the stroke, drawn by its round cap. */
export const dot = (cx: number, cy: number) => curve([cx, cy], [cx, cy]);

export function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  r: number,
): string {
  const [left, top, right, bottom] = [x, y, x + width, y + height];
  return closedCurve(
    [left + r, top],
    [right - r, top],
    quarter([right - r, top], [right, top], [right, top + r]),
    [right, bottom - r],
    quarter([right, bottom - r], [right, bottom], [right - r, bottom]),
    [left + r, bottom],
    quarter([left + r, bottom], [left, bottom], [left, bottom - r]),
    [left, top + r],
    quarter([left, top + r], [left, top], [left + r, top]),
  );
}
