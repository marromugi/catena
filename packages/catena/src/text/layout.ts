import { linePathData, lineWidth, type FontStack } from "./font-stack";

/** How a block of text is set. `maxWidth` may be `Infinity` to break only at newlines. */
export interface TextStyle {
  readonly fonts: FontStack;
  readonly size: number;
  /** Line box height as a multiple of `size`. */
  readonly lineHeight: number;
  readonly maxWidth: number;
}

export interface TextLine {
  readonly text: string;
  readonly width: number;
}

/** Text broken into lines, with the size of the box that holds them. */
export interface TextLayout {
  readonly style: TextStyle;
  readonly lines: readonly TextLine[];
  readonly width: number;
  readonly height: number;
}

const NO_LINE_START = new Set(
  "、。，．・：；？！ー）」』】〕｝〉》’”ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ)]}!?,.:;",
);
const NO_LINE_END = new Set("（「『【〔｛〈《‘“([{");

// Japanese text may break between any two characters; anything else breaks only at spaces.
const BREAK_UNIT =
  /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}＀-￯]|[^\S\n]+|[^\s\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}＀-￯]+/gu;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function breakUnits(paragraph: string): string[] {
  const units: string[] = [];
  for (const [part] of paragraph.matchAll(BREAK_UNIT)) {
    const previous = units.at(-1);
    const [first] = part;
    const mustFollowPrevious =
      previous !== undefined &&
      ((first !== undefined && NO_LINE_START.has(first)) || NO_LINE_END.has(previous.slice(-1)));
    if (mustFollowPrevious) {
      units[units.length - 1] = previous + part;
    } else {
      units.push(part);
    }
  }
  return units;
}

function wrapParagraph(paragraph: string, style: TextStyle): string[] {
  const width = (text: string) => lineWidth(text, style.fonts, style.size);
  // A unit wider than the line by itself is broken between characters.
  const units = breakUnits(paragraph).flatMap((unit) =>
    width(unit.trim()) > style.maxWidth
      ? Array.from(graphemes.segment(unit), (grapheme) => grapheme.segment)
      : [unit],
  );

  const lines: string[] = [];
  let line = "";
  for (const unit of units) {
    if (line !== "" && width((line + unit).trimEnd()) > style.maxWidth) {
      lines.push(line.trimEnd());
      line = unit;
    } else {
      line += unit;
    }
  }
  lines.push(line.trimEnd());
  return lines;
}

/** Breaks `text` into lines no wider than `style.maxWidth`, and at every newline. */
export function layoutText(text: string, style: TextStyle): TextLayout {
  const lines = text
    .split("\n")
    .flatMap((paragraph) => wrapParagraph(paragraph, style))
    .map((line) => ({ text: line, width: lineWidth(line, style.fonts, style.size) }));
  return {
    style,
    lines,
    width: Math.max(...lines.map((line) => line.width)),
    height: lines.length * style.size * style.lineHeight,
  };
}

/** The outlines of every line as SVG path data, with the layout's box placed at (`x`, `y`). */
export function textPathData(layout: TextLayout, x: number, y: number): string {
  const { fonts, size, lineHeight } = layout.style;
  const lineBoxHeight = size * lineHeight;
  const baselineOffset = fonts[0].baselineOffset(size, lineBoxHeight);
  return layout.lines
    .map((line, index) =>
      linePathData(line.text, fonts, size, x, y + index * lineBoxHeight + baselineOffset),
    )
    .join("");
}
