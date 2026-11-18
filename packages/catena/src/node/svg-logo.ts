import type { LogoShape, OwnLogo } from "./logo";
import {
  determinant,
  evenScale,
  IDENTITY,
  isIdentity,
  type Matrix,
  multiply,
  number,
  numberList,
  transformList,
  transformPathData,
} from "./svg-transform";
import { MalformedXmlError, parseXml, type XmlElement } from "./xml";

/** An SVG file holds something {@link readSvgLogo} cannot turn into a logo; the message names it. */
export class UnreadableSvgError extends Error {
  override readonly name = "UnreadableSvgError";
}

/**
 * The logo an SVG file draws, from the file's text; reading the file is the caller's.
 *
 * The view box is the root `<svg>`'s `viewBox`, or `0 0 width height` when it has none. Each `<path>`,
 * `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>` and `<polygon>` becomes path data, filled
 * and then stroked in the colours it gives or takes from its `<g>`s and the root, as attributes or in an
 * inline `style`; a shape that draws nothing is left out. A fill follows the `fill-rule` the shape gives
 * or takes the same way; a stroke has none. A stroke's caps and joins must both be round, as a logo's
 * strokes are drawn. `<defs>`, `<title>`, `<desc>` and `<metadata>` are skipped.
 *
 * The `transform` attributes of the `<g>`s and the shapes are applied to each shape's path data, in
 * absolute commands, so it draws where the file draws it; a stroke's width is scaled with it. A shape a
 * transform flattens to nothing is left out.
 * @throws UnreadableSvgError naming the element or attribute when:
 * - the file is not well-formed XML, or nests elements deeper than this reader follows;
 * - its root is not `<svg>`, gives no size, or has `preserveAspectRatio` `none` or `slice`;
 * - it draws nothing;
 * - the root `<svg>` has a `transform`, whose place depends on the size the file is shown at;
 * - a `transform` is not a list of SVG's transform functions in plain numbers, or is given in `style`
 *   or with `transform-origin` or `transform-box`; path data under a transform is not path data; or a
 *   stroke is under a transform that does not scale evenly in both directions;
 * - it holds the CSS `translate`, `rotate` or `scale`, `url(...)` paint, `currentColor`, `<use>`,
 *   `<text>`, `<image>`, `clip-path`, `mask`, `filter`, `<style>` anywhere or `class`, an opacity below
 *   1, a `fill-rule` other than `nonzero` or `evenodd`, dashes, markers, a stroke painted under its
 *   fill, a blend mode, a shape's geometry in `style`, or any element not named above;
 * - a length is in units other than user units or `px`, `points` are not pairs of numbers, or a shape's
 *   coordinates run past the largest number.
 */
