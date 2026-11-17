import * as v from "valibot";
import type { Rect } from "../layout";
import type { Leaf } from "../place";
import type { Part } from "./part";
import { bodyText, frame, stack, title } from "./parts";
import type { Theme } from "./theme";

/** The content given for a node is not what its kind shows. */
export class InvalidNodeContentError extends Error {
  override readonly name = "InvalidNodeContentError";
}

/** A node of some kind, measured: the `Leaf` to give `placeGraph`, and how to draw it at its placed box. */
export interface Node {
  readonly leaf: Leaf;
  /** The node as SVG elements, in a `<g>`. */
  draw(box: Rect): string;
}

/** A card with a title over wrapping body text. */
export const titleBodyCard = frame(stack({ title, body: bodyText }));

/**
 * Checks `content` against `kind`'s schema and lays the node out at the theme's node width.
 * @throws InvalidNodeContentError when `content` does not match the schema, with the ValiError as its cause.
 * @throws UnreadableFontError when a typeface's data turns out to be damaged.
 */
export function buildNode<TSchema extends v.GenericSchema>(
  kind: Part<TSchema>,
  theme: Theme,
  id: string,
  content: v.InferInput<TSchema>,
): Node {
  const parsed = v.safeParse(kind.schema, content);
  if (!parsed.success) {
    throw new InvalidNodeContentError(
      `The content of node "${id}" does not match its kind: ${v.summarize(parsed.issues)}`,
      { cause: new v.ValiError(parsed.issues) },
    );
  }
  const block = kind.layout(parsed.output, theme, theme.nodeWidth);
  return {
    leaf: { id, size: block.size },
    draw: (box) => `<g>${block.draw(box)}</g>`,
  };
}
