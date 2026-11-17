import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { sourceHanSansJP } from "@catena/font-source-han-sans";
import { ValiError } from "valibot";
import { describe, expect, test } from "vitest";
import { layoutText, textPathData, Typeface } from "../text";
import {
  bodyText,
  buildNode,
  defineTheme,
  frame,
  stack,
  textPart,
  title,
  titleBodyCard,
} from "./index";

const require = createRequire(import.meta.url);
const inter = (weight: 400 | 700) =>
  Typeface.read(
    readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`)),
  );
const fonts = {
  regular: [inter(400), Typeface.read(readFileSync(sourceHanSansJP.regular))],
  bold: [inter(700), Typeface.read(readFileSync(sourceHanSansJP.bold))],
} as const;

// A Japanese character is as wide as its size, so 60 of them at 11 fill 25 to a line of 280.
const BODY = "あ".repeat(60);
const theme = defineTheme(fonts);

describe("the title-and-body card", () => {
  test("gives a leaf of the node width, as high as its padding, title, gap and wrapped body", () => {
    const { leaf } = buildNode(titleBodyCard, theme, "card", { title: "ここで", body: BODY });

    expect(leaf.id).toBe("card");
    expect(leaf.size.width).toBe(320);
    // 20 + 21 (one line of 14 × 1.5) + 12 + 52.8 (three lines of 11 × 1.6) + 20
    expect(leaf.size.height).toBeCloseTo(125.8, 6);
  });

  test("draws its frame filling the box, then the title and body inside the padding", () => {
    const node = buildNode(titleBodyCard, theme, "card", { title: "ここで", body: BODY });
    const box = { x: 10, y: 20, width: 320, height: 125.8 };

    const titleData = textPathData(
      layoutText("ここで", { fonts: fonts.bold, size: 14, lineHeight: 1.5, maxWidth: 280 }),
      30,
      40,
    );
    const bodyData = textPathData(
      layoutText(BODY, { fonts: fonts.regular, size: 11, lineHeight: 1.6, maxWidth: 280 }),
      30,
      73,
    );
    expect(node.draw(box)).toBe(
      `<g><rect x="10.5" y="20.5" width="319" height="124.8" rx="8" fill="#ffffff" stroke="#e6e6e6" stroke-width="1"/>` +
        `<path d="${titleData}" fill="#1f1f1f"/>` +
        `<path d="${bodyData}" fill="#8c8c8c"/></g>`,
    );
  });

  test("refuses content its schema does not take, naming the node", () => {
    // @ts-expect-error the body is left out
    expect(() => buildNode(titleBodyCard, theme, "card", { title: "ここで" })).toThrow(
      expect.objectContaining({
        name: "InvalidNodeContentError",
        message: expect.stringContaining(`"card"`),
        cause: expect.any(ValiError),
      }),
    );
  });
});

describe("the theme", () => {
  test("keeps the defaults it is not given and wraps the body at the width it is given", () => {
    const narrow = defineTheme(fonts, { nodeWidth: 140, card: { radius: 4 } });
    const node = buildNode(titleBodyCard, narrow, "card", { title: "ここで", body: BODY });

    // 9 characters to a line of 100: seven lines of 17.6.
    expect(node.leaf.size).toEqual({ width: 140, height: expect.closeTo(196.2, 6) });
    expect(node.draw({ x: 0, y: 0, ...node.leaf.size })).toMatch(
      /^<g><rect [^>]*rx="4" fill="#ffffff" stroke="#e6e6e6"/,
    );
  });

  test("writes a colour into the SVG as one attribute value, whatever it holds", () => {
    const quoted = defineTheme(fonts, { card: { fill: `"/><script/>` } });
    const node = buildNode(titleBodyCard, quoted, "card", { title: "", body: "" });

    expect(node.draw({ x: 0, y: 0, ...node.leaf.size })).toContain(
      `fill="&quot;/&gt;&lt;script/&gt;"`,
    );
  });
});

describe("a kind made from parts", () => {
  test("stacks its parts in the order of their keys and takes content under those keys", () => {
    const red = textPart((t) => ({ ...t.body, color: "red" }));
    const kind = frame(stack({ note: red, heading: title, detail: bodyText }));
    const node = buildNode(kind, theme, "k", { note: "あ", heading: "い", detail: "う" });

    // 20 + 17.6 + 12 + 21 + 12 + 17.6 + 20
    expect(node.leaf.size.height).toBeCloseTo(120.2, 6);
    const fills = [
      ...node.draw({ x: 0, y: 0, ...node.leaf.size }).matchAll(/<path [^>]*fill="([^"]*)"/g),
    ];
    expect(fills.map(([, fill]) => fill)).toEqual(["red", "#1f1f1f", "#8c8c8c"]);
  });
});