export function readSvgLogo(svg: string): OwnLogo {
  let root: XmlElement;
  try {
    root = parseXml(svg);
  } catch (error) {
    if (error instanceof MalformedXmlError) {
      throw new UnreadableSvgError(`The SVG is not well-formed XML: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }
  if (root.name !== "svg")
    throw new UnreadableSvgError(`The file's root is <${root.name}>, not <svg>.`);
  if (holds(root, "style")) throw refused("<style>");
  const viewBox = viewBoxOf(root);
  const properties = propertiesOf(root);
  const shapes = hidden(properties) ? [] : rootShapes(root, properties);
  if (shapes.length === 0) throw new UnreadableSvgError("The SVG draws no shape.");
  return { viewBox, shapes };
}

function rootShapes(root: XmlElement, properties: ReadonlyMap<string, string>): LogoShape[] {
  const paint = paintOf(root, properties, INITIAL_PAINT);
  if (properties.has("transform")) throw refused("transform on <svg>");
  return shapesIn(root, paint, IDENTITY);
}

/** The matrix the element's `transform` attribute gives. */
function ownTransform(element: XmlElement, properties: ReadonlyMap<string, string>): Matrix {
  const given = properties.get("transform");
  if (given === undefined) return IDENTITY;
  for (const property of ["transform-origin", "transform-box"]) {
    if (properties.has(property)) throw refused(`${property} on <${element.name}>`);
  }
  const matrix = transformList(given);
  if (matrix === undefined) {
    throw new UnreadableSvgError(
      `transform "${given}" on <${element.name}> is not a list of SVG transform functions.`,
    );
  }
  return matrix;
}

interface Paint {
  /** `null` for `none`. */
  readonly fill: string | null;
  readonly fillRule: "nonzero" | "evenodd";
  readonly stroke: string | null;
  readonly strokeWidth: number;
  readonly linecap: string;
  readonly linejoin: string;
}

const INITIAL_PAINT: Paint = {
  fill: "black",
  fillRule: "nonzero",
  stroke: null,
  strokeWidth: 1,
  linecap: "butt",
  linejoin: "miter",
};

const SKIPPED = new Set(["defs", "title", "desc", "metadata"]);

/** Turns a shape element into path data, or `undefined` when it has no area or length to draw. */
const SHAPES: ReadonlyMap<string, (shape: XmlElement) => string | undefined> = new Map(
  Object.entries({
    path: (shape: XmlElement) => {
      const d = shape.attributes.get("d")?.trim();
      return d === undefined || d === "" ? undefined : d;
    },
    rect: rectPath,
    circle: (shape: XmlElement) => {
      const cx = lengthOr0(shape, "cx");
      const cy = lengthOr0(shape, "cy");
      const r = lengthOr0(shape, "r");
      return r <= 0 ? undefined : ellipsePath(cx, cy, r, r);
    },
    ellipse: (shape: XmlElement) => {
      const cx = lengthOr0(shape, "cx");
      const cy = lengthOr0(shape, "cy");
      const [rx, ry] = radii(shape);
      return rx <= 0 || ry <= 0 ? undefined : ellipsePath(cx, cy, rx, ry);
    },
    line: (shape: XmlElement) => {
      const x1 = lengthOr0(shape, "x1");
      const y1 = lengthOr0(shape, "y1");
      const x2 = lengthOr0(shape, "x2");
      const y2 = lengthOr0(shape, "y2");
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    },
    polyline: (shape: XmlElement) => pointsPath(shape, false),
    polygon: (shape: XmlElement) => pointsPath(shape, true),
  }),
);

/** A line has no inside to fill. */
const UNFILLED = new Set(["line"]);

/** The shapes `parent` holds, placed by `placed`: the transforms of `parent` and those around it. */
function shapesIn(parent: XmlElement, inherited: Paint, placed: Matrix): LogoShape[] {
  const shapes: LogoShape[] = [];
  for (const child of parent.children) {
    if (SKIPPED.has(child.name)) continue;
    const toPath = SHAPES.get(child.name);
    if (child.name !== "g" && toPath === undefined) throw refused(`<${child.name}>`);
    const properties = propertiesOf(child);
    if (hidden(properties)) continue;
    const paint = paintOf(child, properties, inherited);
    const childPlaced = multiply(placed, ownTransform(child, properties));
    if (determinant(childPlaced) === 0) continue;
    if (toPath === undefined) {
      shapes.push(...shapesIn(child, paint, childPlaced));
      continue;
    }
    const inside = child.children.find(({ name }) => !SKIPPED.has(name));
    if (inside !== undefined) throw refused(`<${inside.name}> inside <${child.name}>`);
    const drawn = toPath(child);
    if (drawn === undefined) continue;
    if (child.name !== "path") refuseOverflow(child, drawn);
    const pathData = isIdentity(childPlaced) ? drawn : placedPath(child, drawn, childPlaced);
    shapes.push(...shapesOf(child.name, pathData, paint, childPlaced));
  }
  return shapes;
}

function placedPath(shape: XmlElement, drawn: string, placed: Matrix): string {
  const pathData = transformPathData(drawn, placed);
  if (pathData === undefined) {
    throw new UnreadableSvgError(`d "${drawn}" on <${shape.name}> is not path data.`);
  }
  refuseOverflow(shape, pathData);
  return pathData;
}

function refuseOverflow(shape: XmlElement, pathData: string): void {
  if (/Infinity|NaN/.test(pathData)) {
    throw new UnreadableSvgError(`The coordinates of <${shape.name}> run past the largest number.`);
  }
}

function shapesOf(name: string, pathData: string, paint: Paint, placed: Matrix): LogoShape[] {
  const shapes: LogoShape[] = [];
  if (paint.fill !== null && !UNFILLED.has(name)) {
    shapes.push({
      pathData,
      paint: "fill",
      color: paint.fill,
      ...(paint.fillRule === "evenodd" ? { fillRule: "evenodd" } : {}),
    });
  }
  if (paint.stroke !== null && paint.strokeWidth > 0) {
    if (paint.linecap !== "round" || paint.linejoin !== "round") {
      throw new UnreadableSvgError(
        `The stroke of <${name}> has stroke-linecap ${paint.linecap} and stroke-linejoin ` +
          `${paint.linejoin}; a logo's strokes have both round.`,
      );
    }
    const scale = evenScale(placed);
    if (scale === undefined) {
      throw new UnreadableSvgError(
        `The stroke of <${name}> is under a transform that does not scale evenly in both ` +
          `directions; a logo's stroke-width is one number.`,
      );
    }
    const width = paint.strokeWidth * scale;
    if (!Number.isFinite(width)) {
      throw new UnreadableSvgError(`The stroke-width of <${name}> runs past the largest number.`);
    }
    if (width > 0) shapes.push({ pathData, paint: "stroke", color: paint.stroke, width });
  }
  return shapes;
}

function holds(element: XmlElement, name: string): boolean {
  return element.children.some((child) => child.name === name || holds(child, name));
}

function hidden(properties: ReadonlyMap<string, string>): boolean {
  return properties.get("display")?.trim().toLowerCase() === "none";
}

/**
 * Read only as attributes: a shape's geometry, which given in `style` would win over them, and
 * `transform`, whose CSS form has a grammar of its own.
 */
const ATTRIBUTE_ONLY = new Set([
  "x",
  "y",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "d",
  "transform",
]);

/** The element's presentation attributes, with its inline `style` given over them. */
function propertiesOf(element: XmlElement): Map<string, string> {
  if (element.attributes.has("class")) throw refused(`class on <${element.name}>`);
  const properties = new Map(element.attributes);
  properties.delete("style");
  const important = new Set<string>();
  const style = element.attributes.get("style")?.replaceAll(/\/\*[\s\S]*?\*\//g, "") ?? "";
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const given = declaration.slice(colon + 1);
    const isImportant = /!\s*important\s*$/i.test(given);
    if (important.has(property) && !isImportant) continue;
    if (isImportant) important.add(property);
    if (ATTRIBUTE_ONLY.has(property))
      throw refused(`${property} in the style of <${element.name}>`);
    properties.set(property, given.replace(/!\s*important\s*$/i, "").trim());
  }
  return properties;
}

/** Refuses what the element's properties give that a logo cannot hold. */
function refuseUnheld(element: XmlElement, properties: ReadonlyMap<string, string>): void {
  for (const property of ["translate", "rotate", "scale"]) {
    if (properties.has(property)) throw refused(`${property} on <${element.name}>`);
  }
  for (const [property, allowed] of LIMITED) {
    const value = properties.get(property)?.trim().toLowerCase();
    if (value !== undefined && !allowed(value)) {
      throw refused(`${property} ${value} on <${element.name}>`);
    }
  }
  for (const property of ["opacity", "fill-opacity", "stroke-opacity"]) {
    const value = properties.get(property)?.trim();
    if (value === undefined || value === "" || value.toLowerCase() === "inherit") continue;
    if (opacity(element, property, value) < 1) {
      throw refused(`${property} ${value} on <${element.name}>`);
    }
  }
}

const isNone = (value: string): boolean => value === "none";

/** Properties a logo holds only some values of, with the values it holds. */
const LIMITED: ReadonlyArray<readonly [string, (value: string) => boolean]> = [
  ["clip-path", isNone],
  ["mask", isNone],
  ["filter", isNone],
  ["marker", isNone],
  ["marker-start", isNone],
  ["marker-mid", isNone],
  ["marker-end", isNone],
  ["stroke-dasharray", isNone],
  ["visibility", (value) => value === "visible" || value === "inherit"],
  ["paint-order", (value) => value === "normal" || value.startsWith("fill")],
  ["vector-effect", isNone],
  ["mix-blend-mode", (value) => value === "normal"],
];

function paintOf(
  element: XmlElement,
  properties: ReadonlyMap<string, string>,
  inherited: Paint,
): Paint {
  refuseUnheld(element, properties);
  const given = (property: string): string | undefined => {
    const value = properties.get(property)?.trim();
    return value === undefined || value === "" || value.toLowerCase() === "inherit"
      ? undefined
      : value;
  };
  const color = (property: "fill" | "stroke"): string | null => {
    const value = given(property);
    if (value === undefined) return inherited[property];
    const lower = value.toLowerCase();
    if (lower === "none") return null;
    if (lower.startsWith("url(")) throw refused(`url(...) ${property} on <${element.name}>`);
    if (lower === "currentcolor" || lower.startsWith("context-") || lower.includes("var(")) {
      throw refused(`${property} ${value} on <${element.name}>`);
    }
    return value;
  };
  const fillRule = (): Paint["fillRule"] => {
    const value = given("fill-rule")?.toLowerCase();
    if (value === undefined) return inherited.fillRule;
    if (value !== "nonzero" && value !== "evenodd") {
      throw refused(`fill-rule ${value} on <${element.name}>`);
    }
    return value;
  };
  const givenWidth = given("stroke-width");
  const strokeWidth =
    givenWidth === undefined ? inherited.strokeWidth : length(element, "stroke-width", givenWidth);
  if (strokeWidth < 0) throw refused(`stroke-width ${strokeWidth} on <${element.name}>`);
  return {
    fill: color("fill"),
    fillRule: fillRule(),
    stroke: color("stroke"),
    strokeWidth,
    linecap: given("stroke-linecap")?.toLowerCase() ?? inherited.linecap,
    linejoin: given("stroke-linejoin")?.toLowerCase() ?? inherited.linejoin,
  };
}

function viewBoxOf(root: XmlElement): OwnLogo["viewBox"] {
  const aspect = root.attributes.get("preserveAspectRatio")?.trim();
  if (aspect !== undefined && /\b(none|slice)\b/.test(aspect)) {
    throw refused(`preserveAspectRatio ${aspect} on <svg>`);
  }
  const given = root.attributes.get("viewBox");
  if (given !== undefined) {
    const numbers = numberList(given) ?? [];
    const [x, y, width, height] = numbers;
    if (
      numbers.length !== 4 ||
      x === undefined ||
      y === undefined ||
      width === undefined ||
      height === undefined ||
      width <= 0 ||
      height <= 0
    ) {
      throw new UnreadableSvgError(
        `The root <svg>'s viewBox "${given}" is not four numbers with a width and height above 0.`,
      );
    }
    return { x, y, width, height };
  }
  const width = root.attributes.get("width");
  const height = root.attributes.get("height");
  if (width === undefined || height === undefined) {
    throw new UnreadableSvgError("The root <svg> gives neither a viewBox nor a width and height.");
  }
  const size = { width: length(root, "width", width), height: length(root, "height", height) };
  if (size.width <= 0 || size.height <= 0) {
    throw new UnreadableSvgError("The root <svg>'s width and height are not both above 0.");
  }
  return { x: 0, y: 0, ...size };
}

function rectPath(rect: XmlElement): string | undefined {
  const x = lengthOr0(rect, "x");
  const y = lengthOr0(rect, "y");
  const width = lengthOr0(rect, "width");
  const height = lengthOr0(rect, "height");
  if (width <= 0 || height <= 0) return undefined;
  const [givenX, givenY] = radii(rect);
  const rx = Math.min(givenX, width / 2);
  const ry = Math.min(givenY, height / 2);
  if (rx <= 0 || ry <= 0) return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
  const corner = (toX: number, toY: number) => `A ${rx} ${ry} 0 0 1 ${toX} ${toY}`;
  return [
    `M ${x + rx} ${y}`,
    `H ${x + width - rx}`,
    corner(x + width, y + ry),
    `V ${y + height - ry}`,
    corner(x + width - rx, y + height),
    `H ${x + rx}`,
    corner(x, y + height - ry),
    `V ${y + ry}`,
    corner(x + rx, y),
    "Z",
  ].join(" ");
}

const notNegative = (found: number | undefined): number | undefined =>
  found === undefined || found < 0 ? undefined : found;

/** `rx` and `ry`, each taking the other's value when it alone is not given or is negative. */
function radii(shape: XmlElement): [number, number] {
  const rx = notNegative(optionalLength(shape, "rx"));
  const ry = notNegative(optionalLength(shape, "ry"));
  return [rx ?? ry ?? 0, ry ?? rx ?? 0];
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const half = `A ${rx} ${ry} 0 1 1`;
  return `M ${cx + rx} ${cy} ${half} ${cx - rx} ${cy} ${half} ${cx + rx} ${cy} Z`;
}

function pointsPath(shape: XmlElement, closed: boolean): string | undefined {
  const given = shape.attributes.get("points")?.trim() ?? "";
  if (given === "") return undefined;
  const numbers = numberList(given);
  if (numbers === undefined || numbers.length % 2 !== 0) {
    throw new UnreadableSvgError(`The points of <${shape.name}> are not pairs of numbers.`);
  }
  const pairs: string[] = [];
  for (let i = 0; i < numbers.length; i += 2) pairs.push(`${numbers[i]} ${numbers[i + 1]}`);
  return `M ${pairs.join(" L ")}${closed ? " Z" : ""}`;
}

/** The length `name` gives, 0 when not given. */
function lengthOr0(shape: XmlElement, name: string): number {
  return optionalLength(shape, name) ?? 0;
}

function optionalLength(shape: XmlElement, name: string): number | undefined {
  const given = shape.attributes.get(name);
  return given === undefined ? undefined : length(shape, name, given);
}

/** A length in user units: a number, or a number of `px`. */
function length(element: XmlElement, name: string, given: string): number {
  const found = number(given.trim().replace(/px$/, ""));
  if (found === undefined) {
    throw new UnreadableSvgError(
      `${name} "${given}" on <${element.name}> is not a number of user units.`,
    );
  }
  return found;
}

function opacity(element: XmlElement, property: string, value: string): number {
  const found = value.endsWith("%") ? number(value.slice(0, -1)) : number(value);
  if (found === undefined) {
    throw new UnreadableSvgError(`${property} "${value}" on <${element.name}> is not a number.`);
  }
  return value.endsWith("%") ? found / 100 : found;
}

function refused(what: string): UnreadableSvgError {
  return new UnreadableSvgError(`A logo cannot hold the SVG's ${what}.`);
}
