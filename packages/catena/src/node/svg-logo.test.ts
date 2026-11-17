import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  element,
  readSvgLogo,
  UnreadableSvgError,
  writeSvg,
  type LogoShape,
  type OwnLogo,
} from "./index";
import { MalformedXmlError } from "./xml";

// Made-up shapes: catena's tests carry no real company's mark or colours.
const svg = (body: string, root = 'viewBox="0 0 48 48"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${body}</svg>`;

const ROUND = 'stroke-linecap="round" stroke-linejoin="round"';

const BLACK = { pathData: "M0 0", paint: "fill", color: "black" };

/** What reading `given` returns, or the error it throws. */
const attempt = (given: string): unknown => {
  try {
    return readSvgLogo(given);
  } catch (error) {
    return error;
  }
};
const readInGroup = (written: string) =>
  attempt(svg(`<g fill="blue" stroke="green" ${ROUND}><path d="M0 0" ${written}/></g>`));
const viewBox = (root: string) => readSvgLogo(svg('<path d="M0 0"/>', root)).viewBox;
const readRoot = (root: string) => () => readSvgLogo(svg('<path d="M0 0"/>', root));
const rectWidth = (given: string) =>
  readSvgLogo(svg(`<rect width="${given}" height="1"/>`)).shapes[0]?.pathData;
const paths = (body: string) =>
  readSvgLogo(svg(body + '<path d="M9 9"/>')).shapes.map((s) => s.pathData);
const colors = (body: string) =>
  readSvgLogo(svg(`<g fill="red">${body}</g>`)).shapes.map((s) => s.color);

const fill = (style: string) =>
  readSvgLogo(svg(`<path d="M0 0" style="${style}"/>`)).shapes[0]?.color;

describe("readSvgLogo", () => {
  test("a logo written as SVG paths reads back as itself", () => {
    const text = fc.string({ minLength: 1 }).filter((s) => s.trim() === s && !/[\t\n\r]/.test(s));
    const color = fc
      .integer({ min: 0, max: 0xffffff })
      .map((n) => `#${n.toString(16).padStart(6, "0")}`);
    const shape: fc.Arbitrary<LogoShape> = fc.oneof(
      fc.record({ pathData: text, paint: fc.constant("fill" as const), color }),
      fc.record({
        pathData: text,
        paint: fc.constant("stroke" as const),
        color,
        width: fc.double({ min: 0.001, max: 100, noNaN: true }),
      }),
    );
    const logo: fc.Arbitrary<OwnLogo> = fc.record({
      viewBox: fc.record({
        x: fc.integer({ min: -100, max: 100 }),
        y: fc.integer({ min: -100, max: 100 }),
        width: fc.integer({ min: 1, max: 1000 }),
        height: fc.integer({ min: 1, max: 1000 }),
      }),
      shapes: fc.array(shape, { minLength: 1, maxLength: 5 }),
    });

    fc.assert(
      fc.property(logo, (given) => {
        const { x, y, width, height } = given.viewBox;
        const written = writeSvg(
          element(
            "svg",
            { viewBox: `${x} ${y} ${width} ${height}` },
            given.shapes.map((s) =>
              s.paint === "fill"
                ? element("path", { d: s.pathData, fill: s.color })
                : element("path", {
                    d: s.pathData,
                    fill: "none",
                    stroke: s.color,
                    "stroke-width": s.width,
                    "stroke-linecap": "round",
                    "stroke-linejoin": "round",
                  }),
            ),
          ),
        );
        expect(readSvgLogo(written)).toEqual(given);
      }),
    );
  });

  test("the basic shapes become path data", () => {
    const logo = readSvgLogo(
      svg(
        '<rect x="1" y="2" width="10" height="20"/>' +
          '<rect x="0" y="0" width="10" height="20" rx="2"/>' +
          '<rect width="10" height="4" ry="5"/>' +
          '<circle cx="24" cy="24" r="4"/>' +
          '<ellipse cx="24" cy="24" rx="6" ry="3"/>' +
          '<polygon points="0,0 10,0 5 8"/>' +
          '<polyline points="0 0, 10 10"/>',
      ),
    );

    expect(logo.shapes.map((s) => s.pathData)).toEqual([
      "M 1 2 H 11 V 22 H 1 Z",
      "M 2 0 H 8 A 2 2 0 0 1 10 2 V 18 A 2 2 0 0 1 8 20 H 2 A 2 2 0 0 1 0 18 V 2 A 2 2 0 0 1 2 0 Z",
      "M 5 0 H 5 A 5 2 0 0 1 10 2 V 2 A 5 2 0 0 1 5 4 H 5 A 5 2 0 0 1 0 2 V 2 A 5 2 0 0 1 5 0 Z",
      "M 28 24 A 4 4 0 1 1 20 24 A 4 4 0 1 1 28 24 Z",
      "M 30 24 A 6 3 0 1 1 18 24 A 6 3 0 1 1 30 24 Z",
      "M 0 0 L 10 0 L 5 8 Z",
      "M 0 0 L 10 10",
    ]);
    expect(logo.shapes.every((s) => s.paint === "fill" && s.color === "black")).toBe(true);
  });

  test("a line is only ever stroked, and a stroke has width 1 unless given", () => {
    expect(
      readSvgLogo(svg(`<line x1="1" y1="2" x2="3" y2="4" stroke="red" ${ROUND}/>`)).shapes,
    ).toEqual([{ pathData: "M 1 2 L 3 4", paint: "stroke", color: "red", width: 1 }]);
  });

  test("a shape with fill and stroke becomes two shapes, fill first, each in its own colour", () => {
    expect(
      readSvgLogo(
        svg(`<path d="M0 0H8V8Z" fill="#123456" stroke="#abcdef" stroke-width="2px" ${ROUND}/>`),
      ).shapes,
    ).toEqual([
      { pathData: "M0 0H8V8Z", paint: "fill", color: "#123456" },
      { pathData: "M0 0H8V8Z", paint: "stroke", color: "#abcdef", width: 2 },
    ]);
  });

  test("groups and the root pass paint down; a shape's own attributes, and its style over them, win", () => {
    const logo = readSvgLogo(
      svg(
        `<g fill="green" stroke="blue" stroke-width="3" ${ROUND}>` +
          '<path d="M1 1"/>' +
          '<g fill="none"><path d="M2 2" stroke-width="inherit"/></g>' +
          '<path d="M3 3" fill="red" style="fill: purple !important; stroke:none"/>' +
          "</g>" +
          '<path d="M4 4"/>',
        'viewBox="0 0 48 48" fill="orange"',
      ),
    );

    expect(logo.shapes).toEqual([
      { pathData: "M1 1", paint: "fill", color: "green" },
      { pathData: "M1 1", paint: "stroke", color: "blue", width: 3 },
      { pathData: "M2 2", paint: "stroke", color: "blue", width: 3 },
      { pathData: "M3 3", paint: "fill", color: "purple" },
      { pathData: "M4 4", paint: "fill", color: "orange" },
    ]);
  });

  test("what draws nothing is left out, and what is skipped is not read", () => {
    const logo = readSvgLogo(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [ <!ENTITY x "y"> ]>\n' +
        svg(
          "<!-- a <comment> -->" +
            "<title>Made up</title><desc>Not <b>read</b></desc><metadata><rdf/></metadata>" +
            '<defs><linearGradient id="g"/></defs>' +
            '<path d="M0 0" fill="none"/>' +
            '<path d="M0 0" fill="none" stroke="red" stroke-width="0"/>' +
            '<rect width="0" height="4"/><circle r="0"/><path d=" "/><polygon points=""/>' +
            '<g style="display: none"><use href="#g"/></g>' +
            '<path d="M5 5" fill="&#x23;0f0"><title>x</title></path>' +
            "<![CDATA[ <use/> ]]>",
        ),
    );

    expect(logo.shapes).toEqual([{ pathData: "M5 5", paint: "fill", color: "#0f0" }]);
  });

  test("inline style reads as CSS: comments are skipped and an important declaration wins", () => {
    expect(fill("/* fill:red; */ fill:blue")).toBe("blue");
    expect(fill("fill:red !important; fill:blue")).toBe("red");
    expect(fill("fill:red; fill:blue !important")).toBe("blue");
  });

  test("an opacity of inherit, or of 1, draws the shape whole", () => {
    expect(
      readSvgLogo(svg('<path d="M0 0" fill-opacity="inherit" opacity="1" stroke-opacity="100%"/>'))
        .shapes,
    ).toEqual([{ pathData: "M0 0", paint: "fill", color: "black" }]);
  });

  test("a hidden element is left out before what it holds is checked", () => {
    expect(
      readSvgLogo(svg('<path d="M1 1" display="none" visibility="hidden"/><path d="M0 0"/>'))
        .shapes,
    ).toEqual([{ pathData: "M0 0", paint: "fill", color: "black" }]);
  });

  test("a negative rx is not given, so the corners take ry", () => {
    expect(
      readSvgLogo(svg('<rect width="20" height="20" rx="-1" ry="5"/>')).shapes[0]?.pathData,
    ).toBe(
      "M 5 0 H 15 A 5 5 0 0 1 20 5 V 15 A 5 5 0 0 1 15 20 H 5 A 5 5 0 0 1 0 15 V 5 A 5 5 0 0 1 5 0 Z",
    );
  });

  test("any text gives a logo or an UnreadableSvgError, nothing else", () => {
    const pieces = fc.constantFrom(
      "<svg",
      ' viewBox="0 0 4 4"',
      ">",
      "</svg>",
      "<path",
      ' d="M0 0"',
      "/>",
      "<g>",
      "</g>",
      "&",
      "&amp;",
      ";",
      '"',
      "<!--",
      "-->",
      "<![CDATA[",
      "]]>",
      "<!DOCTYPE",
      "[",
      "]",
      ' style="',
      "fill:red",
      "/*",
      "*/",
      "<constructor/>",
      "&toString;",
    );
    const text = fc.oneof(
      fc.string(),
      fc.array(pieces).map((p) => p.join("")),
    );
    fc.assert(
      fc.property(text, (given) => {
        const outcome = attempt(given);
        expect(outcome instanceof UnreadableSvgError || !(outcome instanceof Error)).toBe(true);
      }),
    );
  });

  test("a paint property reads the same as an attribute or in style", () => {
    const color = fc.constantFrom("red", "#123", "none", "inherit", "rgb(1, 2, 3)");
    const property = fc.oneof(
      fc.tuple(fc.constantFrom("fill", "stroke"), color),
      fc.tuple(fc.constant("stroke-width"), fc.constantFrom("0", "2", "1.5px", "inherit")),
      fc.tuple(fc.constantFrom("stroke-linecap", "stroke-linejoin"), fc.constantFrom("round")),
    );
    fc.assert(
      fc.property(fc.uniqueArray(property, { selector: ([name]) => name }), (properties) => {
        const asAttributes = properties.map(([name, value]) => `${name}="${value}"`).join(" ");
        const asStyle = `style="${properties.map(([name, value]) => `${name}: ${value}`).join("; ")}"`;
        expect(readInGroup(asStyle)).toEqual(readInGroup(asAttributes));
      }),
    );
  });

  const limited: ReadonlyArray<readonly [string, readonly string[], string]> = [
    ["clip-path", ["none", "None"], "url(#c)"],
    ["mask", ["none"], "url(#m)"],
    ["filter", ["none"], "url(#f)"],
    ["marker", ["none"], "url(#m)"],
    ["marker-start", ["none"], "url(#m)"],
    ["marker-mid", ["none"], "url(#m)"],
    ["marker-end", ["none"], "url(#m)"],
    ["stroke-dasharray", ["none"], "2 2"],
    ["fill-rule", ["nonzero", "NONZERO", "inherit"], "evenodd"],
    ["visibility", ["visible", "inherit"], "hidden"],
    ["paint-order", ["normal", "fill stroke", "fill"], "stroke"],
    ["vector-effect", ["none"], "non-scaling-stroke"],
    ["mix-blend-mode", ["normal"], "multiply"],
  ];

  test.each(limited)("%s holds %j and refuses %s", (property, held, unheld) => {
    for (const value of held) {
      expect(readSvgLogo(svg(`<path d="M0 0" ${property}="${value}"/>`)).shapes).toEqual([BLACK]);
    }
    expect(() => readSvgLogo(svg(`<path d="M0 0" ${property}="${unheld}"/>`))).toThrow(
      new UnreadableSvgError(`A logo cannot hold the SVG's ${property} ${unheld} on <path>.`),
    );
  });

  test("an opacity of 1 or more, or empty, draws whole; below 1 is refused", () => {
    for (const value of ["1", " 1 ", "100%", "1.5", ""]) {
      expect(readSvgLogo(svg(`<path d="M0 0" opacity="${value}"/>`)).shapes).toEqual([BLACK]);
    }
    for (const value of ["0", "0.99", "99%"]) {
      expect(() => readSvgLogo(svg(`<path d="M0 0" opacity="${value}"/>`))).toThrow(
        new UnreadableSvgError(`A logo cannot hold the SVG's opacity ${value} on <path>.`),
      );
    }
  });

  test("a viewBox is four numbers apart by space or commas, and wins over width and height", () => {
    expect(viewBox('viewBox="0,0,4,4"')).toEqual({ x: 0, y: 0, width: 4, height: 4 });
    expect(viewBox('viewBox="  -1 -2,  3 4 "')).toEqual({ x: -1, y: -2, width: 3, height: 4 });
    expect(viewBox('viewBox="0 0 4 4" width="100" height="50"')).toEqual({
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    for (const given of ["0 0 4", "0 0 4 4 4", "0 0 x 4", "0 0 4 0", "0 0 -4 4", "0 0 4 4,"]) {
      expect(() => viewBox(`viewBox="${given}"`)).toThrow(
        new UnreadableSvgError(
          `The root <svg>'s viewBox "${given}" is not four numbers with a width and height above 0.`,
        ),
      );
    }
  });

  test("a root without a viewBox needs a width and a height, both above 0 in user units", () => {
    expect(readRoot('width="4"')).toThrow(
      new UnreadableSvgError("The root <svg> gives neither a viewBox nor a width and height."),
    );
    expect(readRoot('height="4"')).toThrow(
      new UnreadableSvgError("The root <svg> gives neither a viewBox nor a width and height."),
    );
    expect(readRoot('width="0" height="4"')).toThrow(
      new UnreadableSvgError("The root <svg>'s width and height are not both above 0."),
    );
    expect(readRoot('width="4" height="-4"')).toThrow(
      new UnreadableSvgError("The root <svg>'s width and height are not both above 0."),
    );
    expect(readRoot('width="4" height="3mm"')).toThrow(
      new UnreadableSvgError('height "3mm" on <svg> is not a number of user units.'),
    );
  });

  test("a length is a number, in user units or px", () => {
    expect(rectWidth(".5")).toBe("M 0 0 H 0.5 V 1 H 0 Z");
    expect(rectWidth("1e1")).toBe("M 0 0 H 10 V 1 H 0 Z");
    expect(rectWidth("1E+1px")).toBe("M 0 0 H 10 V 1 H 0 Z");
    expect(rectWidth("+2")).toBe("M 0 0 H 2 V 1 H 0 Z");
    for (const given of ["0x10", "", "Infinity", "1e999", "1px2", "1 px"]) {
      expect(() => rectWidth(given)).toThrow(
        new UnreadableSvgError(`width "${given}" on <rect> is not a number of user units.`),
      );
    }
  });

  test("shapes with no area or length are left out, and radii are clamped or taken from each other", () => {
    expect(
      paths(
        '<path/><rect width="4" height="0"/><rect width="0" height="4"/><ellipse rx="0" ry="4"/>' +
          '<ellipse rx="4" ry="0"/><circle r="-1"/><polygon/><polyline points=" "/>',
      ),
    ).toEqual(["M9 9"]);
    expect(
      paths('<rect width="4" height="4" rx="3" ry="0"/><rect width="4" height="4" rx="0" ry="3"/>'),
    ).toEqual(["M 0 0 H 4 V 4 H 0 Z", "M 0 0 H 4 V 4 H 0 Z", "M9 9"]);
    expect(paths('<rect width="4" height="40" rx="30"/><ellipse cx="1" cy="1" rx="2"/>')).toEqual([
      "M 2 0 H 2 A 2 20 0 0 1 4 20 V 20 A 2 20 0 0 1 2 40 H 2 A 2 20 0 0 1 0 20 V 20 A 2 20 0 0 1 2 0 Z",
      "M 3 1 A 2 2 0 1 1 -1 1 A 2 2 0 1 1 3 1 Z",
      "M9 9",
    ]);
    expect(paths('<polygon points="10-5 3 4 1-1"/><polyline points="1.5.5"/>')).toEqual([
      "M 10 -5 L 3 4 L 1 -1 Z",
      "M 1.5 0.5",
      "M9 9",
    ]);
    expect(() => paths('<polyline points="1 x"/>')).toThrow(
      new UnreadableSvgError("The points of <polyline> are not pairs of numbers."),
    );
  });

  test("a stroke is refused unless its caps and joins are both round, in any case", () => {
    expect(
      readSvgLogo(
        svg(
          '<path d="M0 0" fill="none" stroke="red" stroke-linecap="ROUND" stroke-linejoin="Round"/>',
        ),
      ).shapes,
    ).toEqual([{ pathData: "M0 0", paint: "stroke", color: "red", width: 1 }]);
    expect(() => readSvgLogo(svg('<path d="M0 0" stroke="red"/>'))).toThrow(
      new UnreadableSvgError(
        "The stroke of <path> has stroke-linecap butt and stroke-linejoin miter; a logo's strokes have both round.",
      ),
    );
    expect(() =>
      readSvgLogo(
        svg('<path d="M0 0" stroke="red" stroke-linecap="round" stroke-linejoin="bevel"/>'),
      ),
    ).toThrow(
      new UnreadableSvgError(
        "The stroke of <path> has stroke-linecap round and stroke-linejoin bevel; a logo's strokes have both round.",
      ),
    );
    expect(() => readSvgLogo(svg('<path d="M0 0" stroke="red" stroke-width="-1"/>'))).toThrow(
      new UnreadableSvgError("A logo cannot hold the SVG's stroke-width -1 on <path>."),
    );
  });

  test("paint values are trimmed, and empty or inherit takes the parent's", () => {
    expect(
      colors(
        '<path d="M0 0" fill=" blue "/><path d="M0 0" fill=""/><path d="M0 0" fill="INHERIT"/>' +
          '<path d="M0 0" style="FILL:green"/><path d="M0 0" style="fill:green;fill:teal;fills"/>',
      ),
    ).toEqual(["blue", "red", "red", "green", "teal"]);
    for (const [property, value] of [
      ["fill", "context-fill"],
      ["stroke", "context-stroke"],
      ["fill", "var(--x)"],
      ["fill", "CurrentColor"],
    ] as const) {
      expect(() => colors(`<path d="M0 0" ${property}="${value}"/>`)).toThrow(
        new UnreadableSvgError(`A logo cannot hold the SVG's ${property} ${value} on <path>.`),
      );
    }
  });

  test("a hidden element is left out whatever its paint, in any case and spacing of none", () => {
    expect(
      readSvgLogo(
        svg(
          '<path d="M1 1" display=" NONE " fill="url(#a)"/><g style="display:none"><path d="M2 2"/></g><path d="M0 0"/>',
        ),
      ).shapes,
    ).toEqual([BLACK]);
  });

  test("XML the reader cannot read is refused as an UnreadableSvgError caused by it", () => {
    let thrown: unknown;
    try {
      readSvgLogo("<svg");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnreadableSvgError);
    expect(thrown).toMatchObject({
      name: "UnreadableSvgError",
      cause: expect.any(MalformedXmlError),
    });
  });

  test("with no viewBox the view box is the root's width and height", () => {
    expect(readSvgLogo(svg('<path d="M0 0"/>', 'width="32px" height="16"')).viewBox).toEqual({
      x: 0,
      y: 0,
      width: 32,
      height: 16,
    });
  });

  const refusals: ReadonlyArray<readonly [string, string, string]> = [
    [
      "a transform",
      svg('<g transform="scale(2)"><path d="M0 0"/></g>'),
      "A logo cannot hold the SVG's transform on <g>.",
    ],
    [
      "a transform in style",
      svg('<path d="M0 0" style="transform: none"/>'),
      "A logo cannot hold the SVG's transform on <path>.",
    ],
    [
      "a gradient",
      svg('<path d="M0 0" fill="url(#g)"/>'),
      "A logo cannot hold the SVG's url(...) fill on <path>.",
    ],
    [
      "a pattern stroke",
      svg('<path d="M0 0" stroke="url(#p) red"/>'),
      "A logo cannot hold the SVG's url(...) stroke on <path>.",
    ],
    [
      "currentColor",
      svg('<path d="M0 0" fill="currentColor"/>'),
      "A logo cannot hold the SVG's fill currentColor on <path>.",
    ],
    ["<use>", svg('<use href="#a"/>'), "A logo cannot hold the SVG's <use>."],
    ["<text>", svg("<text>Hi</text>"), "A logo cannot hold the SVG's <text>."],
    ["<image>", svg('<image href="a.png"/>'), "A logo cannot hold the SVG's <image>."],
    ["<style>", svg("<style>path{fill:red}</style>"), "A logo cannot hold the SVG's <style>."],
    [
      "an unknown element",
      svg("<g><a><path d='M0 0'/></a></g>"),
      "A logo cannot hold the SVG's <a>.",
    ],
    [
      "an element inside a shape",
      svg('<path d="M0 0"><animate/></path>'),
      "A logo cannot hold the SVG's <animate> inside <path>.",
    ],
    ["class", svg('<path class="x" d="M0 0"/>'), "A logo cannot hold the SVG's class on <path>."],
    [
      "clip-path",
      svg('<g clip-path="url(#c)"/>'),
      "A logo cannot hold the SVG's clip-path url(#c) on <g>.",
    ],
    [
      "mask",
      svg('<path d="M0 0" style="mask:url(#m)"/>'),
      "A logo cannot hold the SVG's mask url(#m) on <path>.",
    ],
    [
      "filter",
      svg('<path d="M0 0" filter="url(#f)"/>'),
      "A logo cannot hold the SVG's filter url(#f) on <path>.",
    ],
    ["opacity", svg('<g opacity="0.5"/>'), "A logo cannot hold the SVG's opacity 0.5 on <g>."],
    [
      "fill-opacity",
      svg('<path d="M0 0" fill-opacity="50%"/>'),
      "A logo cannot hold the SVG's fill-opacity 50% on <path>.",
    ],
    [
      "stroke-opacity",
      svg('<path d="M0 0" style="stroke-opacity:.9"/>'),
      "A logo cannot hold the SVG's stroke-opacity .9 on <path>.",
    ],
    [
      "an even-odd fill",
      svg('<path d="M0 0" fill-rule="evenodd"/>'),
      "A logo cannot hold the SVG's fill-rule evenodd on <path>.",
    ],
    [
      "dashes",
      svg('<path d="M0 0" stroke-dasharray="2 2"/>'),
      "A logo cannot hold the SVG's stroke-dasharray 2 2 on <path>.",
    ],
    [
      "a stroke without round caps and joins",
      svg('<path d="M0 0" stroke="red" stroke-linecap="round"/>'),
      "The stroke of <path> has stroke-linecap round and stroke-linejoin miter; a logo's strokes have both round.",
    ],
    ["a root that is not <svg>", "<g/>", "The file's root is <g>, not <svg>."],
    [
      "a root with no size",
      '<svg><path d="M0 0"/></svg>',
      "The root <svg> gives neither a viewBox nor a width and height.",
    ],
    [
      "a size in other units",
      svg('<path d="M0 0"/>', 'width="10mm" height="10mm"'),
      'width "10mm" on <svg> is not a number of user units.',
    ],
    [
      "a view box with no area",
      svg('<path d="M0 0"/>', 'viewBox="0 0 0 10"'),
      'The root <svg>\'s viewBox "0 0 0 10" is not four numbers with a width and height above 0.',
    ],
    ["a file that draws nothing", svg('<path d="M0 0" fill="none"/>'), "The SVG draws no shape."],
    [
      "odd points",
      svg('<polygon points="0 0 1"/>'),
      "The points of <polygon> are not pairs of numbers.",
    ],
    [
      "an unknown entity",
      svg('<path d="M0 0" fill="&nbsp;"/>'),
      "The SVG is not well-formed XML: &nbsp; is not an entity XML predefines at offset 81.",
    ],
    [
      "an unclosed element",
      svg("<g>"),
      "The SVG is not well-formed XML: Expected </g> at offset 63.",
    ],
    [
      "a <style> inside <defs>",
      svg('<defs><style>path{fill:red}</style></defs><path d="M0 0"/>'),
      "A logo cannot hold the SVG's <style>.",
    ],
    [
      "an element named like an object's property",
      svg("<toString/>"),
      "A logo cannot hold the SVG's <toString>.",
    ],
    [
      "an element named __proto__",
      svg("<__proto__/>"),
      "A logo cannot hold the SVG's <__proto__>.",
    ],
    [
      "an entity named like an object's property",
      svg('<path d="M0 0" fill="&constructor;"/>'),
      "The SVG is not well-formed XML: &constructor; is not an entity XML predefines at offset 81.",
    ],
    [
      "a character reference XML does not allow",
      svg('<path d="M0 0" fill="&#0;"/>'),
      "The SVG is not well-formed XML: &#0; is not a character XML allows at offset 81.",
    ],
    [
      "elements nested too deep",
      svg("<g>".repeat(300) + "</g>".repeat(300)),
      "The SVG is not well-formed XML: Elements nest deeper than 256 at offset 828.",
    ],
    [
      "translate in style",
      svg('<path d="M0 0" style="translate: 10px 10px"/>'),
      "A logo cannot hold the SVG's translate on <path>.",
    ],
    ["rotate", svg('<g style="rotate:45deg"/>'), "A logo cannot hold the SVG's rotate on <g>."],
    ["scale", svg('<g style="scale:2"/>'), "A logo cannot hold the SVG's scale on <g>."],
    [
      "a radius in style",
      svg('<circle cx="4" cy="4" r="2" style="r:20px"/>'),
      "A logo cannot hold the SVG's r in the style of <circle>.",
    ],
    [
      "path data in style",
      svg("<path style=\"d:path('M0 0')\"/>"),
      "A logo cannot hold the SVG's d in the style of <path>.",
    ],
    [
      "a blend mode",
      svg('<path d="M0 0" style="mix-blend-mode:multiply"/>'),
      "A logo cannot hold the SVG's mix-blend-mode multiply on <path>.",
    ],
    [
      "an opacity that is not a number",
      svg('<path d="M0 0" fill-opacity="half"/>'),
      'fill-opacity "half" on <path> is not a number.',
    ],
    [
      "a stretched view box",
      svg(
        '<path d="M0 0"/>',
        'viewBox="0 0 10 10" width="100" height="50" preserveAspectRatio="none"',
      ),
      "A logo cannot hold the SVG's preserveAspectRatio none on <svg>.",
    ],
    [
      "a cropped view box",
      svg('<path d="M0 0"/>', 'viewBox="0 0 10 10" preserveAspectRatio="xMinYMin slice"'),
      "A logo cannot hold the SVG's preserveAspectRatio xMinYMin slice on <svg>.",
    ],
    [
      "a hidden root",
      svg('<path d="M0 0"/>', 'viewBox="0 0 4 4" style="display: none"'),
      "The SVG draws no shape.",
    ],
    [
      "coordinates past the largest number",
      svg('<rect x="1e308" width="1e308" height="1"/>'),
      "The coordinates of <rect> run past the largest number.",
    ],
  ];

  test.each(refusals)("refuses %s, naming it", (_, given, message) => {
    expect(() => readSvgLogo(given)).toThrow(new UnreadableSvgError(message));
    expect(() => readSvgLogo(given)).toThrow(UnreadableSvgError);
  });
});
