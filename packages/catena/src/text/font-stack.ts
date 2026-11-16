import type { Typeface } from "./typeface";

/** Typefaces of one weight, in order of preference. Each character is drawn in the first one that has it. */
export type FontStack = readonly [Typeface, ...Typeface[]];

interface Run {
  readonly typeface: Typeface;
  readonly text: string;
}

// A character no typeface has goes to the last one, which draws its missing-glyph box.
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

export function linePathData(
  text: string,
  fonts: FontStack,
  size: number,
  x: number,
  baseline: number,
): string {
  let pathData = "";
  let penX = x;
  for (const run of runsOf(text, fonts)) {
    const outline = run.typeface.outline(run.text, size, penX, baseline);
    pathData += outline.pathData;
    penX += outline.advance;
  }
  return pathData;
}
