import type * as v from "valibot";
import type { Rect } from "../layout";
import type { LineUp, Size } from "../place";
import type { SvgElement } from "../svg";
import type { NewId } from "./svg";
import type { Theme } from "./theme";

export interface Block {
  readonly size: Size;
  /** Measured at its own size. Left out, the block lines up by its middle, and edges meet its sides. */
  readonly lineUp?: LineUp;
  /** `box` is at least as large as `size`. */
  draw(box: Rect, newId: NewId): readonly SvgElement[];
}

/** A part that holds other parts is a part too, so a whole node kind is a part. */
export interface Part<TSchema extends v.GenericSchema = v.GenericSchema> {
  readonly schema: TSchema;
  layout(content: v.InferOutput<TSchema>, theme: Theme, maxWidth: number): Block;
}
