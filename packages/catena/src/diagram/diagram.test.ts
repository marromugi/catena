import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { sourceHanSansJP } from "@catena/font-source-han-sans";
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { drawEdge } from "../edge";
import { iconPathData } from "../icon";
import type { Layout, Rect } from "../layout";
import { writeSvg, type Node } from "../node";
import { placeGraph } from "../place";
import { layoutText, textPathData, Typeface } from "../text";
import { GITHUB_MARK } from "./github-mark";
import { DEFAULT_DOT_GRID, DEFAULT_EDGE_PAINT, drawDiagram, type DiagramHeader } from "./index";

const spacing = { nodeGap: 40, padding: 16, edgeToNode: 8, edgeGap: 8, minSegment: 16 };

/** A node that draws a marker naming its id and box. */
const markerNode = (id: string, width: number, height: number): Node => ({
  leaf: { id, size: { width, height } },
  draw: (box: Rect) =>
    `<g data-node="${id}" data-box="${box.x},${box.y},${box.width},${box.height}"/>`,
});

const a = markerNode("a", 120, 60);
const b = markerNode("b", 120, 60);
const c = markerNode("c", 80, 40);
const layout: Layout = placeGraph(
  {
    direction: "down",
    nodes: [a.leaf, { id: "g", direction: "right", children: [b.leaf, c.leaf] }],
    edges: [
      { id: "a>b", from: "a", to: "b" },
      { id: "a>c", from: "a", to: "c" },
    ],
  },
  spacing,
);
const boxAt = (x: number): Rect => ({ x, y: 0, width: 10, height: 10 });
const nodes = new Map([a, b, c].map((node) => [node.leaf.id, node]));

