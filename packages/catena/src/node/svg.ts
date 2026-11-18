import type { Point, Rect } from "../layout";
import { element, type SvgElement } from "../svg";

/**
 * Gives an id for an element another refers to, such as a `<clipPath>`. The ids are unique among the
 * nodes of one graph drawn once into a document; two graphs, or one node drawn twice, can repeat them. A
 * container passes the one it is given on to the parts it holds.
 */
export type NewId = () => string;

/** Two different node ids never give the same id, and each is a valid SVG id. */
export function idsOfNode(nodeId: string): NewId {
  const written = Array.from(nodeId, (c) =>
    /[A-Za-z0-9]/.test(c) ? c : `_${(c.codePointAt(0) ?? 0).toString(16)}_`,
  ).join("");
  let count = 0;
  return () => `catena-${written}-${++count}`;
}

/** `blur` is the standard deviation of the blur. At opacity 0 no shadow is drawn. */
export interface Shadow {
  readonly dx: number;
  readonly dy: number;
  readonly blur: number;
  readonly color: string;
  readonly opacity: number;
}

export const NO_SHADOW: Shadow = { dx: 0, dy: 0, blur: 0, color: "#000000", opacity: 0 };

export interface Outline {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly shadow: Shadow;
}

/**
 * A rectangle with `radius`-round corners whose stroke lies inside `box`, and the filter drawing its
 * shadow.
 */
export function outlinedRect(
  box: Rect,
  radius: number,
  outline: Outline,
  newId: NewId,
): readonly SvgElement[] {
  const { fill, stroke, strokeWidth, shadow } = outline;
  const rect = {
    x: box.x + strokeWidth / 2,
    y: box.y + strokeWidth / 2,
    width: box.width - strokeWidth,
    height: box.height - strokeWidth,
    rx: radius,
    fill,
    stroke,
    "stroke-width": strokeWidth,
  };
  if (shadow.opacity === 0) return [element("rect", rect)];
  const id = newId();
  const reach = 3 * shadow.blur;
  return [
    element(
      "filter",
      {
        id,
        filterUnits: "userSpaceOnUse",
        x: box.x + Math.min(0, shadow.dx) - reach,
        y: box.y + Math.min(0, shadow.dy) - reach,
        width: box.width + Math.abs(shadow.dx) + 2 * reach,
        height: box.height + Math.abs(shadow.dy) + 2 * reach,
      },
      [
        element("feDropShadow", {
          dx: shadow.dx,
          dy: shadow.dy,
          stdDeviation: shadow.blur,
          "flood-color": shadow.color,
          "flood-opacity": shadow.opacity,
        }),
      ],
    ),
    element("rect", { ...rect, filter: `url(#${id})` }),
  ];
}

/** How far apart two coordinates may be and still count as the same, for sums of fractions such as 0.1 + 0.2. */
const NEAR = 1e-6;

/**
 * Whether `point` is on a side of one of the filled `<rect>`s in `drawn`, stroke included, between its
 * corners, so the rect covers part of anything centred there. A rect under a `transform`, or in a
 * `<clipPath>`, is not drawn in place and is not one of them.
 */
export function onFilledRectSide(drawn: readonly SvgElement[], point: Point): boolean {
  return drawn.some(({ name, attributes, children }) => {
    if (name === "clipPath" || "transform" in attributes) return false;
    if (name === "rect" && attributes.fill !== "none" && onSide(attributes, point)) return true;
    return onFilledRectSide(children, point);
  });
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= NEAR;
}

function between(value: number, from: number, to: number): boolean {
  return value > from && value < to;
}

function onSide(attributes: Readonly<Record<string, string | number>>, point: Point): boolean {
  const number = (key: string) => Number(attributes[key] ?? 0);
  const half = number("stroke-width") / 2;
  const left = number("x") - half;
  const top = number("y") - half;
  const right = number("x") + number("width") + half;
  const bottom = number("y") + number("height") + half;
  return (
    ((near(point.x, left) || near(point.x, right)) && between(point.y, top, bottom)) ||
    ((near(point.y, top) || near(point.y, bottom)) && between(point.x, left, right))
  );
}
