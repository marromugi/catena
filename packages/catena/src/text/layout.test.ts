import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { sourceHanSansJP } from "@catena/font-source-han-sans";
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  layoutText,
  lineOutline,
  textPathData,
  Typeface,
  UnreadableFontError,
  type FontStack,
} from "./index";

const require = createRequire(import.meta.url);
const inter = (weight: 400 | 700) =>
  Typeface.read(
    readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`)),
  );

const regular: FontStack = [inter(400), Typeface.read(readFileSync(sourceHanSansJP.regular))];
const bold: FontStack = [inter(700), Typeface.read(readFileSync(sourceHanSansJP.bold))];

// At size 10 a Japanese character is 10 wide.
const body = (maxWidth: number) => ({ fonts: regular, size: 10, lineHeight: 1.5, maxWidth });
const linesOf = (text: string, maxWidth: number) =>
  layoutText(text, body(maxWidth)).lines.map((line) => line.text);
const widthOf = (text: string) => layoutText(text, body(Infinity)).width;

describe("layoutText: measuring", () => {
  test("measures Latin in the first typeface and Japanese in the next", () => {
    const layout = layoutText("ここで LLM を使う", {
      fonts: bold,
      size: 16,
      lineHeight: 1.5,
      maxWidth: Infinity,
    });

    expect(layout.lines).toHaveLength(1);
    expect(layout.width).toBeCloseTo(136.58, 2);
    expect(layout.height).toBe(24);
  });

  test("applies a typeface's kerning between neighbouring letters", () => {
    expect(widthOf("A") + widthOf("V")).toBeCloseTo(13.799, 2);
    expect(widthOf("AV")).toBeCloseTo(13.115, 2);
  });

  test("sets a character no typeface has in the last one", () => {
    expect(widthOf("")).toBe(10);
  });

  test("measures a tab as a space", () => {
    expect(widthOf("a\tb")).toBeCloseTo(14.551, 2);
    expect(widthOf("a b")).toBeCloseTo(14.551, 2);
  });

  test("is as wide as its widest line", () => {
    expect(layoutText("あ\nあいう", body(40)).width).toBe(30);
  });
});

describe("layoutText: breaking lines", () => {
  test.each([
    ["hiragana", "あいうえおかきくけこ", ["あいうえ", "おかきく", "けこ"]],
    ["katakana", "アイウエオカキクケコ", ["アイウエ", "オカキク", "ケコ"]],
    ["kanji", "漢字仮名交文章", ["漢字仮名", "交文章"]],
    ["full-width letters", "ＡＢＣＤＥ", ["ＡＢＣＤ", "Ｅ"]],
  ])("breaks between %s once the line is full", (_, text, lines) => {
    expect(linesOf(text, 40)).toEqual(lines);
  });

  test("keeps a Latin word whole and drops the space at the break", () => {
    expect(linesOf("あいう GitHub", 40)).toEqual(["あいう", "GitHub"]);
  });

  test("breaks between a Latin word and Japanese without a space", () => {
    expect(linesOf("使うGitHubを使う", 40)).toEqual(["使う", "GitHub", "を使う"]);
  });

  test("drops spaces at either end of a line and keeps those inside", () => {
    expect(linesOf(" GitHub", 33)).toEqual(["GitHub"]);
    expect(linesOf("ab  cd ", 40)).toEqual(["ab  cd"]);
    expect(linesOf("   ", 40)).toEqual([""]);
  });

  test("leaves no empty line where a space falls after a full line", () => {
    expect(linesOf("あ a", 8)).toEqual(["あ", "a"]);
  });

  test("does not break at a no-break space", () => {
    expect(linesOf("aaa bbb ccc", 30)).toEqual(["aaa b", "bb", "ccc"]);
  });

  test("breaks at a newline, however it is written, and keeps an empty line", () => {
    const layout = layoutText("あ\n\nい", body(40));

    expect(layout.lines.map((line) => line.text)).toEqual(["あ", "", "い"]);
    expect(layout.height).toBe(45);
    expect(linesOf("a\r\nb\rc", 40)).toEqual(["a", "b", "c"]);
  });

  test("gives empty text one empty line", () => {
    const layout = layoutText("", body(40));

    expect(layout.lines).toEqual([{ text: "", width: 0 }]);
    expect(layout.height).toBe(15);
  });
});

describe("layoutText: any text", () => {
  const pieces = fc.constantFrom(
    " ",
    "\n",
    "a",
    "W",
    "語",
    "。",
    "（",
    ".",
    "!",
    "\t",
    "\r\n",
    "e" + String.fromCodePoint(0x301),
    // Spaces `\s` matches other than U+0020, the no-break space among them.
    ...[0xa0, 0x1680, 0x2000, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff].map(
      (code) => String.fromCodePoint(code),
    ),
  );
  const texts = fc.array(pieces, { maxLength: 30 }).map((list) => list.join(""));

  test("sets the same lines with no width to keep to as with a width nothing reaches", () => {
    fc.assert(
      fc.property(texts, (text) => {
        expect(linesOf(text, Infinity)).toEqual(linesOf(text, 1e9));
      }),
      { numRuns: 300 },
    );
  });
});

describe("layoutText: characters that may not start or end a line", () => {
  test.each(
    Array.from(
      "、。，．・：；？！ー）」』】〕｝〉》’”ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ)]}!?,.:;",
    ),
  )("moves a character down so that %s does not start a line", (mark) => {
    expect(linesOf(`あいう${mark}`, 30)).toEqual(["あい", `う${mark}`]);
  });

  test.each(Array.from("（「『【〔｛〈《‘“([{"))(
    "moves %s down so that it does not end a line",
    (mark) => {
      expect(linesOf(`あいう${mark}え`, 40)).toEqual(["あいう", `${mark}え`]);
    },
  );

  test("judges a word by its first character", () => {
    expect(linesOf("あいう.cd", 40)).toEqual(["あい", "う.cd"]);
  });

  test("judges what came before by its last character", () => {
    expect(linesOf("あいう（「え", 50)).toEqual(["あいう", "（「え"]);
  });

  test("may break at a space before such a character", () => {
    expect(linesOf("aaaaaa !", 35)).toEqual(["aaaaaa", "!"]);
  });
});

describe("layoutText: text wider than the line", () => {
  test("breaks a word between characters", () => {
    expect(linesOf("abcdefghij", 20)).toEqual(["abc", "def", "ghij"]);
  });

  test("does not break up text that exactly fits", () => {
    expect(linesOf("あい。う", 20)).toEqual(["あ", "い。", "う"]);
  });

  test("still keeps a full stop off the start of a line", () => {
    expect(linesOf("GitHub、", 40)).toEqual(["GitHu", "b、"]);
  });

  test("keeps a letter and its combining accent together", () => {
    expect(linesOf("éé", 1)).toEqual(["é", "é"]);
  });

  test("gives a character wider than the line a line of its own", () => {
    expect(linesOf("あい", 5)).toEqual(["あ", "い"]);
  });
});

const coordinates = (pathData: string) => {
  const numbers = pathData
    .replaceAll(/[A-Z]/g, " ")
    .match(/-?\d+(\.\d+)?/g)!
    .map(Number);
  return {
    xs: numbers.filter((_, index) => index % 2 === 0),
    ys: numbers.filter((_, index) => index % 2 === 1),
  };
};

describe("textPathData", () => {
  test("stands a letter on the baseline of a line box placed at the given point", () => {
    const { xs, ys } = coordinates(textPathData(layoutText("L", body(40)), 100, 200));

    expect(Math.min(...xs)).toBeCloseTo(100.88, 2);
    expect(Math.min(...ys)).toBeCloseTo(203.86, 2);
    expect(Math.max(...ys)).toBeCloseTo(211.14, 2);
  });

  test("puts each line one line box below the one before", () => {
    const one = layoutText("あ", body(40));
    const two = layoutText("あ\nあ", body(40));

    expect(textPathData(two, 0, 0)).toBe(textPathData(one, 0, 0) + textPathData(one, 0, 15));
  });

  test("puts each character after the one before", () => {
    const one = layoutText("あ", body(40));
    const two = layoutText("ああ", body(40));

    expect(textPathData(two, 0, 0)).toBe(textPathData(one, 0, 0) + textPathData(one, 10, 0));
  });

  test("puts text in the next typeface after the text before it", () => {
    const latin = layoutText("a", body(40));
    const japanese = layoutText("あ", body(40));
    const both = layoutText("aあ", body(40));

    expect(textPathData(both, 0, 0)).toBe(
      textPathData(latin, 0, 0) + textPathData(japanese, latin.width, 0),
    );
  });
});

describe("Typeface.read", () => {
  test("refuses bytes that are not a font", () => {
    expect(() => Typeface.read(new TextEncoder().encode("not a font"))).toThrow(
      UnreadableFontError,
    );
  });

  test.each([1000, 2_000_000])("refuses a font file cut short at %i bytes", (length) => {
    const cutShort = readFileSync(sourceHanSansJP.regular).subarray(0, length);

    expect(() => Typeface.read(cutShort)).toThrow(UnreadableFontError);
  });
});

describe("lineOutline", () => {
  test("is the outlines of each run in its typeface, and the smallest box holding them all", () => {
    const [latin, japanese] = bold;
    if (japanese === undefined) throw new Error("The bold stack holds a Japanese typeface.");
    const a = latin.outline("A", 10, 5, 20);
    const kana = japanese.outline("あ", 10, 5 + a.advance, 20);
    if (a.box === undefined || kana.box === undefined) throw new Error("Both have an outline.");
    const line = lineOutline("Aあ", bold, 10, 5, 20);

    expect(line.pathData).toBe(a.pathData + kana.pathData);
    const left = Math.min(a.box.x, kana.box.x);
    const top = Math.min(a.box.y, kana.box.y);
    const right = Math.max(a.box.x + a.box.width, kana.box.x + kana.box.width);
    const bottom = Math.max(a.box.y + a.box.height, kana.box.y + kana.box.height);
    expect(line.box).toEqual({ x: left, y: top, width: right - left, height: bottom - top });
    // A capital stands on the baseline and あ dips below it, so the box is neither run's alone.
    expect(a.box.y + a.box.height).toBeCloseTo(20, 9);
    expect(bottom).toBeGreaterThan(20);
  });

  test("keeps the box of a run with an outline beside a run in another typeface with none", () => {
    // Inter's Latin file has no ideographic space, so it runs in the Japanese typeface, with no outline.
    expect(lineOutline("A\u3000", bold, 10, 5, 20).box).toEqual(
      lineOutline("A", bold, 10, 5, 20).box,
    );
  });

  test("has no box for a line with no outline", () => {
    expect(lineOutline(" ", bold, 10, 0, 0)).toEqual({ pathData: "", box: undefined });
  });
});
