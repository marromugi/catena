import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { sourceHanSansJP } from "@catena/font-source-han-sans";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { iconPathData } from "../icon";
import { layoutText, textPathData, Typeface } from "../text";
import {
  activeRoundButton,
  atWidth,
  badge,
  bodyText,
  buildNode,
  centered,
  defineTheme,
  divider,
  element,
  fitted,
  frame,
  icon,
  iconTile,
  iconTitleBodyCard,
  iconTitleCard,
  iconTitleCardPair,
  image,
  imageTitleBodyCard,
  itemCard,
  list,
  optional,
  panel,
  pill,
  redBadge,
  roundButton,
  row,
  section,
  selectedIconTile,
  stack,
  statusDot,
  statusTitleCard,
  subtitle,
  textPart,
  title,
  titleBadgeCard,
  titleBodyBadgeCard,
  titleBodyCard,
  titleBodyItemsSectionCard,
  NO_SHADOW,
  type Part,
  type ThemeOverrides,
  writeSvg,
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

/**
 * The looks these tests measure and draw with, fixed here so that they check how parts lay out and draw
 * rather than the default looks, which `picture.test.ts` checks against the picture on #20.
 */
const TESTED_LOOKS: ThemeOverrides = {
  card: { radius: 8, stroke: "#e6e6e6", shadow: NO_SHADOW },
  selectedCard: {
    radius: 8,
    fill: "#fdeee2",
    stroke: "#eda866",
    strokeWidth: 1,
    shadow: NO_SHADOW,
  },
  itemCard: { padding: 12, radius: 8, stroke: "#ebebeb", strokeWidth: 1, shadow: NO_SHADOW },
  panel: { radius: 10, stroke: "#ebebeb", strokeWidth: 1, shadow: NO_SHADOW },
  pairPanel: {
    padding: 12,
    radius: 10,
    fill: "#ffffff",
    stroke: "#ebebeb",
    strokeWidth: 1,
    shadow: NO_SHADOW,
  },
  badges: {
    plain: { size: 10, lineHeight: 1.4, paddingX: 16, stroke: "#e6e6e6" },
    red: {
      size: 10,
      lineHeight: 1.4,
      paddingX: 16,
      color: "#e5484d",
      fill: "#fde4e4",
      stroke: "#fbd0d0",
    },
  },
  dot: { diameter: 16, colors: { red: "#e5484d" } },
  icon: { size: 20, strokeWidth: 1.5, colors: { spark: "#d97757" } },
  iconTextGap: 12,
  tileIcon: { strokeWidth: 2, colors: { spark: "#d97757" } },
  button: { padding: 8, stroke: "#e6e6e6", strokeWidth: 1 },
  buttonIcon: { size: 14, strokeWidth: 1.5, colors: { spark: "#d97757" } },
  activeButton: { padding: 8, fill: "#edf1fe", stroke: "#3e63dd", strokeWidth: 2 },
  activeButtonIcon: { size: 14, strokeWidth: 1.5, fill: "none", color: "#3e63dd" },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `over` laid over `under` key by key, `levels` deep; below that, `over`'s value replaces `under`'s. */
function laidOver(under: unknown, over: unknown, levels: number): unknown {
  if (levels === 0 || !isRecord(under) || !isRecord(over)) return over ?? under;
  const keys = new Set([...Object.keys(under), ...Object.keys(over)]);
  return Object.fromEntries(
    [...keys].map((key) => [key, laidOver(under[key], over[key], levels - 1)]),
  );
}

/**
 * A theme with the tested looks and `overrides` laid over them, as `defineTheme` lays overrides over
 * its defaults: each look field by field, and a badge's tones and a dot's colours one by one.
 */
function themeWith(overrides: ThemeOverrides = {}) {
  const under: Record<string, unknown> = { ...TESTED_LOOKS };
  const over: Record<string, unknown> = { ...overrides };
  const looks = Object.fromEntries(
    Object.keys({ ...under, ...over }).map((key) => [
      key,
      laidOver(under[key], over[key], key === "badges" || key === "dot" ? 2 : 1),
    ]),
  );
  return defineTheme(fonts, looks);
}

const theme = themeWith();

const textOutline = (
  content: string,
  look: { weight: "regular" | "bold"; size: number; lineHeight: number },
  maxWidth: number,
  x: number,
  y: number,
) =>
  textPathData(
    layoutText(content, {
      fonts: fonts[look.weight],
      size: look.size,
      lineHeight: look.lineHeight,
      maxWidth,
    }),
    x,
    y,
  );

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
        message: expect.stringMatching(/"card"[^]*"body"/),
        cause: expect.any(v.ValiError),
      }),
    );
  });
});

describe("the theme", () => {
  test("keeps the defaults it is not given and wraps the body at the width it is given", () => {
    const narrow = themeWith({ nodeWidth: 140, card: { radius: 4 } });
    const node = buildNode(titleBodyCard, narrow, "card", { title: "ここで", body: BODY });

    // 9 characters to a line of 100: seven lines of 17.6.
    expect(node.leaf.size).toEqual({ width: 140, height: expect.closeTo(196.2, 6) });
    expect(node.draw({ x: 0, y: 0, ...node.leaf.size })).toMatch(
      /^<g><rect [^>]*rx="4" fill="#ffffff" stroke="#e6e6e6"/,
    );
  });

  test("lays the looks it is given over the defaults, keeping a default given as undefined", () => {
    const changed = themeWith({
      gap: 0,
      title: { weight: "regular", size: 20, color: "navy" },
      body: { lineHeight: 2, color: undefined },
    });
    const node = buildNode(titleBodyCard, changed, "card", { title: "ここで", body: BODY });

    // 20 + 30 (one line of 20 × 1.5) + 0 + 66 (three lines of 11 × 2) + 20
    expect(node.leaf.size.height).toBeCloseTo(136, 6);
    const titleData = textPathData(
      layoutText("ここで", { fonts: fonts.regular, size: 20, lineHeight: 1.5, maxWidth: 280 }),
      20,
      20,
    );
    const drawn = node.draw({ x: 0, y: 0, ...node.leaf.size });
    expect(drawn).toContain(`<path d="${titleData}" fill="navy"/>`);
    expect(drawn).toMatch(/fill="#8c8c8c"\/><\/g>$/);
  });

  test("writes a colour into the SVG as one attribute value, whatever it holds", () => {
    const quoted = themeWith({ card: { fill: `"/><script/>&` } });
    const node = buildNode(titleBodyCard, quoted, "card", { title: "", body: "" });

    expect(node.draw({ x: 0, y: 0, ...node.leaf.size })).toContain(
      `fill="&quot;/&gt;&lt;script/&gt;&amp;"`,
    );
  });
});

// A part that shows nothing, of a fixed size, drawing the box it is given.
const fixed = (width: number, height: number): Part<v.NullSchema<undefined>> => ({
  schema: v.null(),
  layout: () => ({ size: { width, height }, draw: (box) => [element("rect", { ...box })] }),
});

// The id source handed to a part that refers to no other element.
const noId = () => {
  throw new Error("This part takes no id.");
};

describe("writeSvg", () => {
  test("writes an element's attributes and then its children inside it", () => {
    expect(writeSvg(element("g", { id: "a" }, [element("rect", { x: 1 })]))).toBe(
      `<g id="a"><rect x="1"/></g>`,
    );
  });
});

