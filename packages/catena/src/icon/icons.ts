import {
  arc,
  circle,
  closedCurve,
  cubic,
  curve,
  dot,
  ellipse,
  onCircle,
  polygon,
  polyline,
  quarter,
  roundedRect,
  type Point,
} from "./shape";

/** Icons are drawn on a square grid this many units wide. */
export const iconGrid = 24;

/** The SVG attributes every icon's path is drawn with. Widths are in grid units. */
export const iconStroke = {
  fill: "none",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
} as const;

/** The SVG attributes every filled icon's path is drawn with, besides its `fill`. */
export const filledIconPaint = { stroke: "none", "fill-rule": "evenodd" } as const;

const icon = (...paths: readonly string[]) => paths.join(" ");

/** The lower half of an ellipse's outline, from its left end to its right. */
function lowerHalf(cx: number, cy: number, rx: number, ry: number): string {
  const left: Point = [cx - rx, cy];
  const bottom: Point = [cx, cy + ry];
  const right: Point = [cx + rx, cy];
  return curve(
    left,
    quarter(left, [cx - rx, cy + ry], bottom),
    quarter(bottom, [cx + rx, cy + ry], right),
  );
}

/** A ray from the grid's centre, `length` long, at `degrees` clockwise from up. */
function ray(degrees: number, length: number): string {
  const radians = (degrees * Math.PI) / 180;
  return polyline([12, 12], [12 + Math.sin(radians) * length, 12 - Math.cos(radians) * length]);
}

/** Each icon's path data on the grid, drawn with `iconStroke`. */
export const iconPathData = {
  spark: icon(
    ...[0, 90, 180, 270].map((degrees) => ray(degrees, 9)),
    ...[45, 135, 225, 315].map((degrees) => ray(degrees, 7)),
  ),
  sparkle: icon(
    closedCurve(
      [12, 3],
      cubic([12.5, 9.5], [14.5, 11.5], [21, 12]),
      cubic([14.5, 12.5], [12.5, 14.5], [12, 21]),
      cubic([11.5, 14.5], [9.5, 12.5], [3, 12]),
      cubic([9.5, 11.5], [11.5, 9.5], [12, 3]),
    ),
  ),
  service: icon(
    ellipse(12, 10, 8, 5.5),
    polyline([12, 7.5], [12, 10.5], [14.5, 10.5]),
    polyline([9, 15.1], [9, 19], [15, 19], [15, 15.1]),
  ),
  plus: icon(polyline([12, 5], [12, 19]), polyline([5, 12], [19, 12])),
  minus: icon(polyline([5, 12], [19, 12])),
  close: icon(polyline([6, 6], [18, 18]), polyline([18, 6], [6, 18])),
  check: icon(polyline([5, 12.5], [10, 17.5], [19, 7])),
  info: icon(circle(12, 12, 9), polyline([12, 11], [12, 16.5]), dot(12, 7.5)),
  warning: icon(
    polygon([12, 3.5], [21.5, 20], [2.5, 20]),
    polyline([12, 9.5], [12, 13.5]),
    dot(12, 16.8),
  ),
  "arrow-right": icon(polyline([5, 12], [19, 12]), polyline([13, 6], [19, 12], [13, 18])),
  "chevron-right": icon(polyline([9, 6], [15, 12], [9, 18])),
  "chevron-down": icon(polyline([6, 9], [12, 15], [18, 9])),
  search: icon(circle(10.5, 10.5, 6.5), polyline([15.3, 15.3], [20, 20])),
  clock: icon(circle(12, 12, 9), polyline([12, 7], [12, 12], [15.5, 14.5])),
  user: icon(
    circle(12, 8, 4),
    curve(
      [4.5, 20.5],
      cubic([4.5, 16.5], [8, 14], [12, 14]),
      cubic([16, 14], [19.5, 16.5], [19.5, 20.5]),
    ),
  ),
  database: icon(
    ellipse(12, 6, 7, 2.5),
    polyline([5, 6], [5, 18]),
    polyline([19, 6], [19, 18]),
    lowerHalf(12, 12, 7, 2.5),
    lowerHalf(12, 18, 7, 2.5),
  ),
  server: icon(
    roundedRect(4, 4, 16, 6.5, 1.5),
    roundedRect(4, 13.5, 16, 6.5, 1.5),
    dot(7.5, 7.25),
    dot(7.5, 16.75),
  ),
  file: icon(
    polygon([6, 3], [14, 3], [19, 8], [19, 21], [6, 21]),
    polyline([14, 3], [14, 8], [19, 8]),
  ),
  folder: icon(polygon([3, 5], [9, 5], [11, 7.5], [21, 7.5], [21, 19], [3, 19])),
  image: icon(
    roundedRect(3, 4, 18, 16, 2),
    circle(8.5, 9.5, 1.5),
    polyline([3, 17], [8, 12.5], [12, 16], [15, 13.5], [21, 18]),
  ),
  mail: icon(roundedRect(3, 5, 18, 14, 2), polyline([3.5, 7], [12, 13], [20.5, 7])),
  chat: icon(polygon([4, 5], [20, 5], [20, 16], [11, 16], [6.5, 20], [6.5, 16], [4, 16])),
  code: icon(polyline([8, 7], [3, 12], [8, 17]), polyline([16, 7], [21, 12], [16, 17])),
  globe: icon(
    circle(12, 12, 9),
    polyline([3, 12], [21, 12]),
    curve([12, 3], cubic([8.5, 6.5], [8.5, 17.5], [12, 21])),
    curve([12, 3], cubic([15.5, 6.5], [15.5, 17.5], [12, 21])),
  ),
  play: icon(polygon([7, 4.5], [19, 12], [7, 19.5])),
  sliders: icon(
    polyline([4, 8], [7, 8]),
    polyline([11, 8], [20, 8]),
    circle(9, 8, 2),
    polyline([4, 16], [13, 16]),
    polyline([17, 16], [20, 16]),
    circle(15, 16, 2),
  ),
} satisfies Record<string, string>;

export type IconName = keyof typeof iconPathData;

const isIconName = (name: string): name is IconName => Object.hasOwn(iconPathData, name);

export const iconNames: readonly IconName[] = Object.keys(iconPathData).filter(isIconName);

/**
 * The outline of the clock's hands, `width` wide with round ends: from `top` down to the centre, then to
 * `end` down and to the right at 45 degrees.
 */
function clockHands(top: number, end: number, width: number): string {
  const half = width / 2;
  const centre: Point = [12, 12];
  return closedCurve(
    [12 - half, top],
    ...arc([12, top], half, 180, 360),
    [12 + half, 12 - half * (Math.SQRT2 - 1)],
    onCircle([end, end], half, 315),
    ...arc([end, end], half, 315, 495),
    onCircle(centre, half, 135),
    ...arc(centre, half, 135, 180),
  );
}

/** Each filled icon's path data on the grid, drawn with `filledIconPaint`. */
export const filledIconPathData = {
  clock: icon(circle(12, 12, 10), clockHands(8.5, 14.75, 1.75)),
} satisfies Record<string, string>;
