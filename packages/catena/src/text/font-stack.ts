import type { Rect } from "../layout";
import { boxAround, type Typeface } from "./typeface";

/**
 * Typefaces of one weight, in order of preference. Each character is drawn in the first one that has it.
 * A character none has is drawn by the last one, as its missing-glyph box.
 */
export type FontStack = readonly [Typeface, ...Typeface[]];

interface Run {
  readonly typeface: Typeface;
  readonly text: string;
}

function typefaceFor(character: string, fonts: FontStack): Typeface {
  return fonts.find((typeface) => typeface.covers(character)) ?? fonts.at(-1) ?? fonts[0];
}

function runsOf(text: string, fonts: FontStack): Run[] {
  const runs: Run[] = [];
  for (const character of text) {
    const typeface = typefaceFor(character, fonts);
    const last = runs.at(-1);
    if (last?.typeface === typeface) {
      runs[runs.length - 1] = { typeface, text: last.text + character };
    } else {
      runs.push({ typeface, text: character });
    }
  }
  return runs;
}

export function lineWidth(text: string, fonts: FontStack, size: number): number {
  return runsOf(text, fonts).reduce(
    (width, run) => width + run.typeface.advance(run.text, size),
    0,
  );
}

/**
 * The outline of `text` on one line, each character in the first of `fonts` that has it, starting at `x`
 * with its baseline at `baseline`: its SVG path data, and the smallest box holding it, `undefined` when
 * it is empty.
 */
export function lineOutline(
  text: string,
  fonts: FontStack,
  size: number,
  x: number,
  baseline: number,
): { readonly pathData: string; readonly box: Rect | undefined } {
  let pathData = "";
  let box: Rect | undefined;
  let penX = x;
  for (const run of runsOf(text, fonts)) {
    const outline = run.typeface.outline(run.text, size, penX, baseline);
    pathData += outline.pathData;
    if (outline.box !== undefined) box = boxAround(box, outline.box);
    penX += outline.advance;
  }
  return { pathData, box };
}

export function linePathData(
  text: string,
  fonts: FontStack,
  size: number,
  x: number,
  baseline: number,
): string {
  return lineOutline(text, fonts, size, x, baseline).pathData;
}
