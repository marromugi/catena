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

const JAPANESE = String.raw`\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\uff00-\uffef`;
const SPACES = String.raw` \u3000`;
// Spaces, then either one Japanese character or a run of anything else up to the next space or Japanese character.
const SPACES_THEN_PIECE = new RegExp(
  `([${SPACES}]*)([${JAPANESE}]|[^${SPACES}${JAPANESE}]+)`,
  "gu",
);

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Text a line never breaks inside, and the spaces before it, which are drawn only inside a line. */
interface Unit {
  readonly spaces: string;
  readonly text: string;
}

// Joins a piece to the one before it when a break between them would put a character where it may not go.
function keepTogether(pieces: readonly Unit[]): Unit[] {
  const units: Unit[] = [];
  for (const piece of pieces) {
    const previous = units.at(-1);
    const [first] = piece.text;
    const joins =
      previous !== undefined &&
      piece.spaces === "" &&
      ((first !== undefined && NO_LINE_START.has(first)) ||
        NO_LINE_END.has(previous.text.slice(-1)));
    if (joins) {
      units[units.length - 1] = { spaces: previous.spaces, text: previous.text + piece.text };
    } else {
      units.push(piece);
    }
  }
  return units;
}

function unitsOf(paragraph: string): Unit[] {
  return keepTogether(
    Array.from(paragraph.matchAll(SPACES_THEN_PIECE), ([, spaces = "", text = ""]) => ({
      spaces,
      text,
    })),
  );
}

function splitByCharacter(unit: Unit): Unit[] {
  return keepTogether(
    Array.from(graphemes.segment(unit.text), ({ segment }, index) => ({
      spaces: index === 0 ? unit.spaces : "",
      text: segment,
    })),
  );
}

function wrapParagraph(paragraph: string, style: TextStyle): string[] {
  const fits = (text: string) => lineWidth(text, style.fonts, style.size) <= style.maxWidth;
  const units = unitsOf(paragraph).flatMap((unit) =>
    fits(unit.text) ? [unit] : splitByCharacter(unit),
  );

  const lines: string[] = [];
  let line = "";
  for (const unit of units) {
    const extended = line + unit.spaces + unit.text;
    if (line === "") {
      line = unit.text;
    } else if (fits(extended)) {
      line = extended;
    } else {
      lines.push(line);
      line = unit.text;
    }
  }
  lines.push(line);
  return lines;
}

/**
 * Breaks `text` into lines at every newline and wherever the next unit would pass `style.maxWidth`.
 * Spaces at either end of a line are dropped, and a tab counts as a space.
 * A line holding a single character is wider than `maxWidth` when that character is.
 * @throws UnreadableFontError when a typeface's data turns out to be damaged.
 */
export function layoutText(text: string, style: TextStyle): TextLayout {
  const lines = text
    .replaceAll(/\r\n?/g, "\n")
    .replaceAll("\t", " ")
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