describe("drawDiagram", () => {
  test("gives one SVG document of the layout's size", () => {
    const svg = drawDiagram(layout, nodes);
    expect(svg).toMatch(
      new RegExp(
        `^<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">.*</svg>$`,
      ),
    );
    expect(svg.match(/<svg/g)).toHaveLength(1);
  });

  test("fills the whole canvas with the picture's dot grid by default", () => {
    expect(DEFAULT_DOT_GRID).toEqual({
      canvas: "#f5f5f5",
      dot: "#c4c4c4",
      dotRadius: 1,
      spacing: 16,
    });
    expect(drawDiagram(layout, nodes)).toContain(
      '<defs><pattern id="catena-dots" width="16" height="16" patternUnits="userSpaceOnUse">' +
        '<circle cx="8" cy="8" r="1" fill="#c4c4c4"/></pattern></defs>' +
        `<rect width="${layout.width}" height="${layout.height}" fill="#f5f5f5"/>` +
        `<rect width="${layout.width}" height="${layout.height}" fill="url(#catena-dots)"/>`,
    );
  });

  test("takes the dot grid's colours, radius and spacing from the options, the rest by default", () => {
    const svg = drawDiagram(layout, nodes, {
      background: { canvas: "#fff", dot: "#000", dotRadius: 2, spacing: 20 },
    });
    expect(svg).toContain(
      '<pattern id="catena-dots" width="20" height="20" patternUnits="userSpaceOnUse">' +
        '<circle cx="10" cy="10" r="2" fill="#000"/></pattern>',
    );
    expect(svg).toContain('fill="#fff"/>');
    expect(drawDiagram(layout, nodes, { background: { dot: "#000" } })).toContain(
      '<circle cx="8" cy="8" r="1" fill="#000"/>',
    );
  });

  test("keeps the default of a field given as undefined", () => {
    expect(
      drawDiagram(layout, nodes, {
        background: { dot: undefined },
        edgePaint: { stroke: undefined },
        header: undefined,
      }),
    ).toBe(drawDiagram(layout, nodes));
  });

  test("refuses an edge stroke width below 0 or not finite, and takes 0", () => {
    for (const strokeWidth of [-1, Number.NaN, Infinity]) {
      expect(() => drawDiagram(layout, nodes, { edgePaint: { strokeWidth } })).toThrow(RangeError);
    }
    expect(drawDiagram(layout, nodes, { edgePaint: { strokeWidth: 0 } })).toContain(
      'stroke-width="0"',
    );
  });

  test("takes a dot radius of 0", () => {
    expect(drawDiagram(layout, nodes, { background: { dotRadius: 0 } })).toContain('r="0"');
  });

  test("refuses a dot radius below 0, a spacing of 0 or less, and either not finite", () => {
    for (const background of [{ dotRadius: Infinity }, { spacing: Infinity }, { spacing: -4 }]) {
      expect(() => drawDiagram(layout, nodes, { background })).toThrow(RangeError);
    }
    expect(() => drawDiagram(layout, nodes, { background: { dotRadius: -1 } })).toThrow(
      new RangeError("A dot's radius must be a finite number 0 or more, not -1."),
    );
    expect(() => drawDiagram(layout, nodes, { background: { dotRadius: Number.NaN } })).toThrow(
      RangeError,
    );
    expect(() => drawDiagram(layout, nodes, { background: { spacing: 0 } })).toThrow(
      new RangeError("The dots' spacing must be a finite number more than 0, not 0."),
    );
    expect(() => drawDiagram(layout, nodes, { background: { spacing: Number.NaN } })).toThrow(
      RangeError,
    );
  });

  test("draws every edge through drawEdge in one painted group", () => {
    const paths = layout.edges.map((edge) => writeSvg(drawEdge(edge))).join("");
    expect(DEFAULT_EDGE_PAINT).toEqual({ stroke: "#8c8c8c", strokeWidth: 1.5 });
    expect(drawDiagram(layout, nodes)).toContain(
      `<g fill="none" stroke="#8c8c8c" stroke-width="1.5">${paths}</g>`,
    );
  });

  test("paints the edges as the options say", () => {
    const paths = layout.edges.map((edge) => writeSvg(drawEdge(edge))).join("");
    expect(
      drawDiagram(layout, nodes, {
        edgePaint: { stroke: "#123456", strokeWidth: 3 },
      }),
    ).toContain(`<g fill="none" stroke="#123456" stroke-width="3">${paths}</g>`);
  });

  test("draws every placed node with a Node at its box, group children too, and skips the rest", () => {
    const svg = drawDiagram(layout, nodes);
    const group = layout.nodes.find((node) => node.id === "g");
    const placed = [...layout.nodes, ...(group?.children ?? [])].filter((node) => node.id !== "g");
    expect(placed.map((node) => node.id).toSorted()).toEqual(["a", "b", "c"]);
    for (const { id, box } of placed) {
      expect(svg).toContain(nodes.get(id)?.draw(box));
    }
    expect(svg).not.toContain('data-node="g"');
  });

  test("draws nothing for a placed node with no Node", () => {
    const paths = layout.edges.map((edge) => writeSvg(drawEdge(edge))).join("");
    expect(drawDiagram(layout, new Map())).toMatch(
      new RegExp(
        `</defs>(<rect [^>]*/>){2}<g [^>]*>${paths.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}</g></svg>$`,
      ),
    );
  });

  test("draws the children of groups nested in groups", () => {
    const nested: Layout = {
      width: 100,
      height: 20,
      edges: [],
      nodes: [
        {
          id: "outer",
          box: boxAt(0),
          children: [
            {
              id: "inner",
              box: boxAt(10),
              children: [{ id: "deep", box: boxAt(20), children: [] }],
            },
          ],
        },
      ],
    };
    const deep = markerNode("deep", 10, 10);
    const inner = markerNode("inner", 10, 10);
    expect(
      drawDiagram(
        nested,
        new Map([
          ["deep", deep],
          ["inner", inner],
        ]),
      ),
    ).toContain(inner.draw(boxAt(10)) + deep.draw(boxAt(20)));
  });

  test("draws a group's Node before its children", () => {
    const frame = markerNode("g", 0, 0);
    const svg = drawDiagram(layout, new Map([...nodes, ["g", frame]]));
    expect(svg.indexOf('data-node="g"')).toBeGreaterThan(-1);
    expect(svg.indexOf('data-node="g"')).toBeLessThan(svg.indexOf('data-node="b"'));
  });

  test("puts the background first, then the edges, then the nodes", () => {
    const svg = drawDiagram(layout, nodes);
    const background = svg.indexOf("<defs>");
    const edges = svg.indexOf('<g fill="none"');
    const firstNode = svg.indexOf("data-node=");
    expect(background).toBeGreaterThan(-1);
    expect(background).toBeLessThan(edges);
    expect(edges).toBeLessThan(firstNode);
  });
});

