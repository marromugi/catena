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

/** How an outlined shape is painted. */
export interface Outline {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
}

/** A rectangle with `radius`-round corners whose stroke lies inside `box`. */
export function outlinedRect(box: Rect, radius: number, outline: Outline): SvgElement {
  const { fill, stroke, strokeWidth } = outline;
  return element("rect", {
    x: box.x + strokeWidth / 2,
    y: box.y + strokeWidth / 2,
    width: box.width - strokeWidth,
    height: box.height - strokeWidth,
    rx: radius,
    fill,
    stroke,
    "stroke-width": strokeWidth,
  });
}
