import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { sourceHanSansJP } from "@catena/font-source-han-sans";
import { describe, expect, test } from "vitest";
import { layoutText, textPathData, Typeface, UnreadableFontError, type FontStack } from "./index";

const require = createRequire(import.meta.url);
const inter = (weight: 400 | 700) =>
  Typeface.read(
    readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`)),
  );

const regular: FontStack = [inter(400), Typeface.read(readFileSync(sourceHanSansJP.regular))];
const bold: FontStack = [inter(700), Typeface.read(readFileSync(sourceHanSansJP.bold))];

const body = (maxWidth: number) => ({ fonts: regular, size: 10, lineHeight: 1.5, maxWidth });
const linesOf = (text: string, maxWidth: number) =>
  layoutText(text, body(maxWidth)).lines.map((line) => line.text);

describe("layoutText", () => {
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

  test("breaks Japanese between characters once the line is full", () => {
    expect(linesOf("あいうえおかきくけこ", 40)).toEqual(["あいうえ", "おかきく", "けこ"]);
  });

  test("keeps a Latin word whole and drops the space at the break", () => {
    expect(linesOf("あいう GitHub", 40)).toEqual(["あいう", "GitHub"]);
  });

  test("moves a character down so that a full stop does not start a line", () => {
    expect(linesOf("あいうえ。", 40)).toEqual(["あいう", "え。"]);
  });

  test("moves an opening bracket down so that it does not end a line", () => {
    expect(linesOf("あいう「えお", 40)).toEqual(["あいう", "「えお"]);
  });

  test("breaks a word between characters when it is wider than the line", () => {
    expect(linesOf("abcdefghij", 20)).toEqual(["abc", "def", "ghij"]);
  });

  test("breaks at a newline and keeps an empty line", () => {
    const layout = layoutText("あ\n\nい", body(40));

    expect(layout.lines.map((line) => line.text)).toEqual(["あ", "", "い"]);
    expect(layout.height).toBe(45);
  });

  test("is as wide as its widest line", () => {
    const layout = layoutText("あ\nあいう", body(40));

    expect(layout.width).toBe(30);
  });
});

const numbers = (pathData: string) => pathData.match(/-?\d+(\.\d+)?/g)!.map(Number);

describe("textPathData", () => {
  test("places the outline inside the layout's box at the given point", () => {
    const layout = layoutText("あ", body(40));

    const points = numbers(textPathData(layout, 100, 200).replaceAll(/[A-Z]/g, " "));
    const xs = points.filter((_, index) => index % 2 === 0);
    const ys = points.filter((_, index) => index % 2 === 1);

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...xs)).toBeLessThanOrEqual(110);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(200);
    expect(Math.max(...ys)).toBeLessThanOrEqual(215);
  });

  test("puts each line one line box below the one before", () => {
    const one = layoutText("あ", body(40));
    const two = layoutText("あ\nあ", body(40));

    expect(textPathData(two, 0, 0)).toBe(textPathData(one, 0, 0) + textPathData(one, 0, 15));
  });
});

describe("Typeface.read", () => {
  test("refuses bytes that are not a font", () => {
    expect(() => Typeface.read(new TextEncoder().encode("not a font"))).toThrow(
      UnreadableFontError,
    );
  });
});