const require = createRequire(import.meta.url);
const inter = (weight: 400 | 700) =>
  Typeface.read(
    readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`)),
  );
const fonts = {
  regular: [inter(400), Typeface.read(readFileSync(sourceHanSansJP.regular))],
  bold: [inter(700), Typeface.read(readFileSync(sourceHanSansJP.bold))],
} as const;

const header: DiagramHeader = {
  fonts,
  title: "このシーケンス図のタイトル",
  repository: { name: "repo name" },
  capturedAt: "Dec, 2022 14:00",
};
const LONG_TITLE = "A long title that does not fit beside the repository and the time";

/** A layout `width` wide holding nothing. */
const empty = (width: number): Layout => ({ width, height: 100, nodes: [], edges: [] });

/** An empty layout 800 wide under a header showing only what is `given`. */
const headerOf = (given: Omit<DiagramHeader, "fonts">) =>
  drawDiagram(empty(800), new Map(), { header: { fonts, ...given } });

/** The title drawn in a header holding only it, on an empty layout `width` wide. */
const titleAlone = (width: number) => (title: string) =>
  titles(drawDiagram(empty(width), new Map(), { header: { fonts, title } }));

const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);

/** `text` set on one line, 12 high, in the fonts of `weight`. */
const setIn = (text: string, weight: "regular" | "bold") =>
  layoutText(text, { fonts: fonts[weight], size: 12, lineHeight: 1.5, maxWidth: Infinity });

/** The left, right, top and bottom of what an outline covers, from its points. */
interface Span {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function spanOf(pathData: string): Span {
  const numbers = Array.from(pathData.matchAll(/-?\d*\.?\d+(?:e-?\d+)?/g), ([n]) => Number(n));
  const xs = numbers.filter((_, i) => i % 2 === 0);
  const ys = numbers.filter((_, i) => i % 2 === 1);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

/** The outline data of every text drawn in `color`, in the order drawn. */
const textsIn = (svg: string, color: string): string[] =>
  Array.from(
    svg.matchAll(new RegExp(`<path d="([^"]*)" fill="${color}"/>`, "g")),
    ([, d]) => d ?? "",
  );

const titles = (svg: string) => textsIn(svg, "#1f1f1f");
/** The time and the repository, in that order. */
const details = (svg: string) => textsIn(svg, "#8c8c8c");

/** The box the clock is drawn in, when it is. */
function clockBox(svg: string): Span | undefined {
  const match = new RegExp(
    `<path d="${iconPathData.clock}" transform="translate\\(([^ ]+) ([^ ]+)\\) scale\\(([^)]+)\\)"`,
  ).exec(svg);
  if (match === null) return undefined;
  const [x = 0, y = 0, scale = 0] = match.slice(1).map(Number);
  return { left: x, right: x + 24 * scale, top: y, bottom: y + 24 * scale };
}

/** The box the GitHub mark is drawn in, when it is: its path as it is, scaled evenly, filled black, nothing else. */
function markBox(svg: string): Span | undefined {
  const drawn = Array.from(
    svg.matchAll(
      new RegExp(
        `<path d="${GITHUB_MARK.pathData}" transform="translate\\(([^ ]+) ([^ ]+)\\) scale\\(([^)]+)\\)" fill="#000000"/>`,
        "g",
      ),
    ),
  );
  if (svg.split(GITHUB_MARK.pathData).length - 1 !== drawn.length) {
    throw new Error("The mark is drawn in some other way.");
  }
  const [match] = drawn;
  if (match === undefined) return undefined;
  const [x = 0, y = 0, scale = 0] = match.slice(1).map(Number);
  return { left: x, right: x + 24 * scale, top: y, bottom: y + 24 * scale };
}

