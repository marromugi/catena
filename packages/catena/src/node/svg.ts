import type { Rect } from "../layout";

/** One SVG element and what it holds. Parts draw these, and only {@link writeSvg} turns them into text. */
export interface SvgElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string | number>>;
  readonly children: readonly SvgElement[];
}

export function element(
  name: string,
  attributes: Readonly<Record<string, string | number>> = {},
  children: readonly SvgElement[] = [],
): SvgElement {
  return { name, attributes, children };
}

/**
 * Gives an id for an element another refers to, such as a `<clipPath>`. The ids are unique among the
 * nodes of one graph drawn once into a document; two graphs, or one node drawn twice, can repeat them. A
 * container passes the one it is given on to the parts it holds.
 */
export type NewId = () => string;

/**
 * Ids for the elements of the node `nodeId`: `catena-`, the node id with each character but a letter or
 * digit written as `_<code point in hex>_`, `-`, and a count. Two different node ids never give the same
 * id, and each is a valid SVG id.
 */
export function idsOfNode(nodeId: string): NewId {
  const written = Array.from(nodeId, (c) =>
    /[A-Za-z0-9]/.test(c) ? c : `_${(c.codePointAt(0) ?? 0).toString(16)}_`,
  ).join("");
  let count = 0;
  return () => `catena-${written}-${++count}`;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };

/** The element as SVG markup, its attribute values escaped so any string stays one value. */
export function writeSvg({ name, attributes, children }: SvgElement): string {
  const written = Object.entries(attributes)
    .map(
      ([key, value]) => ` ${key}="${String(value).replaceAll(/[&"<>]/g, (c) => ESCAPES[c] ?? c)}"`,
    )
    .join("");
  return children.length === 0
    ? `<${name}${written}/>`
    : `<${name}${written}>${children.map(writeSvg).join("")}</${name}>`;
}

/**
 * A soft shadow cast by a shape: moved by (`dx`, `dy`), blurred by `blur` (the standard deviation of
 * the blur), in `color` at `opacity`. At opacity 0 no shadow is drawn.
 */
export interface Shadow {
  readonly dx: number;
  readonly dy: number;
  readonly blur: number;
  readonly color: string;
  readonly opacity: number;
}

export const NO_SHADOW: Shadow = { dx: 0, dy: 0, blur: 0, color: "#000000", opacity: 0 };

/** How an outlined shape is painted. */
export interface Outline {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly shadow: Shadow;
}

/**
 * A rectangle with `radius`-round corners whose stroke lies inside `box`, and the filter drawing its
 * shadow. The shadow reaches past `box` by its offset and three times its blur.
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
