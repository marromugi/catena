import { create, type Font, type GlyphRun } from "fontkit";

/** The bytes given to {@link Typeface.read} are not a single font this library can use. */
export class UnreadableFontError extends Error {
  override name = "UnreadableFontError";
}

/** A piece of text shaped in one typeface: how far it advances, and its outline as SVG path data. */
export interface Outline {
  readonly advance: number;
  readonly pathData: string;
}

/** One font file at one weight. Lengths it returns are in the unit of the `size` passed in. */
export class Typeface {
  readonly #font: Font;

  private constructor(font: Font) {
    this.#font = font;
  }

  /**
   * Reads a TTF, OTF, WOFF, or WOFF2 file.
   * @throws UnreadableFontError when the bytes are not a whole font, or hold a collection of several.
   */
  static read(bytes: Uint8Array): Typeface {
    let font;
    try {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- @types/fontkit asks for a Buffer; fontkit reads any Uint8Array.
      font = create(bytes as Buffer);
    } catch (cause) {
      throw new UnreadableFontError("The bytes are not a font file fontkit can read.", { cause });
    }
    if (!("layout" in font)) {
      throw new UnreadableFontError("The file is a font collection. Pass a file holding one font.");
    }
    const typeface = new Typeface(font);
    // fontkit reads a font's tables on first use, so a file cut short is only noticed by using it.
    typeface.advance(" ", 1);
    return typeface;
  }

  /** Whether the typeface has a glyph for the character. */
  covers(character: string): boolean {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && this.#font.hasGlyphForCodePoint(codePoint);
  }

  /** How far a line box of `lineBoxHeight` sits above its baseline, with the font's own height centred in it. */
  baselineOffset(size: number, lineBoxHeight: number): number {
    const scale = size / this.#font.unitsPerEm;
    const ascent = this.#font.ascent * scale;
    const descent = -this.#font.descent * scale;
    return (lineBoxHeight - (ascent + descent)) / 2 + ascent;
  }

  /** The width `text` takes on one line. */
  advance(text: string, size: number): number {
    return (this.#shape(text).advanceWidth / this.#font.unitsPerEm) * size;
  }

  /** The outline of `text` on one line, starting at `x` with its baseline at `baseline`. */
  outline(text: string, size: number, x: number, baseline: number): Outline {
    const scale = size / this.#font.unitsPerEm;
    const run = this.#shape(text);
    let pathData = "";
    let penX = x;
    run.glyphs.forEach((glyph, index) => {
      const position = run.positions[index];
      if (position === undefined) {
        throw new Error(`fontkit returned no position for glyph ${index} of "${text}".`);
      }
      pathData += glyph.path
        .scale(scale, -scale)
        .translate(penX + position.xOffset * scale, baseline - position.yOffset * scale)
        .toSVG();
      penX += position.xAdvance * scale;
    });
    return { advance: penX - x, pathData };
  }

  #shape(text: string): GlyphRun {
    try {
      return this.#font.layout(text);
    } catch (cause) {
      throw new UnreadableFontError("The font's data is damaged or cut short.", { cause });
    }
  }
}
