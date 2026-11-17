const ESCAPES: Record<string, string> = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };

/** An SVG element with its attribute values escaped, so a colour given as any string stays one value. */
export function element(name: string, attributes: Record<string, string | number>): string {
  const written = Object.entries(attributes)
    .map(
      ([key, value]) => ` ${key}="${String(value).replaceAll(/[&"<>]/g, (c) => ESCAPES[c] ?? c)}"`,
    )
    .join("");
  return `<${name}${written}/>`;
}
