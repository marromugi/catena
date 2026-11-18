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

/** Elements whose children are not drawn where their own coordinates say. */
const NOT_DRAWN_IN_PLACE = new Set(["clipPath", "defs", "filter", "mask", "pattern"]);

/** How far apart two coordinates may be and still count as the same, for sums of fractions such as 0.1 + 0.2. */
const NEAR = 1e-6;

/**
 * Whether `point` is on the outline of one of the filled `<rect>`s in `drawn`, its stroke and round corners
 * included, so the rect covers about half of anything centred there. A rect under a `transform`, or
 * inside an element such as `<clipPath>` that is not drawn in place, is not one of them.
 */
export function onFilledOutline(drawn: readonly SvgElement[], point: Point): boolean {
  return drawn.some(({ name, attributes, children }) => {
    if (NOT_DRAWN_IN_PLACE.has(name) || "transform" in attributes) return false;
    if (name === "rect" && attributes.fill !== "none" && onOutline(attributes, point)) return true;
    return onFilledOutline(children, point);
  });
}

/** Read as SVG reads a `<rect>`, `rx` cut to half the width and height. */
function onOutline(attributes: Readonly<Record<string, string | number>>, point: Point): boolean {
  const number = (key: string) => Number(attributes[key] ?? 0);
  const half = number("stroke-width") / 2;
  const width = number("width");
  const height = number("height");
  const round = Math.min(number("rx"), width / 2, height / 2) + half;
  const left = number("x") - half + round;
  const top = number("y") - half + round;
  const right = number("x") + width + half - round;
  const bottom = number("y") + height + half - round;
  const inside = point.x > left && point.x < right && point.y > top && point.y < bottom;
  const nearest = {
    x: Math.min(Math.max(point.x, left), right),
    y: Math.min(Math.max(point.y, top), bottom),
  };
  const away = Math.hypot(point.x - nearest.x, point.y - nearest.y);
  return !inside && Math.abs(away - round) <= NEAR;
}