/** Whether the last three contours of `pathData` are three small dots on one line, as `…` is. */
function endsInEllipsis(pathData: string): boolean {
  const dots = pathData
    .split("M")
    .slice(-3)
    .map((contour) => spanOf(`M${contour}`));
  const [first] = dots;
  return (
    dots.length === 3 &&
    first !== undefined &&
    dots.every(
      (dot) =>
        dot.right - dot.left < 3 &&
        dot.bottom - dot.top < 3 &&
        Math.abs(dot.bottom - first.bottom) < 0.1,
    )
  );
}

/** How far inside the box its text is set in a glyph's outline may start or end. */
const BEARING = 2.5;
const startsAt = (span: Span, x: number) => span.left >= x && span.left < x + BEARING;
const endsAt = (span: Span, x: number) => span.right <= x && span.right > x - BEARING;

/** Whether the spans sit left to right without touching. */
const apart = (spans: readonly Span[]) =>
  spans.every((span, i) => i === 0 || (spans[i - 1]?.right ?? Infinity) < span.left);

describe("drawDiagram with a header", () => {
  test("makes the document 72 higher and fills all of it with the dot grid", () => {
    const svg = drawDiagram(layout, nodes, { header });
    const height = layout.height + 72;
    expect(svg).toMatch(
      new RegExp(
        `^<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${height}" viewBox="0 0 ${layout.width} ${height}">`,
      ),
    );
    expect(svg).toContain(
      `<rect width="${layout.width}" height="${height}" fill="#f5f5f5"/>` +
        `<rect width="${layout.width}" height="${height}" fill="url(#catena-dots)"/>`,
    );
  });

  test("draws the header over the background, then the edges and the nodes 72 lower", () => {
    const svg = drawDiagram(layout, nodes, { header });
    const paths = layout.edges.map((edge) => writeSvg(drawEdge(edge))).join("");
    const group = layout.nodes.find((node) => node.id === "g");
    const drawn = [...layout.nodes, ...(group?.children ?? [])]
      .flatMap(({ id, box }) => nodes.get(id)?.draw(box) ?? [])
      .join("");
    expect(
      svg.endsWith(
        `<g transform="translate(0 72)"><g fill="none" stroke="#8c8c8c" stroke-width="1.5">${paths}</g>${drawn}</g></svg>`,
      ),
    ).toBe(true);
    const background = svg.indexOf('fill="url(#catena-dots)"');
    const band = svg.indexOf('<filter id="catena-header-shadow"');
    expect(background).toBeGreaterThan(-1);
    expect(background).toBeLessThan(band);
    expect(band).toBeLessThan(svg.indexOf('<g transform="translate(0 72)">'));
  });

  test("draws a white band flush with the top, its bottom corners 24 round, a light border and a shadow below", () => {
    expect(drawDiagram(empty(800), new Map(), { header: { fonts } })).toContain(
      '<filter id="catena-header-shadow" filterUnits="objectBoundingBox" x="-0.1" y="-0.5" width="1.2" height="2">' +
        '<feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000000" flood-opacity="0.08"/></filter>' +
        '<path d="M0.5 0V47.5A24 24 0 0 0 24.5 71.5H775.5A24 24 0 0 0 799.5 47.5V0" fill="#ffffff" ' +
        'stroke="#ebebeb" stroke-width="1" filter="url(#catena-header-shadow)"/>',
    );
  });

  test("rounds the band's corners by no more than half its width", () => {
    expect(drawDiagram(empty(30), new Map(), { header: { fonts } })).toContain(
      '<path d="M0.5 0V57A14.5 14.5 0 0 0 15 71.5H15A14.5 14.5 0 0 0 29.5 57V0"',
    );
  });

  test("sets the title 40 from the left; the repository, then the clock and the time, 40 from the right", () => {
    const svg = drawDiagram(empty(800), new Map(), { header });
    expect([titles(svg).length, details(svg).length]).toEqual([1, 2]);
    const [title = ""] = titles(svg);
    const [time = "", repository = ""] = details(svg);
    const clock = clockBox(svg);
    expect(clock).toMatchObject({ top: 27, bottom: 45 });
    const spans = [spanOf(title), spanOf(repository), clock ?? spanOf(""), spanOf(time)] as const;
    expect(apart(spans)).toBe(true);
    expect([
      startsAt(spans[0], 40),
      endsAt(spans[1], spans[2].left - 40),
      startsAt(spans[3], spans[2].right + 8),
      endsAt(spans[3], 760),
    ]).toEqual([true, true, true, true]);
    for (const span of [spans[0], spans[1], spans[3]]) {
      expect((span.top + span.bottom) / 2).toBeGreaterThan(32);
      expect((span.top + span.bottom) / 2).toBeLessThan(40);
    }
  });

  test("draws each of the title, the repository and the time only when given", () => {
    const onlyTitle = headerOf({ title: "Title" });
    expect([titles(onlyTitle).length, details(onlyTitle).length, clockBox(onlyTitle)]).toEqual([
      1,
      0,
      undefined,
    ]);
    const onlyRepository = headerOf({ repository: { name: "repo" } });
    expect([titles(onlyRepository).length, clockBox(onlyRepository)]).toEqual([0, undefined]);
    expect(details(onlyRepository).map((d) => endsAt(spanOf(d), 760))).toEqual([true]);
    const onlyTime = headerOf({ capturedAt: "14:00" });
    expect(titles(onlyTime)).toHaveLength(0);
    expect(details(onlyTime).map((d) => endsAt(spanOf(d), 760))).toEqual([true]);
    expect(clockBox(onlyTime)).toBeDefined();
    const none = headerOf({});
    expect([titles(none).length, details(none).length, clockBox(none)]).toEqual([0, 0, undefined]);
    expect(none).toContain('filter="url(#catena-header-shadow)"');
  });

  test("draws each run of spaces and line breaks as one space, and adds none where there is none", () => {
    const draw = titleAlone(800);
    expect(draw("このシーケンス図の\nタイトル")).toEqual(draw("このシーケンス図の タイトル"));
    expect(draw("A \n  B")).toEqual(draw("A B"));
    expect(draw("A\nB")).not.toEqual(draw("AB"));
  });

  test("draws no text holding only spaces or drawing nothing, and no clock or mark for such a text", () => {
    const blank = headerOf({
      title: " \n ",
      repository: { name: ZERO_WIDTH_SPACE, mark: "github" },
      capturedAt: ZERO_WIDTH_SPACE,
    });
    expect(blank).toBe(headerOf({}));
  });

  test("sets the title 12 bold and the repository and the time 12 regular, centred in the band", () => {
    expect(titles(headerOf({ title: "Title" }))).toEqual([
      textPathData(setIn("Title", "bold"), 40, 27),
    ]);
    const repository = setIn("repo", "regular");
    expect(details(headerOf({ repository: { name: "repo" } }))).toEqual([
      textPathData(repository, 760 - repository.width, 27),
    ]);
  });

  test("draws the clock 18 across in light grey, its lines 1.75 wide as drawn", () => {
    const svg = headerOf({ capturedAt: "14:00" });
    expect(clockBox(svg)).toMatchObject({ top: 27, bottom: 45 });
    expect(svg).toContain(
      ' scale(0.75)" fill="none" stroke-width="2.3333333333333335" stroke-linecap="round" ' +
        'stroke-linejoin="round" stroke="#b3b3b3"/>',
    );
  });

  test("draws the GitHub mark only when the repository asks for it", () => {
    expect(markBox(headerOf({ repository: { name: "repo" } }))).toBeUndefined();
    expect(markBox(headerOf({ title: "Title", capturedAt: "14:00" }))).toBeUndefined();
    expect(markBox(headerOf({ repository: { name: "repo", mark: "github" } }))).toBeDefined();
  });

  test("draws the GitHub mark's path from Octicons unchanged", () => {
    expect(createHash("sha256").update(GITHUB_MARK.pathData).digest("hex")).toBe(
      "fd34a5c2908d8dfb0c72c06ccb7de99c7085c2070d1c22682cd4073c960d9873",
    );
  });

  test("draws the GitHub mark 22 across in black, centred in the band, 10 before the repository", () => {
    const svg = drawDiagram(empty(800), new Map(), {
      header: { ...header, repository: { name: "repo name", mark: "github" } },
    });
    const mark = markBox(svg);
    expect(mark).toEqual({
      left: expect.any(Number),
      right: expect.any(Number),
      top: 25,
      bottom: 47,
    });
    const [time = "", repository = ""] = details(svg);
    expect(details(svg)).toEqual(details(drawDiagram(empty(800), new Map(), { header })));
    expect(mark?.right).toBeCloseTo((mark?.left ?? 0) + 22, 10);
    expect(startsAt(spanOf(repository), (mark?.right ?? 0) + 10)).toBe(true);
    const [title = ""] = titles(svg);
    const spans = [
      spanOf(title),
      mark ?? spanOf(""),
      spanOf(repository),
      clockBox(svg) ?? spanOf(""),
      spanOf(time),
    ];
    expect(apart(spans)).toBe(true);
  });

  test("cuts the repository after its mark and keeps the mark whole", () => {
    const svg = drawDiagram(empty(330), new Map(), {
      header: { ...header, repository: { name: "marromugi/catena", mark: "github" } },
    });
    const [, repository = ""] = details(svg);
    expect(endsInEllipsis(repository)).toBe(true);
    const mark = markBox(svg);
    expect((mark?.right ?? 0) - (mark?.left ?? 0)).toBeCloseTo(22, 10);
    // The longest start that fits: one more letter of 12 at most would pass the room's end.
    expect(mark?.left).toBeGreaterThanOrEqual(40);
    expect(mark?.left).toBeLessThan(40 + 12);
  });

  test("leaves the mark out with the repository when the mark, one character and … don't fit", () => {
    const room = (setIn("…", "regular").width + setIn("W…", "regular").width) / 2;
    const width = 40 + 40 + 22 + 10 + room;
    const marked = drawDiagram(empty(width), new Map(), {
      header: { fonts, repository: { name: "WWW", mark: "github" } },
    });
    expect([details(marked).length, markBox(marked)]).toEqual([0, undefined]);
    const unmarked = drawDiagram(empty(width), new Map(), {
      header: { fonts, repository: { name: "WWW" } },
    });
    expect(details(unmarked)).toHaveLength(1);
  });

  test("gives every document the same shadow filter, so each band keeps its whole shadow on a shared page", () => {
    const [narrow, wide] = [300, 700].map(
      (width) =>
        /<filter .*?<\/filter>/.exec(drawDiagram(empty(width), new Map(), { header }))?.[0],
    );
    expect(narrow).toBeDefined();
    expect(narrow).toBe(wide);
  });

  test("draws a text that exactly fits its room whole, and a cut that exactly fits it", () => {
    const [drawn = ""] = titleAlone(80 + setIn("WWWW", "bold").width)("WWWW");
    expect(endsInEllipsis(drawn)).toBe(false);
    const cutRoom = titleAlone(80 + setIn("WWW…", "bold").width);
    expect(cutRoom("WWWWWWWW")).toEqual(cutRoom("WWW…"));
    expect(cutRoom("WWWW")).toEqual(cutRoom("WWW…"));
  });

  test("leaves a text out when the only start that fits with … draws nothing", () => {
    const room = (setIn("…", "bold").width + setIn("W…", "bold").width) / 2;
    expect(titleAlone(80 + room)(`${ZERO_WIDTH_SPACE}WWWW`)).toEqual([]);
  });

  test("leaves a text out when … alone would fit but not one character and …", () => {
    const room = (setIn("…", "regular").width + setIn("W…", "regular").width) / 2;
    const svg = drawDiagram(empty(40 + 40 + 18 + 8 + room), new Map(), {
      header: { fonts, capturedAt: "WWW" },
    });
    expect([details(svg).length, clockBox(svg)]).toEqual([0, undefined]);
  });

  test("cuts a text of 2000 characters", () => {
    const long = "サンプルの文章".repeat(300);
    const [title = ""] = titles(headerOf({ title: long }));
    expect(endsInEllipsis(title)).toBe(true);
    expect(startsAt(spanOf(title), 40)).toBe(true);
    const all = headerOf({ title: long, repository: { name: long }, capturedAt: long });
    const [time = ""] = details(all);
    expect(endsInEllipsis(time)).toBe(true);
    expect(clockBox(all)?.left).toBeGreaterThanOrEqual(40);
  });

  test("cuts a title too wide for what the repository and the time leave, ending it in …", () => {
    const short = drawDiagram(empty(500), new Map(), { header });
    const long = drawDiagram(empty(500), new Map(), { header: { ...header, title: LONG_TITLE } });
    expect(details(long)).toEqual(details(short));
    const [title = ""] = titles(long);
    const [time = "", repository = ""] = details(long);
    expect([endsInEllipsis(title), endsInEllipsis(repository), endsInEllipsis(time)]).toEqual([
      true,
      false,
      false,
    ]);
    const spans = [spanOf(title), spanOf(repository)] as const;
    expect(startsAt(spans[0], 40)).toBe(true);
    expect(spans[1].left - spans[0].right).toBeGreaterThan(40 - BEARING);
    // The longest start that fits: one more letter of 12 at most would pass the room's end.
    expect(spans[1].left - spans[0].right).toBeLessThan(40 + 12 + 2 * BEARING);
  });

  test("leaves the title out before cutting the repository, and the repository before cutting the time", () => {
    const narrower = drawDiagram(empty(260), new Map(), { header });
    expect(titles(narrower)).toHaveLength(0);
    const [time = "", repository = ""] = details(narrower);
    expect([endsInEllipsis(repository), endsInEllipsis(time)]).toEqual([true, false]);
    expect(spanOf(repository).left).toBeGreaterThan(39);

    const narrowest = drawDiagram(empty(170), new Map(), { header });
    expect([titles(narrowest).length, details(narrowest).length]).toEqual([0, 1]);
    const [cutTime = ""] = details(narrowest);
    expect(endsInEllipsis(cutTime)).toBe(true);
    expect(clockBox(narrowest)?.left).toBeGreaterThanOrEqual(40);
    expect(spanOf(cutTime).right).toBeLessThanOrEqual(130);
  });

  test("leaves out each text, and the clock with the time, when not even one character and … fit", () => {
    const svg = drawDiagram(empty(84), new Map(), { header });
    expect([titles(svg).length, details(svg).length, clockBox(svg)]).toEqual([0, 0, undefined]);
  });
});

