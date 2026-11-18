import type * as v from "valibot";
import type { Rect } from "../layout";
import type { Size } from "../place";
import type { SvgElement } from "../svg";
import type { NewId } from "./svg";
import type { Theme } from "./theme";

/** A part laid out for some content: the size it takes, and how it draws itself. */
export interface Block {
  readonly size: Size;
  /** The elements drawing the part in `box`, which is at least as large as `size`. */
  draw(box: Rect, newId: NewId): readonly SvgElement[];
}

/**
 * One piece a node is built from. `schema` says what content the part shows; `layout` measures that
 * content within `maxWidth` using the theme's looks. A part that holds other parts is a part too, so a
 * whole node kind is a part.
 */
export interface Part<TSchema extends v.GenericSchema = v.GenericSchema> {
  readonly schema: TSchema;
  layout(content: v.InferOutput<TSchema>, theme: Theme, maxWidth: number): Block;
}
