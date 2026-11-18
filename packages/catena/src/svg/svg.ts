/** One SVG element and what it holds. Only {@link writeSvg} turns it into text. */
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