describe("drawDiagram with a header: any texts at any width", () => {
  const piece = fc.constantFrom(
    "a",
    "W",
    " ",
    "\n",
    "語",
    "の",
    "…",
    "-",
    "👩‍💻",
    String.fromCodePoint(0x3000),
    ZERO_WIDTH_SPACE,
    "e" + String.fromCodePoint(0x301),
  );
  const text = fc.option(
    fc.array(piece, { maxLength: 24 }).map((pieces) => pieces.join("")),
    { nil: undefined },
  );
  const headers = fc.record({
    title: text,
    repository: fc
      .tuple(text, fc.option(fc.constant("github" as const), { nil: undefined }))
      .map(([name, mark]) => (name === undefined ? undefined : { name, mark })),
    capturedAt: text,
  });

  test("keeps every text, the clock and the mark in the band, left to right without touching", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 900 }), headers, (width, given) => {
        const svg = drawDiagram(empty(width), new Map(), { header: { fonts, ...given } });
        const clock = clockBox(svg);
        const [first, second] = details(svg).map(spanOf);
        const [time, repository] = clock === undefined ? [undefined, first] : [first, second];
        const mark = markBox(svg);
        expect(mark !== undefined).toBe(
          given.repository?.mark === "github" && repository !== undefined,
        );
        expect(mark === undefined ? 22 : mark.right - mark.left).toBeCloseTo(22, 10);
        const spans = [...titles(svg).map(spanOf), mark, repository, clock, time].filter(
          (span) => span !== undefined,
        );
        for (const span of spans) {
          expect(span.left).toBeGreaterThanOrEqual(0);
          expect(span.right).toBeLessThanOrEqual(width);
          expect(span.top).toBeGreaterThanOrEqual(0);
          expect(span.bottom).toBeLessThanOrEqual(72);
        }
        expect(apart(spans)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