describe("frame and stack", () => {
  test("hand their parts the box they are drawn in, less the padding and stacked the gap apart", () => {
    const kind = frame(stack({ a: fixed(50, 10), b: fixed(80, 20) }));
    const node = buildNode(kind, theme, "k", { a: null, b: null });

    expect(node.leaf.size).toEqual({ width: 320, height: 82 });
    expect(node.draw({ x: 0, y: 0, width: 400, height: 200 })).toBe(
      `<g><rect x="0.5" y="0.5" width="399" height="199" rx="8" fill="#ffffff" stroke="#e6e6e6" stroke-width="1"/>` +
        `<rect x="20" y="20" width="360" height="10"/><rect x="20" y="42" width="360" height="20"/></g>`,
    );
    expect(
      buildNode(frame(fixed(50, 10)), theme, "f", null).draw({
        x: 0,
        y: 0,
        width: 400,
        height: 200,
      }),
    ).toContain(`<rect x="20" y="20" width="360" height="160"/>`);
  });

  test("a stack is as wide as its widest part, and an empty one takes no room", () => {
    expect(
      stack({ a: fixed(50, 10), b: fixed(80, 20) }).layout({ a: null, b: null }, theme, 100).size,
    ).toEqual({
      width: 80,
      height: 42,
    });
    expect(stack({}).layout({}, theme, 100).size).toEqual({ width: 0, height: 0 });
  });

  test.each(["0", "1", "10", "__proto__"])(
    "a stack and a row refuse the key %s, whose place in the order is lost",
    (key) => {
      expect(() => stack({ a: title, [key]: bodyText })).toThrow(
        `A stack's part may not be keyed "${key}".`,
      );
      expect(() => row({ a: title, [key]: bodyText })).toThrow(
        `A row's part may not be keyed "${key}".`,
      );
    },
  );

  test("a stack takes keys that only hold digits among letters", () => {
    expect(Object.keys(stack({ a1: title, "1a": bodyText }).schema.entries)).toEqual(["a1", "1a"]);
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

const badgeText = (text: string, maxWidth = Infinity) =>
  layoutText(text, { fonts: fonts.bold, size: 10, lineHeight: 1.4, maxWidth });

describe("badges and the status dot", () => {
  test("a badge is a pill as wide as its text and padding, drawn at the top-left of its box", () => {
    const text = badgeText("Badge");
    const block = badge.layout("Badge", theme, 300);

    // 14 (one line of 10 × 1.4) + 2 × 3
    expect(block.size).toEqual({ width: text.width + 32, height: 20 });
    expect(block.draw({ x: 10, y: 20, width: 300, height: 100 }, noId).map(writeSvg)).toEqual([
      `<rect x="10.5" y="20.5" width="${text.width + 31}" height="19" rx="10" fill="#ffffff" stroke="#e6e6e6" stroke-width="1"/>`,
      `<path d="${textPathData(text, 26, 23)}" fill="#1f1f1f"/>`,
    ]);
  });

  test("the red badge differs from the plain one only in its colours", () => {
    const drawn = redBadge
      .layout("Badge", theme, 300)
      .draw({ x: 10, y: 20, width: 300, height: 100 }, noId)
      .map(writeSvg);

    expect(drawn[0]).toMatch(/ rx="10" fill="#fde4e4" stroke="#fbd0d0" /);
    expect(drawn[1]).toMatch(/fill="#e5484d"\/>$/);
  });

  test("a badge wraps its text inside its padding when the width it is given runs out", () => {
    const block = badge.layout("あ".repeat(10), theme, 82);

    // 5 characters of 10 to a line of 50: two lines.
    expect(block.size).toEqual({ width: 82, height: 34 });
  });

  test("a status dot is coloured by its tone and refuses a tone the theme does not colour", () => {
    const red = buildNode(frame(statusDot), theme, "d", "red");
    expect(red.leaf.size).toEqual({ width: 320, height: 56 });
    expect(red.draw({ x: 0, y: 0, ...red.leaf.size })).toContain(
      `<circle cx="28" cy="28" r="8" fill="#e5484d"/>`,
    );
    const plain = buildNode(frame(statusDot), theme, "d", "plain");
    expect(plain.draw({ x: 0, y: 0, ...plain.leaf.size })).toContain(`fill="#8c8c8c"`);
    // @ts-expect-error no such tone
    expect(() => buildNode(frame(statusDot), theme, "d", "blue")).toThrow(
      expect.objectContaining({ name: "InvalidNodeContentError" }),
    );
  });

  test("the theme changes a badge's and a dot's looks, keeping the defaults it is not given", () => {
    const changed = themeWith({
      badges: { red: { paddingX: 4, paddingY: 0, fill: "pink" } },
      dot: { diameter: 6, colors: { red: "crimson" } },
    });
    const text = badgeText("Badge");
    const laidBadge = redBadge.layout("Badge", changed, 300);

    expect(laidBadge.size).toEqual({ width: text.width + 8, height: 14 });
    expect(
      writeSvg(laidBadge.draw({ x: 0, y: 0, ...laidBadge.size }, noId)[0] ?? element("none")),
    ).toMatch(/ rx="7" fill="pink" stroke="#fbd0d0" /);
    expect(badge.layout("Badge", changed, 300).size.height).toBe(20);
    const dot = statusDot.layout("red", changed, 300);
    expect(dot.size).toEqual({ width: 6, height: 6 });
    expect(writeSvg(dot.draw({ x: 0, y: 0, ...dot.size }, noId)[0] ?? element("none"))).toBe(
      `<circle cx="3" cy="3" r="3" fill="crimson"/>`,
    );
  });
});

describe("row", () => {
  const box = { x: 0, y: 0, width: 300, height: 40 };

  test("sets its parts side by side, the gap apart, centred in its height", () => {
    const block = row({ a: fixed(50, 10), b: fixed(80, 20) }).layout(
      { a: null, b: null },
      theme,
      300,
    );

    expect(block.size).toEqual({ width: 142, height: 20 });
    expect(block.draw(box, noId).map(writeSvg)).toEqual([
      `<rect x="0" y="15" width="50" height="10"/>`,
      `<rect x="62" y="10" width="80" height="20"/>`,
    ]);
  });

  test("gives its growing part the width the others leave, so the parts after it sit at its end", () => {
    const kind = row({ a: fixed(50, 10), b: fixed(30, 10), c: fixed(20, 10) }, { grow: "b" });
    const block = kind.layout({ a: null, b: null, c: null }, theme, 200);

    expect(block.size).toEqual({ width: 200, height: 10 });
    expect(block.draw({ ...box, height: 10 }, noId).map(writeSvg)).toEqual([
      `<rect x="0" y="0" width="50" height="10"/>`,
      `<rect x="62" y="0" width="206" height="10"/>`,
      `<rect x="280" y="0" width="20" height="10"/>`,
    ]);
  });

  test("lays its growing part out at the width the others leave", () => {
    const kind = row({ text: bodyText, end: fixed(100, 10) }, { grow: "text" });
    const block = kind.layout({ text: "あ".repeat(20), end: null }, theme, 200);

    // 8 characters of 11 to a line of 88: three lines of 17.6.
    expect(block.size.height).toBeCloseTo(52.8, 6);
  });
});

describe("optional", () => {
  test("an absent part takes no room, and a stack or row leaves no gap for it", () => {
    const parts = { a: fixed(50, 10), b: optional(fixed(80, 20)), c: fixed(30, 10) };
    const absent = { a: null, c: null };

    expect(stack(parts).layout(absent, theme, 300).size).toEqual({ width: 50, height: 32 });
    expect(stack(parts).layout({ ...absent, b: null }, theme, 300).size).toEqual({
      width: 80,
      height: 64,
    });
    const shown = row(parts).layout(absent, theme, 300);
    expect(shown.size).toEqual({ width: 92, height: 10 });
    expect(shown.draw({ x: 0, y: 0, width: 300, height: 10 }, noId).map(writeSvg)).toEqual([
      `<rect x="0" y="0" width="50" height="10"/>`,
      `<rect x="62" y="0" width="30" height="10"/>`,
    ]);
  });

  test("a row whose growing part is absent sets the others together at its start", () => {
    const kind = row({ a: optional(fixed(50, 10)), b: fixed(30, 10) }, { grow: "a" });

    expect(kind.layout({ b: null }, theme, 300).size).toEqual({ width: 30, height: 10 });
  });
});

describe("the kinds made with badges and status dots", () => {
  test("the title with a badge sets the badge at the card's end, centred on the title", () => {
    const node = buildNode(titleBadgeCard, theme, "n", { title: "ここで", badge: "Badge" });
    const width = badgeText("Badge").width + 32;

    // 20 + 21 (one line of 14 × 1.5, taller than the badge's 20) + 20
    expect(node.leaf.size).toEqual({ width: 320, height: 61 });
    const titleData = textPathData(
      layoutText("ここで", {
        fonts: fonts.bold,
        size: 14,
        lineHeight: 1.5,
        maxWidth: 280 - width - 12,
      }),
      20,
      20,
    );
    const drawn = node.draw({ x: 0, y: 0, ...node.leaf.size });
    expect(drawn).toContain(`<path d="${titleData}" fill="#1f1f1f"/>`);
    expect(drawn).toContain(
      `<rect x="${300 - width + 0.5}" y="21" width="${width - 1}" height="19" rx="10" fill="#fde4e4"`,
    );
  });

  test("the title with a badge is the title alone on a node without one", () => {
    const node = buildNode(titleBadgeCard, theme, "n", { title: "ここで" });

    expect(node.leaf.size).toEqual({ width: 320, height: 61 });
    expect(node.draw({ x: 0, y: 0, ...node.leaf.size })).not.toContain(`rx="10"`);
  });

  test("the title-and-body card with a badge sets the badge under the body, the gap below it", () => {
    const content = { title: "ここで", body: BODY };
    const node = buildNode(titleBodyBadgeCard, theme, "n", { ...content, badge: "Badge" });

    // the title-and-body card's 125.8, and 12 + 20
    expect(node.leaf.size.height).toBeCloseTo(157.8, 6);
    expect(node.draw({ x: 0, y: 0, ...node.leaf.size })).toMatch(
      /<rect x="20.5" y="118.3\d*" [^>]* rx="10" fill="#fde4e4"/,
    );
    expect(buildNode(titleBodyBadgeCard, theme, "n", content).leaf.size).toEqual(
      buildNode(titleBodyCard, theme, "n", content).leaf.size,
    );
  });

  test("the status dot before a title sets the title the gap after the dot, the dot centred on it", () => {
    const node = buildNode(statusTitleCard, theme, "n", { status: "red", title: "ここで" });

    expect(node.leaf.size).toEqual({ width: 320, height: 61 });
    const titleData = textPathData(
      layoutText("ここで", { fonts: fonts.bold, size: 14, lineHeight: 1.5, maxWidth: 252 }),
      48,
      20,
    );
    const drawn = node.draw({ x: 0, y: 0, ...node.leaf.size });
    expect(drawn).toContain(`<circle cx="28" cy="30.5" r="8" fill="#e5484d"/>`);
    expect(drawn).toContain(`<path d="${titleData}" fill="#1f1f1f"/>`);
    const without = buildNode(statusTitleCard, theme, "n", { title: "ここで" });
    expect(without.draw({ x: 0, y: 0, ...without.leaf.size })).not.toContain("<circle");
  });
});

describe("what review found", () => {
  test("a row gives the parts but its growing one at most half its width, so the title keeps the rest", () => {
    const content = { title: "ここで LLM を使う", badge: "あ".repeat(40) };
    const node = buildNode(titleBadgeCard, theme, "n", content);

    // The badge is laid out within 140: 10 characters of 10 to a line of 108, four lines.
    expect(badgeText(content.badge, 108).width).toBe(100);
    expect(node.leaf.size).toEqual({ width: 320, height: 102 });
    const titleData = textPathData(
      layoutText(content.title, { fonts: fonts.bold, size: 14, lineHeight: 1.5, maxWidth: 136 }),
      20,
      20 + (62 - 21) / 2,
    );
    const drawn = node.draw({ x: 0, y: 0, ...node.leaf.size });
    expect(drawn).toContain(`<path d="${titleData}" fill="#1f1f1f"/>`);
    expect(drawn).toContain(`<rect x="168.5" y="20.5" width="131" height="61" rx="31"`);
  });

  test("a row gives no part a negative width, and sets parts wider than it after one another", () => {
    const kind = row({ a: fixed(200, 10), g: fixed(30, 10), b: fixed(200, 10) }, { grow: "g" });
    const block = kind.layout({ a: null, g: null, b: null }, theme, 300);

    expect(block.size).toEqual({ width: 454, height: 10 });
    expect(block.draw({ x: 0, y: 0, width: 300, height: 10 }, noId).map(writeSvg)).toEqual([
      `<rect x="0" y="0" width="200" height="10"/>`,
      `<rect x="212" y="0" width="30" height="10"/>`,
      `<rect x="254" y="0" width="200" height="10"/>`,
    ]);
  });

  test("a row whose part beside the title is absent gives the title the whole width", () => {
    // 20 characters of 14 fill a line of 280.
    const full = "あ".repeat(20);

    expect(buildNode(statusTitleCard, theme, "n", { title: full }).leaf.size).toEqual({
      width: 320,
      height: 61,
    });
    expect(buildNode(titleBadgeCard, theme, "n", { title: full }).leaf.size).toEqual({
      width: 320,
      height: 61,
    });
  });

  test("a row with no growing part gives its parts the whole width", () => {
    // 18 characters of 11 fill one line of 200.
    const { size } = row({ a: bodyText }).layout({ a: "あ".repeat(18) }, theme, 200);
    expect(size.height).toBeCloseTo(17.6, 6);
  });

  test("a row's parts beside the growing one share half its width, each after the ones before and their gaps", () => {
    const kind = row({ a: fixed(40, 10), b: bodyText, g: fixed(10, 10) }, { grow: "g" });

    // `b` is laid out within 150 - 40 - 12 = 98: 8 characters of 11 to a line, three lines.
    const { size } = kind.layout({ a: null, b: "あ".repeat(20), g: null }, theme, 300);
    expect(size.height).toBeCloseTo(52.8, 6);
  });

  test("a row gives a part no less than 0 when the parts before it took more than their share", () => {
    const widths: number[] = [];
    const recording: Part<v.NullSchema<undefined>> = {
      schema: v.null(),
      layout: (_content, _theme, maxWidth) => {
        widths.push(maxWidth);
        return { size: { width: 10, height: 10 }, draw: () => [] };
      },
    };

    row({ a: fixed(200, 10), b: recording, g: fixed(10, 10) }, { grow: "g" }).layout(
      { a: null, b: null, g: null },
      theme,
      300,
    );
    row({ a: fixed(200, 10), b: fixed(200, 10), g: recording }, { grow: "g" }).layout(
      { a: null, b: null, g: null },
      theme,
      300,
    );
    expect(widths).toEqual([0, 0]);
  });

  test("a frame holds a row grown past its width", () => {
    const narrow = themeWith({ nodeWidth: 60 });
    const node = buildNode(statusTitleCard, narrow, "n", { status: "red", title: "ここで" });

    // The title is laid out at 0, one character of 14 a line: 16 + 12 + 14 inside 2 × 20 of padding.
    expect(node.leaf.size).toEqual({ width: 82, height: 103 });
    expect(node.draw({ x: 0, y: 0, ...node.leaf.size })).toMatch(/^<g><rect [^>]*width="81"/);
  });

  test("a row lays its growing part out once, after the others", () => {
    const kind = row({ end: bodyText, g: fixed(10, 10) }, { grow: "g" });

    // `end` is laid out within 100: 9 characters of 11 to a line, two lines of 17.6.
    const { size } = kind.layout({ end: "あ".repeat(18), g: null }, theme, 200);
    expect(size.height).toBeCloseTo(35.2, 6);
  });

  test("a part with only one side 0, or empty text, still takes its place and its gap", () => {
    const tall = stack({ a: fixed(10, 0), b: fixed(10, 10) });
    expect(tall.layout({ a: null, b: null }, theme, 100).size).toEqual({ width: 10, height: 22 });
    const wide = row({ a: fixed(0, 10), b: fixed(10, 10) });
    expect(wide.layout({ a: null, b: null }, theme, 100).size).toEqual({ width: 22, height: 10 });
    // 17.6 (one empty line of 11 × 1.6) + 12 + 10
    const text = stack({ a: bodyText, b: fixed(10, 10) });
    expect(text.layout({ a: "", b: null }, theme, 100).size.height).toBeCloseTo(39.6, 6);
  });

  test("a row whose parts are all absent takes no room, so a stack around it sets no gap", () => {
    const absent = row({ a: optional(fixed(10, 10)), b: optional(fixed(20, 20)) }, { grow: "a" });

    expect(absent.layout({}, theme, 100).size).toEqual({ width: 0, height: 0 });
    const around = stack({ r: absent, c: fixed(10, 10) });
    expect(around.layout({ r: {}, c: null }, theme, 100).size).toEqual({ width: 10, height: 10 });
  });

  test("an absent optional part draws nothing, alone or in a frame", () => {
    const alone = buildNode(optional(fixed(10, 10)), theme, "o", undefined);
    expect(alone.draw({ x: 0, y: 0, width: 10, height: 10 })).toBe("<g/>");
    const framed = buildNode(frame(optional(fixed(10, 10))), theme, "f", undefined);
    expect(framed.leaf.size).toEqual({ width: 320, height: 40 });
    expect(framed.draw({ x: 0, y: 0, ...framed.leaf.size })).toBe(
      `<g><rect x="0.5" y="0.5" width="319" height="39" rx="8" fill="#ffffff" stroke="#e6e6e6" stroke-width="1"/></g>`,
    );
  });

  test("the theme changes the plain badge's and the plain dot's looks", () => {
    const changed = themeWith({
      badges: { plain: { fill: "ivory", color: "navy" } },
      dot: { colors: { plain: "gray" } },
    });
    const laidBadge = badge.layout("Badge", changed, 300);
    const drawn = laidBadge.draw({ x: 0, y: 0, ...laidBadge.size }, noId).map(writeSvg);

    expect(drawn[0]).toMatch(/ fill="ivory" stroke="#e6e6e6" /);
    expect(drawn[1]).toMatch(/fill="navy"\/>$/);
    const dot = statusDot.layout("plain", changed, 300);
    expect(dot.draw({ x: 0, y: 0, ...dot.size }, noId).map(writeSvg)).toEqual([
      `<circle cx="8" cy="8" r="8" fill="gray"/>`,
    ]);
  });

  test("a stack or a row refuses content under a key that is not one of its parts", () => {
    const refusal = expect.objectContaining({
      name: "InvalidNodeContentError",
      message: expect.stringContaining(`"bdage"`),
    });

    expect(() =>
      // @ts-expect-error the badge's key is misspelt
      buildNode(titleBadgeCard, theme, "n", { title: "ここで", bdage: "x" }),
    ).toThrow(refusal);
    expect(() =>
      // @ts-expect-error the badge's key is misspelt
      buildNode(titleBodyBadgeCard, theme, "n", { title: "ここで", body: "", bdage: "x" }),
    ).toThrow(refusal);
  });
});

const ids = (svg: string) => [...svg.matchAll(/ id="([^"]*)"/g)].map(([, id]) => id);
const clipRefs = (svg: string) =>
  [...svg.matchAll(/clip-path="url\(#([^)]*)\)"/g)].map(([, id]) => id);

describe("the image and the card with an image", () => {
  const SUNSET = "https://example.com/sunset.jpg";

  test("the card gives a leaf as high as its padding, the image at its aspect ratio, title and body", () => {
    const { leaf } = buildNode(imageTitleBodyCard, theme, "card", {
      image: SUNSET,
      title: "ここで",
      body: BODY,
    });

    // 20 + 280 / 1.5 + 12 + 21 + 12 + 52.8 + 20
    expect(leaf.size.width).toBe(320);
    expect(leaf.size.height).toBeCloseTo(137.8 + 280 / 1.5, 6);
  });

  test("draws the image filling the width inside the padding, clipped to round corners, over the title", () => {
    const node = buildNode(imageTitleBodyCard, theme, "card", {
      image: SUNSET,
      title: "ここで",
      body: BODY,
    });
    const height = 280 / 1.5;

    const area = `x="30" y="40" width="280" height="${height}"`;
    const titleData = textPathData(
      layoutText("ここで", { fonts: fonts.bold, size: 14, lineHeight: 1.5, maxWidth: 280 }),
      30,
      40 + height + 12,
    );
    expect(node.draw({ x: 10, y: 20, ...node.leaf.size })).toContain(
      `<clipPath id="catena-card-1"><rect ${area} rx="6"/></clipPath>` +
        `<image ${area} href="${SUNSET}" preserveAspectRatio="xMidYMid slice" clip-path="url(#catena-card-1)"/>` +
        `<path d="${titleData}" fill="#1f1f1f"/>`,
    );
  });

  test("takes its aspect ratio and corners from the theme, and writes the href as given, escaped", () => {
    const square = themeWith({ image: { aspectRatio: 1, radius: 0 } });
    const block = image.layout(`a.png?b=1&c="2"`, square, 100);

    expect(block.size).toEqual({ width: 100, height: 100 });
    expect(block.draw({ x: 0, y: 0, width: 100, height: 100 }, () => "i").map(writeSvg)).toEqual([
      `<clipPath id="i"><rect x="0" y="0" width="100" height="100" rx="0"/></clipPath>`,
      `<image x="0" y="0" width="100" height="100" href="a.png?b=1&amp;c=&quot;2&quot;" preserveAspectRatio="xMidYMid slice" clip-path="url(#i)"/>`,
    ]);
  });

  test("takes no room when it is given no width", () => {
    expect(image.layout(SUNSET, theme, -10).size).toEqual({ width: 0, height: 0 });
  });

  test("refuses an image that is not an href", () => {
    expect(() =>
      // @ts-expect-error the image is not a string
      buildNode(imageTitleBodyCard, theme, "card", { image: 1, title: "", body: "" }),
    ).toThrow(expect.objectContaining({ name: "InvalidNodeContentError" }));
  });

  test("frame, stack and row hand each part in a node an id of its own", () => {
    const kind = frame(stack({ top: image, side: row({ left: image }) }));
    const node = buildNode(kind, theme, "n", { top: SUNSET, side: { left: SUNSET } });
    const drawn = node.draw({ x: 0, y: 0, ...node.leaf.size });

    expect(ids(drawn)).toEqual(["catena-n-1", "catena-n-2"]);
    expect(clipRefs(drawn)).toEqual(["catena-n-1", "catena-n-2"]);
  });

  const firstId = (nodeId: string) => {
    const node = buildNode(imageTitleBodyCard, theme, nodeId, {
      image: SUNSET,
      title: "",
      body: "",
    });
    return ids(node.draw({ x: 0, y: 0, ...node.leaf.size }))[0];
  };

  test("writes the node id into its element ids, each character but a letter or digit as its code point", () => {
    expect(firstId("aZ9")).toBe("catena-aZ9-1");
    expect(firstId(`ノード "1"`)).toBe("catena-_30ce__30fc__30c9__20__22_1_22_-1");
    expect(firstId(" b")).toBe("catena-_20_b-1");
    expect(firstId("ȋ")).toBe("catena-_20b_-1");
    expect(firstId("😀")).toBe("catena-_1f600_-1");
  });

  test("gives nodes with different ids different element ids, each a valid SVG id", () => {
    const nodeIds = ["a b", "a-b", "ab", "a_b", "a_20_b", "a-1", "a", " b", "ȋ", "😀", "😁"];
    const drawnIds = nodeIds.map(firstId);

    expect(new Set(drawnIds).size).toBe(nodeIds.length);
    for (const id of drawnIds) expect(id).toMatch(/^[A-Za-z][\w-]*$/);
  });

  test("gives the same ids each time a node is drawn", () => {
    const node = buildNode(imageTitleBodyCard, theme, "card", {
      image: SUNSET,
      title: "",
      body: "",
    });
    const box = { x: 0, y: 0, ...node.leaf.size };

    expect(node.draw(box)).toBe(node.draw(box));
  });

  test("draws at its own size at the top-left of a larger box", () => {
    const square = themeWith({ image: { aspectRatio: 1, radius: 0 } });
    const block = image.layout(SUNSET, square, 100);
    const drawn = block.draw({ x: 10, y: 20, width: 300, height: 300 }, () => "i").map(writeSvg);

    expect(drawn[0]).toBe(
      `<clipPath id="i"><rect x="10" y="20" width="100" height="100" rx="0"/></clipPath>`,
    );
    expect(drawn[1]).toMatch(/^<image x="10" y="20" width="100" height="100" /);
  });
});

describe("lists, the divider and sections", () => {
  test("a list sets as many items as it is given one under the next, the gap apart, each as wide as the box", () => {
    const block = list(fixed(50, 10)).layout([null, null, null], theme, 100);

    expect(block.size).toEqual({ width: 50, height: 54 });
    expect(block.draw({ x: 5, y: 7, width: 100, height: 54 }, noId).map(writeSvg)).toEqual([
      `<rect x="5" y="7" width="100" height="10"/>`,
      `<rect x="5" y="29" width="100" height="10"/>`,
      `<rect x="5" y="51" width="100" height="10"/>`,
    ]);
  });

  test("a list with no items takes no room, and a stack sets no gap for it", () => {
    expect(list(title).layout([], theme, 100).size).toEqual({ width: 0, height: 0 });
    const kind = stack({ a: fixed(10, 10), items: list(title), b: fixed(10, 10) });
    expect(kind.layout({ a: null, items: [], b: null }, theme, 100).size.height).toBe(32);
  });

  test("a list's content is an array of its item's content", () => {
    // @ts-expect-error a string, not an array of them
    expect(() => buildNode(frame(list(title)), theme, "l", "ここで")).toThrow(
      expect.objectContaining({ name: "InvalidNodeContentError" }),
    );
    // @ts-expect-error an item that is not a string
    expect(() => buildNode(frame(list(title)), theme, "l", ["ここで", 1])).toThrow(
      expect.objectContaining({ name: "InvalidNodeContentError" }),
    );
  });

  test("a divider is a dashed line across the box, and takes no content", () => {
    const block = divider.layout(undefined, theme, 200);

    expect(block.size).toEqual({ width: 200, height: 1 });
    expect(block.draw({ x: 10, y: 20, width: 300, height: 1 }, noId).map(writeSvg)).toEqual([
      `<line x1="10" y1="20.5" x2="310" y2="20.5" stroke="#e0e0e0" stroke-width="1" stroke-dasharray="3 3"/>`,
    ]);
    const kind = frame(stack({ a: title, line: divider }));
    expect(() => buildNode(kind, theme, "d", { a: "ここで" })).not.toThrow();
    // @ts-expect-error the divider shows nothing
    expect(() => buildNode(kind, theme, "d", { a: "ここで", line: "x" })).toThrow(
      expect.objectContaining({ name: "InvalidNodeContentError" }),
    );
  });

  test("a divider with no dash is a solid line", () => {
    const solid = themeWith({ divider: { dash: [], color: "red", width: 2 } });

    expect(
      divider.layout(undefined, solid, 100).draw({ x: 0, y: 0, width: 100, height: 2 }, noId),
    ).toEqual([
      element("line", { x1: 0, y1: 1, x2: 100, y2: 1, stroke: "red", "stroke-width": 2 }),
    ]);
  });

  test("a section is a heading over its items, a gap apart, and a panel frames what it holds", () => {
    const kind = section(panel(list(fixed(50, 10))));
    const block = kind.layout({ heading: "ここで", items: [null] }, theme, 200);

    // 18 (one line of 12 × 1.5) + 12 + 12 + 10 + 12
    expect(block.size).toEqual({ width: 200, height: 64 });
    const headingData = textPathData(
      layoutText("ここで", { fonts: fonts.bold, size: 12, lineHeight: 1.5, maxWidth: 200 }),
      0,
      0,
    );
    expect(block.draw({ x: 0, y: 0, width: 200, height: 64 }, noId).map(writeSvg)).toEqual([
      `<path d="${headingData}" fill="#1f1f1f"/>`,
      `<rect x="0.5" y="30.5" width="199" height="33" rx="10" fill="#ffffff" stroke="#ebebeb" stroke-width="1"/>`,
      `<rect x="12" y="42" width="176" height="10"/>`,
    ]);
  });

  test("the card with items and a section is as high as its padding and all it stacks", () => {
    const { leaf } = buildNode(titleBodyItemsSectionCard, theme, "card", {
      title: "ここで",
      body: BODY,
      items: ["い", "う"],
      section: { heading: "セクション名", items: ["え", "お"] },
    });

    // 20 + 21 + 12 + 52.8 + 12 + (42 + 12 + 42) + 12 + 1 + 12 + (18 + 12 + (12 + 96 + 12)) + 20,
    // an item card being 12 + 18 + 12.
    expect(leaf.size.width).toBe(320);
    expect(leaf.size.height).toBeCloseTo(408.8, 6);
  });

  test("the card draws its item cards, the divider, the heading and the panel holding its own item cards", () => {
    // Lines of 22, so every position is a whole number.
    const even = themeWith({ body: { lineHeight: 2 } });
    const node = buildNode(titleBodyItemsSectionCard, even, "card", {
      title: "ここで",
      body: BODY,
      items: ["い", "う"],
      section: { heading: "セクション名", items: ["え", "お"] },
    });
    expect(node.leaf.size).toEqual({ width: 320, height: 422 });

    const sub = { weight: "bold", size: 12, lineHeight: 1.5 } as const;
    const item = (y: number, x: number, width: number, content: string) =>
      `<rect x="${x + 0.5}" y="${y + 0.5}" width="${width - 1}" height="41" rx="8" fill="#ffffff" stroke="#ebebeb" stroke-width="1"/>` +
      `<path d="${textOutline(content, sub, width - 24, x + 12, y + 12)}" fill="#1f1f1f"/>`;

    expect(node.draw({ x: 10, y: 20, width: 320, height: 422 })).toBe(
      `<g><rect x="10.5" y="20.5" width="319" height="421" rx="8" fill="#ffffff" stroke="#e6e6e6" stroke-width="1"/>` +
        `<path d="${textOutline("ここで", { weight: "bold", size: 14, lineHeight: 1.5 }, 280, 30, 40)}" fill="#1f1f1f"/>` +
        `<path d="${textOutline(BODY, { weight: "regular", size: 11, lineHeight: 2 }, 280, 30, 73)}" fill="#8c8c8c"/>` +
        item(151, 30, 280, "い") +
        item(205, 30, 280, "う") +
        `<line x1="30" y1="259.5" x2="310" y2="259.5" stroke="#e0e0e0" stroke-width="1" stroke-dasharray="3 3"/>` +
        `<path d="${textOutline("セクション名", sub, 280, 30, 272)}" fill="#1f1f1f"/>` +
        `<rect x="30.5" y="302.5" width="279" height="119" rx="10" fill="#ffffff" stroke="#ebebeb" stroke-width="1"/>` +
        item(314, 42, 256, "え") +
        item(368, 42, 256, "お") +
        `</g>`,
    );
  });

  test("the theme's item card, panel, subtitle and divider looks reach every part drawn with them", () => {
    const changed = themeWith({
      itemCard: { stroke: "teal", padding: 4 },
      panel: { fill: "ivory", radius: undefined },
      subtitle: { color: "navy" },
      divider: { color: "plum" },
    });
    const node = buildNode(titleBodyItemsSectionCard, changed, "card", {
      title: "ここで",
      body: BODY,
      items: ["い"],
      section: { heading: "セクション名", items: ["え"] },
    });
    const drawn = node.draw({ x: 0, y: 0, ...node.leaf.size });

    expect(drawn.match(/stroke="teal"/g)).toHaveLength(2);
    expect(drawn.match(/fill="navy"/g)).toHaveLength(3);
    expect(drawn).toMatch(/rx="10" fill="ivory" stroke="#ebebeb"/);
    expect(drawn).toContain(`stroke="plum"`);
    // 20 + 21 + 12 + 52.8 + 12 + (4 + 18 + 4) + 12 + 1 + 12 + (18 + 12 + (12 + 26 + 12)) + 20
    expect(node.leaf.size.height).toBeCloseTo(268.8, 6);
    expect(itemCard.layout("い", changed, 100).size).toEqual({ width: 100, height: 26 });
    expect(subtitle.layout("い", changed, 100).size.height).toBe(18);
  });

  test("a section with no items keeps its heading and draws no panel", () => {
    expect(panel(list(title)).layout([], theme, 200).size).toEqual({ width: 0, height: 0 });
    const node = buildNode(titleBodyItemsSectionCard, theme, "card", {
      title: "ここで",
      body: BODY,
      items: ["い", "う"],
      section: { heading: "セクション名", items: [] },
    });

    // 408.8 less the panel (12 + 96 + 12) and the gap above it.
    expect(node.leaf.size.height).toBeCloseTo(276.8, 6);
    const drawn = node.draw({ x: 0, y: 0, ...node.leaf.size });
    expect(drawn).not.toContain(`rx="10"`);
    const headingData = textPathData(
      layoutText("セクション名", { fonts: fonts.bold, size: 12, lineHeight: 1.5, maxWidth: 280 }),
      20,
      20 + 21 + 12 + 52.8 + 12 + 96 + 12 + 1 + 12,
    );
    expect(drawn).toMatch(new RegExp(`<path d="${headingData}" fill="#1f1f1f"/></g>$`));
  });

  test("a list holds more items than a call can take arguments", () => {
    const items = Array.from({ length: 200_000 }, () => null);

    expect(list(fixed(2, 1)).layout(items, theme, 100).size).toEqual({
      width: 2,
      height: 200_000 + 199_999 * 12,
    });
  });

  test("a list lays each item out at the list's width", () => {
    // 21 characters of 12 fill the 252 inside an item card's padding at 276, and wrap at 275.
    const text = "あ".repeat(21);

    expect(list(itemCard).layout([text], theme, 276).size.height).toBe(42);
    expect(list(itemCard).layout([text], theme, 275).size.height).toBe(60);
  });

  test("a list's content is required where a stack holds it", () => {
    const kind = frame(stack({ items: list(title) }));
    // @ts-expect-error the list's key is left out
    expect(() => buildNode(kind, theme, "l", {})).toThrow(
      expect.objectContaining({ name: "InvalidNodeContentError" }),
    );
  });

  test("a divider is as high as the theme's line, and takes no negative width", () => {
    const thick = themeWith({ divider: { width: 3 } });

    expect(divider.layout(undefined, thick, 100).size).toEqual({ width: 100, height: 3 });
    expect(divider.layout(undefined, theme, -10).size).toEqual({ width: 0, height: 1 });
  });
});

// An icon's path data on a grid `grid` wide, drawn at (x, y) `size` across, in `color` with lines `strokeWidth` wide as drawn.
const iconSvg = (
  pathData: string,
  grid: number,
  x: number,
  y: number,
  size: number,
  color: string,
  strokeWidth: number,
) =>
  `<path d="${pathData}" transform="translate(${x} ${y}) scale(${size / grid})" fill="none" ` +
  `stroke-width="${strokeWidth / (size / grid)}" stroke-linecap="round" stroke-linejoin="round" stroke="${color}"/>`;

// One line of caption text drawn at (x, y).
const captionLine = (text: string, x: number, y: number) =>
  textPathData(
    layoutText(text, { fonts: fonts.regular, size: 14, lineHeight: 1.5, maxWidth: 320 }),
    x,
    y,
  );

describe("icons and the kinds that carry one", () => {
  test("a built-in icon is drawn by name, scaled from its grid to the look's size, in its colour", () => {
    const block = icon.layout("spark", theme, 100);

    expect(block.size).toEqual({ width: 20, height: 20 });
    expect(block.draw({ x: 10, y: 20, width: 100, height: 100 }, noId).map(writeSvg)).toEqual([
      `<path d="${iconPathData.spark}" transform="translate(10 20) scale(0.8333333333333334)" fill="none" ` +
        `stroke-width="1.7999999999999998" stroke-linecap="round" stroke-linejoin="round" stroke="#d97757"/>`,
    ]);
  });

  test("a built-in icon with no colour of its own is drawn in the look's colour", () => {
    const block = icon.layout("plus", theme, 100);

    expect(block.draw({ x: 0, y: 0, width: 20, height: 20 }, noId).map(writeSvg)).toEqual([
      iconSvg(iconPathData.plus, 24, 0, 0, 20, "#1f1f1f", 1.5),
    ]);
  });

  test("a user's own stroked icon is its path data in its view box, stroked in the look's colour", () => {
    const node = buildNode(iconTitleCard, theme, "c", {
      icon: {
        pathData: "M 4 4 L 44 44",
        viewBox: { x: 0, y: 0, width: 48, height: 48 },
        paint: "stroke",
      },
      title: "ここで",
    });

    expect(node.draw({ x: 10, y: 20, width: 320, height: 61 })).toContain(
      `<path d="M 4 4 L 44 44" transform="translate(30 40.5) scale(0.4166666666666667)" fill="none" ` +
        `stroke-width="3.5999999999999996" stroke-linecap="round" stroke-linejoin="round" stroke="#1f1f1f"/>`,
    );
  });

  test("a user's own filled icon on a view box away from the origin is filled in the look's colour, inside its box", () => {
    // Material Symbols' icons are filled, on the view box 0 -960 960 960.
    const add = "M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z";
    const node = buildNode(iconTitleCard, theme, "c", {
      icon: { pathData: add, viewBox: { x: 0, y: -960, width: 960, height: 960 }, paint: "fill" },
      title: "ここで",
    });

    // The icon's box is (30, 40.5), 20 across; the view box's top, y -960, lands on 40.5 and y 0 on 60.5.
    expect(node.draw({ x: 10, y: 20, width: 320, height: 61 })).toContain(
      `<path d="${add}" transform="translate(30 60.5) scale(0.020833333333333332)" fill="#1f1f1f"/>`,
    );
  });

  test("a user's own icon on a view box that is not square is scaled to fit and centred in the icon's square", () => {
    const own = {
      pathData: "M 0 0 L 48 24",
      viewBox: { x: 0, y: 0, width: 48, height: 24 },
      paint: "fill",
    } as const;

    expect(
      icon.layout(own, theme, 100).draw({ x: 0, y: 0, width: 20, height: 20 }, noId).map(writeSvg),
    ).toEqual([
      `<path d="M 0 0 L 48 24" transform="translate(0 5) scale(0.4166666666666667)" fill="#1f1f1f"/>`,
    ]);
  });

  test("a user's own icon on a view box taller than wide, away from the origin, is centred across the icon's square", () => {
    const own = {
      pathData: "M 10 0 L 34 48",
      viewBox: { x: 10, y: 0, width: 24, height: 48 },
      paint: "fill",
    } as const;

    // Scaled by 20 / 48, the 24 across is 10 wide, set 5 in: x 10 lands on 5 + 5 = 10, x 34 on 20.
    expect(
      icon.layout(own, theme, 100).draw({ x: 5, y: 7, width: 20, height: 20 }, noId).map(writeSvg),
    ).toEqual([
      `<path d="M 10 0 L 34 48" transform="translate(5.833333333333333 7) scale(0.4166666666666667)" fill="#1f1f1f"/>`,
    ]);
  });

  test("an icon is a built-in name or a user's own icon with a view box and a paint, and nothing else", () => {
    const kind = frame(icon);
    const box = { x: 0, y: 0, width: 24, height: 24 };
    const notIcons: unknown[] = [
      "sparks",
      { pathData: "M 0 0", grid: 24 },
      { pathData: "M 0 0", viewBox: box },
      { pathData: "M 0 0", viewBox: box, paint: "both" },
      { pathData: "M 0 0", viewBox: { ...box, width: 0 }, paint: "fill" },
      { pathData: "M 0 0", viewBox: { ...box, height: Number.POSITIVE_INFINITY }, paint: "fill" },
      { pathData: "M 0 0", viewBox: { ...box, height: 0 }, paint: "fill" },
      { pathData: "M 0 0", viewBox: { ...box, height: -24 }, paint: "fill" },
      { pathData: "M 0 0", viewBox: { ...box, x: Number.NaN }, paint: "fill" },
      { pathData: "M 0 0", viewBox: { ...box, x: Number.POSITIVE_INFINITY }, paint: "fill" },
      { pathData: "M 0 0", viewBox: { ...box, y: Number.NEGATIVE_INFINITY }, paint: "fill" },
      { pathData: "M 0 0", viewBox: { ...box, unit: "px" }, paint: "fill" },
      { pathData: 1, viewBox: box, paint: "fill" },
      { pathData: "M 0 0", viewBox: box, paint: "fill", color: "red" },
    ];
    for (const content of notIcons) {
      // @ts-expect-error not an icon
      expect(() => buildNode(kind, theme, "i", content)).toThrow(
        expect.objectContaining({ name: "InvalidNodeContentError" }),
      );
    }
  });

  test("the icon-and-title card sets the icon centred on the title's line, the title a gap after it", () => {
    const node = buildNode(iconTitleCard, theme, "c", { icon: "spark", title: "ここで" });
    expect(node.leaf.size).toEqual({ width: 320, height: 61 });

    const titleData = textPathData(
      layoutText("ここで", { fonts: fonts.bold, size: 14, lineHeight: 1.5, maxWidth: 248 }),
      62,
      40,
    );
    expect(node.draw({ x: 10, y: 20, width: 320, height: 61 })).toBe(
      `<g><rect x="10.5" y="20.5" width="319" height="60" rx="8" fill="#ffffff" stroke="#e6e6e6" stroke-width="1"/>` +
        iconSvg(iconPathData.spark, 24, 30, 40.5, 20, "#d97757", 1.5) +
        `<path d="${titleData}" fill="#1f1f1f"/></g>`,
    );
  });

  test("the icon, title and body card sets the icon at the title's top, and the body under the title", () => {
    // 25 characters of 11 fit a line of 280, and wrap to two in the 248 left beside the icon.
    const body = "あ".repeat(25);
    const node = buildNode(iconTitleBodyCard, theme, "c", {
      icon: "spark",
      text: { title: "ここで", body },
    });
    expect(node.leaf.size.width).toBe(320);
    // 20 + 21 + 12 + 35.2 + 20
    expect(node.leaf.size.height).toBeCloseTo(108.2, 6);

    const bodyData = textPathData(
      layoutText(body, { fonts: fonts.regular, size: 11, lineHeight: 1.6, maxWidth: 248 }),
      62,
      73,
    );
    const svg = node.draw({ x: 10, y: 20, ...node.leaf.size });
    expect(svg).toContain(iconSvg(iconPathData.spark, 24, 30, 40, 20, "#d97757", 1.5));
    expect(svg).toContain(`<path d="${bodyData}" fill="#8c8c8c"/>`);
  });

  test("the panel of two icon-and-title cards sets them side by side, each as wide as a node", () => {
    const node = buildNode(iconTitleCardPair, theme, "p", {
      first: { icon: "spark", title: "ここで" },
      second: { icon: "plus", title: "ここで" },
    });
    // 12 + 320 + 12 + 320 + 12 across, 12 + 61 + 12 down
    expect(node.leaf.size).toEqual({ width: 676, height: 85 });

    const svg = node.draw({ x: 0, y: 0, width: 676, height: 85 });
    expect([...svg.matchAll(/<rect [^>]*>/g)].map(([rect]) => rect)).toEqual([
      `<rect x="0.5" y="0.5" width="675" height="84" rx="10" fill="#ffffff" stroke="#ebebeb" stroke-width="1"/>`,
      `<rect x="12.5" y="12.5" width="319" height="60" rx="8" fill="#ffffff" stroke="#e6e6e6" stroke-width="1"/>`,
      `<rect x="344.5" y="12.5" width="319" height="60" rx="8" fill="#ffffff" stroke="#e6e6e6" stroke-width="1"/>`,
    ]);
    expect(svg).toContain(iconSvg(iconPathData.plus, 24, 364, 32.5, 20, "#1f1f1f", 1.5));
  });

  test("the panel of two icon-and-title cards draws both cards as high as the higher one", () => {
    const node = buildNode(iconTitleCardPair, theme, "p", {
      first: { icon: "spark", title: "ここで LLM を使う".repeat(4) },
      second: { icon: "spark", title: "ここで" },
    });

    const svg = node.draw({ x: 0, y: 0, ...node.leaf.size });
    const heights = [...svg.matchAll(/<rect [^>]* height="([^"]*)"/g)].map(([, height]) => height);
    // The panel, 12 + the first card + 12, and the two cards.
    expect(heights).toEqual([String(node.leaf.size.height - 1), "81", "81"]);
  });

  test("the icon tile is a square card around its icon, with the caption and sub-caption centred under it", () => {
    // Eight characters of 14 make a caption 112 wide, wider than the 72 of the tile.
    const caption = "あ".repeat(8);
    const node = buildNode(iconTile, theme, "t", {
      icon: "service",
      label: { caption, subcaption: "あい" },
    });
    expect(node.leaf.size.width).toBe(112);
    // 72 + 12 + 21 + 2 + 17.6
    expect(node.leaf.size.height).toBeCloseTo(124.6, 6);

    const captionData = textPathData(
      layoutText(caption, { fonts: fonts.regular, size: 14, lineHeight: 1.5, maxWidth: 320 }),
      10,
      104,
    );
    const subcaptionData = textPathData(
      layoutText("あい", { fonts: fonts.regular, size: 11, lineHeight: 1.6, maxWidth: 320 }),
      55,
      127,
    );
    expect(node.draw({ x: 10, y: 20, ...node.leaf.size })).toBe(
      `<g><rect x="30.5" y="20.5" width="71" height="71" rx="8" fill="#ffffff" stroke="#e6e6e6" stroke-width="1"/>` +
        iconSvg(iconPathData.service, 24, 50, 40, 32, "#1f1f1f", 2) +
        `<path d="${captionData}" fill="#1f1f1f"/>` +
        `<path d="${subcaptionData}" fill="#8c8c8c"/></g>`,
    );
  });

  test("an icon tile centres each line of a caption that wraps", () => {
    // 23 characters of 14 wrap at the node width of 320: 22 on the first line, 308 wide, and one on the second.
    const node = buildNode(iconTile, theme, "t", {
      icon: "spark",
      label: { caption: "あ".repeat(23) },
    });
    expect(node.leaf.size.width).toBe(308);

    expect(node.draw({ x: 10, y: 20, ...node.leaf.size })).toContain(
      `<path d="${captionLine("あ".repeat(22), 10, 104)}${captionLine("あ", 157, 125)}" fill="#1f1f1f"/>`,
    );
  });

  test("an icon tile centres a caption narrower than its sub-caption", () => {
    const node = buildNode(iconTile, theme, "t", {
      icon: "spark",
      label: { caption: "あ", subcaption: "あ".repeat(10) },
    });
    // The sub-caption is 110 wide; the caption's 14 sit 48 in.
    expect(node.leaf.size.width).toBe(110);

    expect(node.draw({ x: 10, y: 20, ...node.leaf.size })).toContain(
      `<path d="${captionLine("あ", 58, 104)}" fill="#1f1f1f"/>`,
    );
  });

  test("an icon tile without a sub-caption, or without a label, leaves no room for it", () => {
    expect(
      buildNode(iconTile, theme, "t", { icon: "spark", label: { caption: "あ" } }).leaf.size,
    ).toEqual({ width: 72, height: 105 });
    expect(buildNode(iconTile, theme, "t", { icon: "spark" }).leaf.size).toEqual({
      width: 72,
      height: 72,
    });
    expect(buildNode(iconTile, theme, "t", { icon: "spark", label: {} }).leaf.size).toEqual({
      width: 72,
      height: 72,
    });
  });

  test("the selected icon tile is the icon tile in the selected card's look", () => {
    const node = buildNode(selectedIconTile, theme, "t", { icon: "spark" });

    expect(node.leaf.size).toEqual({ width: 72, height: 72 });
    expect(node.draw({ x: 0, y: 0, width: 72, height: 72 })).toBe(
      `<g><rect x="0.5" y="0.5" width="71" height="71" rx="8" fill="#fdeee2" stroke="#eda866" stroke-width="1"/>` +
        iconSvg(iconPathData.spark, 24, 20, 20, 32, "#d97757", 2) +
        `</g>`,
    );
  });

  test("the round buttons are a circle around a small icon, the active one in blue", () => {
    const plus = buildNode(roundButton, theme, "b", "plus");
    expect(plus.leaf.size).toEqual({ width: 30, height: 30 });
    expect(plus.draw({ x: 0, y: 0, width: 30, height: 30 })).toBe(
      `<g><rect x="0.5" y="0.5" width="29" height="29" rx="15" fill="#ffffff" stroke="#e6e6e6" stroke-width="1"/>` +
        iconSvg(iconPathData.plus, 24, 8, 8, 14, "#1f1f1f", 1.5) +
        `</g>`,
    );

    const info = buildNode(activeRoundButton, theme, "b", "info");
    expect(info.leaf.size).toEqual({ width: 30, height: 30 });
    expect(info.draw({ x: 0, y: 0, width: 30, height: 30 })).toBe(
      `<g><rect x="1" y="1" width="28" height="28" rx="15" fill="#edf1fe" stroke="#3e63dd" stroke-width="2"/>` +
        iconSvg(iconPathData.info, 24, 8, 8, 14, "#3e63dd", 1.5) +
        `</g>`,
    );
  });

  test("the spark keeps its colour on the plain round button, and is blue on the active one", () => {
    expect(
      buildNode(roundButton, theme, "b", "spark").draw({ x: 0, y: 0, width: 30, height: 30 }),
    ).toContain(iconSvg(iconPathData.spark, 24, 8, 8, 14, "#d97757", 1.5));
    expect(
      buildNode(activeRoundButton, theme, "b", "spark").draw({ x: 0, y: 0, width: 30, height: 30 }),
    ).toContain(iconSvg(iconPathData.spark, 24, 8, 8, 14, "#3e63dd", 1.5));
  });

  test("a round button stays round when its looks change its size", () => {
    const larger = themeWith({ buttonIcon: { size: 24 }, activeButton: { padding: 4 } });

    const plus = buildNode(roundButton, larger, "b", "plus");
    expect(plus.leaf.size).toEqual({ width: 40, height: 40 });
    expect(plus.draw({ x: 0, y: 0, width: 40, height: 40 })).toContain(`rx="20"`);
    const info = buildNode(activeRoundButton, larger, "b", "info");
    expect(info.leaf.size).toEqual({ width: 22, height: 22 });
    expect(info.draw({ x: 0, y: 0, width: 22, height: 22 })).toContain(`rx="11"`);
  });

  test("a fitted card draws at its own size at the top-left of a larger box", () => {
    const block = fitted(fixed(10, 6), (t) => t.card).layout(null, theme, 300);

    expect(block.size).toEqual({ width: 50, height: 46 });
    expect(block.draw({ x: 5, y: 7, width: 300, height: 300 }, noId).map(writeSvg)).toEqual([
      `<rect x="5.5" y="7.5" width="49" height="45" rx="8" fill="#ffffff" stroke="#e6e6e6" stroke-width="1"/>`,
      `<rect x="25" y="27" width="10" height="6"/>`,
    ]);
  });

  test("a fitted card lays its child out inside its padding", () => {
    // 40 characters of 11 in the 60 left inside 20 of padding at 100: five to a line, eight lines.
    const block = fitted(bodyText, (t) => t.card).layout("あ".repeat(40), theme, 100);

    expect(block.size.width).toBe(95);
    expect(block.size.height).toBeCloseTo(40 + 8 * 17.6, 6);
  });

  test("a pill lays its child out inside its padding", () => {
    // 40 characters of 11 in the 84 left inside 8 of padding at 100: seven to a line, six lines.
    const block = pill(bodyText, (t) => t.button).layout("あ".repeat(40), theme, 100);

    expect(block.size.width).toBe(93);
    expect(block.size.height).toBeCloseTo(16 + 6 * 17.6, 6);
  });

  test("a pill is half its height round, and draws at its own size at the top-left of a larger box", () => {
    const block = pill(fixed(40, 10), (t) => t.button).layout(null, theme, 300);

    expect(block.size).toEqual({ width: 56, height: 26 });
    expect(block.draw({ x: 5, y: 7, width: 300, height: 300 }, noId).map(writeSvg)).toEqual([
      `<rect x="5.5" y="7.5" width="55" height="25" rx="13" fill="#ffffff" stroke="#e6e6e6" stroke-width="1"/>`,
      `<rect x="13" y="15" width="40" height="10"/>`,
    ]);
  });

  test("a centred part draws at its own size across the middle of its box", () => {
    const block = centered(fixed(10, 6)).layout(null, theme, 300);

    expect(block.size).toEqual({ width: 10, height: 6 });
    expect(block.draw({ x: 5, y: 7, width: 100, height: 50 }, noId).map(writeSvg)).toEqual([
      `<rect x="50" y="7" width="10" height="6"/>`,
    ]);
  });

  test("a part at a width is laid out at that width, whatever width it is given", () => {
    // 20 characters of 11 fit one line of 220.
    const block = atWidth(bodyText, () => 220).layout("あ".repeat(20), theme, 50);

    expect(block.size.width).toBe(220);
    expect(block.size.height).toBeCloseTo(17.6, 6);
  });

  test("a stack sets its parts the gap it is given apart", () => {
    const kind = stack({ a: fixed(10, 10), b: fixed(10, 10) }, { gap: () => 3 });

    expect(kind.layout({ a: null, b: null }, theme, 100).size.height).toBe(23);
  });

  test("a row aligned at the start sets each part at its top", () => {
    const block = row({ a: fixed(10, 4), b: fixed(10, 20) }, { align: "start" }).layout(
      { a: null, b: null },
      theme,
      100,
    );

    expect(block.draw({ x: 0, y: 5, width: 100, height: 20 }, noId).map(writeSvg)).toEqual([
      `<rect x="0" y="5" width="10" height="4"/>`,
      `<rect x="22" y="5" width="10" height="20"/>`,
    ]);
  });

  test("overrides of the icon, tile, caption and button looks reach what is drawn with them", () => {
    const custom = themeWith({
      icon: { size: 24, colors: {} },
      tileIcon: { size: 40 },
      selectedCard: { fill: "orange" },
      caption: { size: 20 },
      captionGap: 10,
      button: { padding: 4 },
      buttonIcon: { color: "green" },
      activeButton: { stroke: "navy" },
      activeButtonIcon: { strokeWidth: 3 },
    });

    const spark = icon.layout("spark", custom, 100);
    expect(spark.size.width).toBe(24);
    expect(spark.draw({ x: 0, y: 0, width: 24, height: 24 }, noId).map(writeSvg)[0]).toContain(
      `stroke="#1f1f1f"`,
    );
    const tile = buildNode(iconTile, custom, "t", {
      icon: "spark",
      label: { caption: "あ", subcaption: "あ" },
    });
    // 80 + 12 + 30 + 10 + 17.6
    expect(tile.leaf.size.height).toBeCloseTo(149.6, 6);
    expect(
      buildNode(selectedIconTile, custom, "t", { icon: "spark" }).draw({
        x: 0,
        y: 0,
        width: 80,
        height: 80,
      }),
    ).toContain(`fill="orange"`);
    const plus = buildNode(roundButton, custom, "b", "plus");
    expect(plus.leaf.size).toEqual({ width: 22, height: 22 });
    expect(plus.draw({ x: 0, y: 0, width: 22, height: 22 })).toContain(`stroke="green"`);
    const info = buildNode(activeRoundButton, custom, "b", "info").draw({
      x: 0,
      y: 0,
      width: 30,
      height: 30,
    });
    expect(info).toContain(`stroke="navy"`);
    expect(info).toContain(`stroke-width="${3 / (14 / 24)}"`);
  });

  test("an icon look given as undefined keeps its default", () => {
    const custom = defineTheme(fonts, { icon: { size: undefined }, captionGap: undefined });

    expect(custom.icon.size).toBe(22);
    expect(custom.captionGap).toBe(2);
  });
});

describe("shadows, filled icons, the pair's panel and the gap beside an icon", () => {
  test("a look with a shadow draws its rectangle through a filter reaching past the box by the offset and three blurs", () => {
    const shadowed = themeWith({
      card: { shadow: { dx: 1, dy: -2, blur: 4, color: "#000000", opacity: 0.1 } },
    });
    const block = frame(fixed(10, 10)).layout(null, shadowed, 100);
    let count = 0;

    expect(
      block.draw({ x: 10, y: 20, width: 100, height: 50 }, () => `s-${++count}`).map(writeSvg),
    ).toEqual([
      `<filter id="s-1" filterUnits="userSpaceOnUse" x="-2" y="6" width="125" height="76">` +
        `<feDropShadow dx="1" dy="-2" stdDeviation="4" flood-color="#000000" flood-opacity="0.1"/></filter>`,
      `<rect x="10.5" y="20.5" width="99" height="49" rx="8" fill="#ffffff" stroke="#e6e6e6" stroke-width="1" filter="url(#s-1)"/>`,
      `<rect x="30" y="40" width="60" height="10"/>`,
    ]);
  });

  test("a look whose shadow is at opacity 0 draws no filter and takes no id", () => {
    const block = badge.layout("Badge", themeWith(), 100);

    expect(block.draw({ x: 0, y: 0, width: 100, height: 20 }, noId).map(writeSvg)[0]).toMatch(
      /^<rect /,
    );
  });

  test("a stroked icon's shapes are filled with the look's fill; a user's own filled icon keeps its ink", () => {
    const filled = themeWith({ icon: { fill: "blue", color: "white" } });
    const info = icon.layout("info", filled, 100).draw({ x: 0, y: 0, width: 20, height: 20 }, noId);
    const own = icon
      .layout(
        { pathData: "M0 0 L1 1 Z", viewBox: { x: 0, y: 0, width: 1, height: 1 }, paint: "fill" },
        filled,
        100,
      )
      .draw({ x: 0, y: 0, width: 20, height: 20 }, noId);

    expect(info.map(writeSvg)[0]).toContain(`fill="blue"`);
    expect(info.map(writeSvg)[0]).toContain(`stroke="white"`);
    expect(own.map(writeSvg)[0]).toContain(`fill="white"`);
  });

  test("the pair is drawn in the pair panel's look, apart from a section's panel", () => {
    const changed = themeWith({ pairPanel: { padding: 4, fill: "ivory" } });
    const node = buildNode(iconTitleCardPair, changed, "p", {
      first: { icon: "spark", title: "ここで" },
      second: { icon: "plus", title: "ここで" },
    });

    // 4 + 320 + 12 + 320 + 4 across, 4 + 61 + 4 down
    expect(node.leaf.size).toEqual({ width: 660, height: 69 });
    expect(node.draw({ x: 0, y: 0, width: 660, height: 69 })).toContain(
      `<rect x="0.5" y="0.5" width="659" height="68" rx="10" fill="ivory"`,
    );
  });

  test("the body beside an icon sits the icon text gap under the title", () => {
    const body = "あ".repeat(25);
    const node = buildNode(iconTitleBodyCard, themeWith({ iconTextGap: 2 }), "c", {
      icon: "spark",
      text: { title: "ここで", body },
    });
    // 20 + 21 + 2 + 35.2 + 20
    expect(node.leaf.size.height).toBeCloseTo(98.2, 6);

    const bodyData = textPathData(
      layoutText(body, { fonts: fonts.regular, size: 11, lineHeight: 1.6, maxWidth: 248 }),
      62,
      63,
    );
    expect(node.draw({ x: 10, y: 20, ...node.leaf.size })).toContain(
      `<path d="${bodyData}" fill="#8c8c8c"/>`,
    );
  });
});
