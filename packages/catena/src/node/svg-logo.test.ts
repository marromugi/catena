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
      fc.record(
        {
          pathData: text,
          paint: fc.constant("fill" as const),
          color,
          fillRule: fc.constant("evenodd" as const),
        },
        { requiredKeys: ["pathData", "paint", "color"] },
      ),
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
                ? element("path", {
                    d: s.pathData,
                    fill: s.color,
                    ...(s.fillRule === undefined ? {} : { "fill-rule": s.fillRule }),
                  })
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

  test("an even-odd fill is read from the attribute or style, inherited as other paint is, and only a fill takes it", () => {
    const logo = readSvgLogo(
      svg(
        `<g fill-rule="evenodd" stroke="blue" ${ROUND}>` +
          '<path d="M1 1"/>' +
          '<path d="M2 2" fill-rule="nonzero"/>' +
          '<g style="fill-rule: NonZero"><path d="M3 3" fill-rule="inherit"/></g>' +
          "</g>" +
          '<path d="M4 4" style="fill-rule:EVENODD" fill-rule="nonzero"/>' +
          '<path d="M5 5"/>',
      ),
    );

    expect(logo.shapes).toEqual([
      { pathData: "M1 1", paint: "fill", color: "black", fillRule: "evenodd" },
      { pathData: "M1 1", paint: "stroke", color: "blue", width: 1 },
      { pathData: "M2 2", paint: "fill", color: "black" },
      { pathData: "M2 2", paint: "stroke", color: "blue", width: 1 },
      { pathData: "M3 3", paint: "fill", color: "black" },
      { pathData: "M3 3", paint: "stroke", color: "blue", width: 1 },
      { pathData: "M4 4", paint: "fill", color: "black", fillRule: "evenodd" },
      { pathData: "M5 5", paint: "fill", color: "black" },
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
      ' transform="',
      "translate(",
      "rotate(",
      "scale(",
      "skewX(",
      "matrix(1 2 3 4 5 6)",
      ")",
      ",",
      " ",
      "-",
      ".",
      "0",
      "1",
      "1e999",
      "1e308",
      "e",
      "M",
      "m",
      "A",
      "a",
      "H",
      "v",
      "Z",
      "0 0",
      "1 0 0 1 1 1",
      ' d="',
      ' stroke="red" stroke-linecap="round" stroke-linejoin="round"',
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
      fc.tuple(fc.constant("fill-rule"), fc.constantFrom("evenodd", "nonzero", "inherit")),
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
    ["fill-rule", ["nonzero", "NONZERO", "inherit"], "even-odd"],
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
      "a transform in style",
      svg('<path d="M0 0" style="transform: none"/>'),
      "A logo cannot hold the SVG's transform in the style of <path>.",
    ],
    [
      "a transform in CSS units",
      svg('<g transform="rotate(45deg)"/>'),
      'transform "rotate(45deg)" on <g> is not a list of SVG transform functions.',
    ],
    [
      "a transform function given too many numbers",
      svg('<g transform="translate(1 2 3)"/>'),
      'transform "translate(1 2 3)" on <g> is not a list of SVG transform functions.',
    ],
    [
      "a transform list that starts with a comma",
      svg('<g transform=",scale(2)"/>'),
      'transform ",scale(2)" on <g> is not a list of SVG transform functions.',
    ],
    [
      "a transform function SVG does not name",
      svg('<g transform="Scale(2)"/>'),
      'transform "Scale(2)" on <g> is not a list of SVG transform functions.',
    ],
    [
      "a transform origin",
      svg('<g transform="scale(2)" transform-origin="5 5"/>'),
      "A logo cannot hold the SVG's transform-origin on <g>.",
    ],
    [
      "a transform box",
      svg('<path d="M0 0" transform="scale(2)" style="transform-box: fill-box"/>'),
      "A logo cannot hold the SVG's transform-box on <path>.",
    ],
    [
      "path data that is not path data, under a transform",
      svg('<path d="M0 0 X" transform="scale(2)"/>'),
      'd "M0 0 X" on <path> is not path data.',
    ],
    [
      "path data that does not start with a move, under a transform",
      svg('<path d="L1 1" transform="scale(2)"/>'),
      'd "L1 1" on <path> is not path data.',
    ],
    [
      "coordinates a transform takes past the largest number",
      svg('<path d="M1e300 0" transform="scale(1e300)"/>'),
      "The coordinates of <path> run past the largest number.",
    ],
    [
      "a stroke under a transform that scales one way more than the other",
      svg(`<g transform="scale(2 1)"><path d="M0 0" stroke="red" ${ROUND}/></g>`),
      "The stroke of <path> is under a transform that does not scale evenly in both directions; a logo's stroke-width is one number.",
    ],
    [
      "a stroke under a skew",
      svg(`<path d="M0 0" fill="none" stroke="red" ${ROUND} transform="skewX(10)"/>`),
      "The stroke of <path> is under a transform that does not scale evenly in both directions; a logo's stroke-width is one number.",
    ],
    [
      "a transform on the root",
      svg('<path d="M0 0"/>', 'viewBox="0 0 4 4" transform="translate(1)"'),
      "A logo cannot hold the SVG's transform on <svg>.",
    ],
    [
      "a transform that flattens the root",
      svg('<path d="M0 0"/>', 'viewBox="0 0 4 4" transform="scale(0)"'),
      "A logo cannot hold the SVG's transform on <svg>.",
    ],
    ...[
      "translate(,1 2)",
      "translate(1,,2)",
      "translate(1 2,)",
      "scale(,2)",
      "scale(2,,3)",
      "matrix(1 2 3 4 5)",
      "scale(1 2 3)",
      "scale()",
      "rotate(1 2)",
      "rotate(1 2 3 4)",
      "skewX(1 2)",
      "skewY()",
      "translate(1e999)",
    ].map(
      (transform) =>
        [
          `a transform of ${transform}`,
          svg(`<g transform="${transform}"/>`),
          `transform "${transform}" on <g> is not a list of SVG transform functions.`,
        ] as const,
    ),
    ...["M,1,,2", "M,1 2", "M1,,2", "M1 2,", "M1 2 L,3 4", "M0 0 A 1 1 0 0 1 2 2,,"].map(
      (d) =>
        [
          `path data ${d} with a comma SVG does not allow, under a transform`,
          svg(`<path d="${d}" transform="translate(1)"/>`),
          `d "${d}" on <path> is not path data.`,
        ] as const,
    ),
    [
      "a number past the largest in path data under a transform",
      svg('<path d="M 1e400 0 L 1 1" transform="scale(2)"/>'),
      "The coordinates of <path> run past the largest number.",
    ],
    [
      "a stroke under a matrix that keeps lengths but skews",
      svg(`<path d="M0 0" stroke="red" ${ROUND} transform="matrix(1 0 0.6 0.8 0 0)"/>`),
      "The stroke of <path> is under a transform that does not scale evenly in both directions; a logo's stroke-width is one number.",
    ],
    [
      "a stroke a transform widens past the largest number",
      svg(`<path d="M0 0" stroke="red" stroke-width="1e200" ${ROUND} transform="scale(1e200)"/>`),
      "The stroke-width of <path> runs past the largest number.",
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
      "a fill-rule of neither nonzero nor evenodd",
      svg('<path d="M0 0" style="fill-rule:odd"/>'),
      "A logo cannot hold the SVG's fill-rule odd on <path>.",
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

const pathUnder = (transform: string, d = "M 1 2") =>
  readSvgLogo(svg(`<path d="${d}" transform="${transform}"/>`)).shapes[0]?.pathData;

const turn = (degrees: number) => {
  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians), Math.sin(radians)] as const;
};

// The terms of M·Mᵀ for the matrix M taking the unit circle to an ellipse: two ellipses about the
// origin are one when these agree.
const outline = ([p, q, r, s]: readonly [number, number, number, number]) => [
  p * p + q * q,
  p * r + q * s,
  r * r + s * s,
];

const strokeUnder = (transform: string) =>
  readSvgLogo(
    svg(
      `<path d="M0 0 L1 0" fill="none" stroke="red" stroke-width="3" ${ROUND} transform="${transform}"/>`,
    ),
  ).shapes[0];

/** Every number in path data, in order. */
const numbersIn = (pathData: string | undefined) =>
  (pathData?.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) ?? []).map(Number);

const near = (found: readonly number[], expected: readonly number[]) =>
  found.length === expected.length &&
  found.every((value, i) => {
    const other = expected[i] ?? Number.NaN;
    return Math.abs(value - other) <= 1e-9 * Math.max(1, Math.abs(value), Math.abs(other));
  });

type Matrix = readonly [number, number, number, number, number, number];

const apply = ([a, b, c, d, e, f]: Matrix, x: number, y: number) =>
  [a * x + c * y + e, b * x + d * y + f] as const;

const coordinate = fc.integer({ min: -50, max: 50 });

const scaling = fc
  .tuple(fc.double({ min: 0.1, max: 4, noNaN: true }), fc.boolean())
  .map(([size, mirrored]) => (mirrored ? -size : size));

/** The linear part `a b c d` of a matrix that flattens nothing: a scale each way, a shear, a turn. */
const invertible = fc
  .tuple(
    fc.double({ min: -360, max: 360, noNaN: true }),
    fc.double({ min: -2, max: 2, noNaN: true }),
    scaling,
    scaling,
  )
  .map(([degrees, shear, across, down]) => {
    const [cos, sin] = turn(degrees);
    return [
      cos * across,
      sin * across,
      cos * shear - sin * down,
      sin * shear + cos * down,
    ] as const;
  });

/** An absolute path segment, its points as written: `H` and `V` hold one number, `Z` none. */
interface Segment {
  readonly command: string;
  readonly numbers: readonly number[];
}

const segment: fc.Arbitrary<Segment> = fc.oneof(
  ...(
    [
      ["L", 2],
      ["C", 6],
      ["S", 4],
      ["Q", 4],
      ["T", 2],
      ["H", 1],
      ["V", 1],
      ["M", 2],
    ] as const
  ).map(([command, count]) =>
    fc.array(coordinate, { minLength: count, maxLength: count }).map((numbers) => ({
      command,
      numbers,
    })),
  ),
  fc
    .tuple(coordinate, coordinate)
    .map(([x, y]) => ({ command: "A", numbers: [0, 0, 0, 0, 1, x, y] })),
  fc.constant({ command: "Z", numbers: [] }),
);

/** The segments written absolute, and written relative to where each one starts. */
function absoluteAndRelative(start: readonly [number, number], segments: readonly Segment[]) {
  const absolute = [`M ${start.join(" ")}`];
  const relative = [`m ${start.join(" ")}`];
  let [x, y] = start;
  let [startX, startY] = start;
  for (const { command, numbers } of segments) {
    absolute.push(`${command} ${numbers.join(" ")}`.trim());
    const from = command === "A" ? 5 : 0;
    const shifted = numbers.map((n, i) => {
      if (command === "H") return n - x;
      if (command === "V") return n - y;
      return i < from ? n : n - ((i - from) % 2 === 0 ? x : y);
    });
    relative.push(`${command.toLowerCase()} ${shifted.join(" ")}`.trim());
    if (command === "Z") [x, y] = [startX, startY];
    else if (command === "H") x = numbers[0] ?? 0;
    else if (command === "V") y = numbers[0] ?? 0;
    else [x, y] = [numbers.at(-2) ?? 0, numbers.at(-1) ?? 0];
    if (command === "M") [startX, startY] = [x, y];
  }
  return { absolute: absolute.join(" "), relative: relative.join(" ") };
}

/** The points the segments pass, `H` and `V` as the full point, each under `matrix`. */
function pointsUnder(
  matrix: Matrix,
  start: readonly [number, number],
  segments: readonly Segment[],
): number[] {
  const points: number[] = [...apply(matrix, ...start)];
  let [x, y] = start;
  let [startX, startY] = start;
  for (const { command, numbers } of segments) {
    if (command === "Z") {
      [x, y] = [startX, startY];
      continue;
    }
    const pairs =
      command === "H"
        ? [numbers[0] ?? 0, y]
        : command === "V"
          ? [x, numbers[0] ?? 0]
          : command === "A"
            ? numbers.slice(5)
            : numbers;
    for (let i = 0; i < pairs.length; i += 2) {
      points.push(...apply(matrix, pairs[i] ?? 0, pairs[i + 1] ?? 0));
    }
    [x, y] = [pairs.at(-2) ?? 0, pairs.at(-1) ?? 0];
    if (command === "M") [startX, startY] = [x, y];
  }
  return points;
}

describe("readSvgLogo with transforms", () => {
  test.each([
    ["", "M 1 2"],
    ["translate(5)", "M 6 2"],
    ["translate(5 -1)", "M 6 1"],
    ["scale(2)", "M 2 4"],
    ["scale(2, 3)", "M 2 6"],
    ["rotate(90)", "M -2 1"],
    ["rotate(90 1 0)", "M -1 0"],
    ["rotate(-270)", "M -2 1"],
    ["skewX(45)", "M 3 2"],
    ["skewY(45)", "M 1 3"],
    ["matrix(1 2 3 4 5 6)", "M 12 16"],
    ["matrix(1,2,3,4,5,6)", "M 12 16"],
    ["translate(10) scale(2)", "M 12 4"],
    ["scale(2) translate(10)", "M 22 4"],
    ["translate(10),scale(2)", "M 12 4"],
    ["translate(10)scale(2)", "M 12 4"],
    ["translate(10-5)", "M 11 -3"],
    [" translate( 10 , 1 ) ", "M 11 3"],
  ])("transform %j places M 1 2 at %s", (transform, expected) => {
    expect(pathUnder(transform)).toBe(expected);
  });

  test("a group's transform applies after its shape's own", () => {
    const nested =
      '<g transform="translate(10 20)"><rect transform="scale(2)" width="3" height="4"/></g>';
    const listed = '<rect transform="translate(10 20) scale(2)" width="3" height="4"/>';
    expect(readSvgLogo(svg(nested)).shapes[0]?.pathData).toBe("M 10 20 L 16 20 L 16 28 L 10 28 Z");
    expect(readSvgLogo(svg(listed)).shapes[0]?.pathData).toBe("M 10 20 L 16 20 L 16 28 L 10 28 Z");
  });

  test("relative commands, H and V become absolute, each from where the last one ended", () => {
    expect(pathUnder("translate(10 0)", "m1 1 h2 v2 l-1 0 z m 5 5 l1 1 H 0 V 0")).toBe(
      "M 11 1 L 13 1 L 13 3 L 12 3 Z M 16 6 L 17 7 L 10 7 L 10 0",
    );
    expect(pathUnder("translate(10 0)", "M0 0 1 1 m1 1 2 2")).toBe("M 10 0 L 11 1 M 12 2 L 14 4");
    expect(pathUnder("translate(10 0)", "M0 0c1 1 2 2 3 3s1 1 2 2q1 1 2 2t1 1")).toBe(
      "M 10 0 C 11 1 12 2 13 3 S 14 4 15 5 Q 16 6 17 7 T 18 8",
    );
  });

  test("an arc keeps its flags, follows the transform, and turns its sweep under a mirror", () => {
    expect(pathUnder("translate(5 0)", "M0 0 a1 1 0 012 0")).toBe("M 5 0 A 1 1 0 0 1 7 0");
    expect(pathUnder("scale(3 1)", "M2 0 A 2 2 0 1 1 -2 0")).toBe("M 6 0 A 6 2 0 1 1 -6 0");
    expect(pathUnder("scale(1 -1)", "M0 0 A 2 1 0 1 1 2 0")).toBe("M 0 0 A 2 1 0 1 0 2 0");
    expect(pathUnder("rotate(30)", "M0 0 A 0 2 0 1 1 2 0")).toBe(
      `M 0 0 L ${Math.cos(Math.PI / 6) * 2} ${Math.sin(Math.PI / 6) * 2}`,
    );
  });

  test("an arc under any transform runs along the ellipse the transform makes of the file's", () => {
    const radius = fc.double({ min: 0.1, max: 10, noNaN: true });
    fc.assert(
      fc.property(
        invertible,
        radius,
        radius,
        fc.double({ min: -360, max: 360, noNaN: true }),
        ([a, b, c, d], rx, ry, degrees) => {
          const read = pathUnder(
            `matrix(${a} ${b} ${c} ${d} 0 0)`,
            `M0 0 A ${rx} ${ry} ${degrees} 0 1 10 0`,
          );
          const [command, toRx, toRy, turned, large, sweep] = (read ?? "").split(" ").slice(3);
          expect(command).toBe("A");
          const [cos, sin] = turn(degrees);
          const [toCos, toSin] = turn(Number(turned));
          const file = outline([
            (a * cos + c * sin) * rx,
            (c * cos - a * sin) * ry,
            (b * cos + d * sin) * rx,
            (d * cos - b * sin) * ry,
          ]);
          const R1 = Number(toRx);
          const R2 = Number(toRy);
          const logo = outline([toCos * R1, -toSin * R2, toSin * R1, toCos * R2]);
          const size = Math.max(...file.map(Math.abs));
          file.forEach((value, i) => {
            expect(Math.abs(value - (logo[i] ?? 0))).toBeLessThan(1e-9 * size);
          });
          expect(large).toBe("0");
          expect(sweep).toBe(a * d - b * c < 0 ? "0" : "1");
        },
      ),
    );
  });

  test("a stroke under an even scale takes the scale into its width, turned or mirrored", () => {
    expect(strokeUnder("scale(2)")).toMatchObject({ paint: "stroke", width: 6 });
    expect(strokeUnder("scale(-2 2)")).toMatchObject({ paint: "stroke", width: 6 });
    const turned = strokeUnder("rotate(30) scale(0.5)");
    expect(turned?.paint === "stroke" ? turned.width : undefined).toBeCloseTo(1.5, 12);
  });

  test("what a transform flattens to nothing is left out, before what it holds is read", () => {
    expect(paths('<g transform="scale(0)"><path d="M0 0"/><text/></g>')).toEqual(["M9 9"]);
    expect(paths('<path d="M0 0" transform="matrix(1 2 2 4 0 0)"/>')).toEqual(["M9 9"]);
    expect(paths('<path d="M0 0" stroke="red" transform="scale(1 0)"/>')).toEqual(["M9 9"]);
  });

  test("quarter turns and eighth-turn skews are exact", () => {
    expect(pathUnder("rotate(270)")).toBe("M 2 -1");
    expect(pathUnder("skewX(45)", "M 0 3")).toBe("M 3 3");
    expect(pathUnder("skewX(-45)")).toBe("M -1 2");
    expect(pathUnder("skewX(135)")).toBe("M -1 2");
    expect(pathUnder("skewY(-45)")).toBe("M 1 1");
  });

  test("an arc with a zero radius becomes its line, and a relative arc ends from where it starts", () => {
    expect(pathUnder("scale(2)", "M0 0 A 2 0 0 1 1 2 0")).toBe("M 0 0 L 4 0");
    expect(pathUnder("translate(5 0)", "M1 1 a1 1 0 0 1 2 0")).toBe("M 6 1 A 1 1 0 0 1 8 1");
  });

  test("path data under a matrix passes the file's points under that matrix, absolute or relative", () => {
    const matrix = fc
      .tuple(invertible, coordinate, coordinate)
      .map(([[a, b, c, d], e, f]): Matrix => [a, b, c, d, e, f]);
    fc.assert(
      fc.property(
        matrix,
        fc.tuple(coordinate, coordinate),
        fc.array(segment, { maxLength: 8 }),
        (given, start, segments) => {
          const expected = pointsUnder(given, start, segments);
          const transform = `matrix(${given.join(" ")})`;
          for (const pathData of Object.values(absoluteAndRelative(start, segments))) {
            const found = numbersIn(pathUnder(transform, pathData)?.replaceAll(/A( \S+){5}/g, "A"));
            expect(near(found, expected)).toBe(true);
          }
        },
      ),
    );
  });

  test("a transform list places a point as the same functions on nested groups, and as their product", () => {
    const degrees = fc.integer({ min: -720, max: 720 });
    const one: fc.Arbitrary<{ text: string; matrix: Matrix }> = fc.oneof(
      fc.tuple(coordinate, coordinate).map(([x, y]) => ({
        text: `translate(${x} ${y})`,
        matrix: [1, 0, 0, 1, x, y] as const,
      })),
      fc.tuple(fc.integer({ min: 1, max: 4 }), fc.integer({ min: -4, max: -1 })).map(([x, y]) => ({
        text: `scale(${x} ${y})`,
        matrix: [x, 0, 0, y, 0, 0] as const,
      })),
      degrees.map((n) => {
        const [cos, sin] = turn(n);
        return { text: `rotate(${n})`, matrix: [cos, sin, -sin, cos, 0, 0] as const };
      }),
      fc.integer({ min: -80, max: 80 }).map((n) => ({
        text: `skewX(${n})`,
        matrix: [1, 0, Math.tan((n * Math.PI) / 180), 1, 0, 0] as const,
      })),
      fc.integer({ min: -80, max: 80 }).map((n) => ({
        text: `skewY(${n})`,
        matrix: [1, Math.tan((n * Math.PI) / 180), 0, 1, 0, 0] as const,
      })),
    );
    fc.assert(
      fc.property(
        fc.array(one, { minLength: 1, maxLength: 4 }),
        coordinate,
        coordinate,
        (list, x, y) => {
          const point = `<path d="M ${x} ${y}"/>`;
          const listed = readSvgLogo(
            svg(`<g transform="${list.map((f) => f.text).join(" ")}">${point}</g>`),
          ).shapes[0]?.pathData;
          const nested = readSvgLogo(
            svg(list.reduceRight((inner, f) => `<g transform="${f.text}">${inner}</g>`, point)),
          ).shapes[0]?.pathData;
          const expected = list.reduceRight<readonly number[]>(
            ([px = 0, py = 0], f) => apply(f.matrix, px, py),
            [x, y],
          );
          expect(near(numbersIn(listed), expected)).toBe(true);
          expect(near(numbersIn(nested), expected)).toBe(true);
        },
      ),
    );
  });

  test("a transform that changes nothing gives the logo no transform gives", () => {
    const identity = fc.constantFrom(
      "",
      "translate(0)",
      "translate(0 0)",
      "scale(1)",
      "rotate(0)",
      "rotate(360)",
      "rotate(720 5 5)",
      "rotate(90) rotate(-90)",
      "rotate(90 5 5) rotate(-90 5 5)",
      "skewX(0)",
      "skewY(180)",
      "skewX(360)",
      "matrix(1 0 0 1 0 0)",
      "translate(3) translate(-3)",
      "scale(2) scale(0.5)",
    );
    const d = fc.constantFrom(
      "M0 0",
      "m1 1 h2 v2 l-1 0 z",
      "M0 0 A 1 1 0 0 1 2 0",
      "m 1 2 a 2 2 0 012 0",
      "M1 1 H 5 V 3",
    );
    const paint = fc.constantFrom(
      `fill="none" stroke="red" stroke-width="3" ${ROUND}`,
      'fill="blue"',
      "",
    );
    fc.assert(
      fc.property(identity, identity, d, paint, (onGroup, onShape, pathData, given) => {
        const shape = (transform: string) => `<path d="${pathData}" ${given}${transform}/>`;
        expect(
          readSvgLogo(svg(`<g transform="${onGroup}">${shape(` transform="${onShape}"`)}</g>`)),
        ).toEqual(readSvgLogo(svg(`<g>${shape("")}</g>`)));
      }),
    );
  });

  test("the CSS translate, rotate and scale stay refused as attributes too", () => {
    expect(() => readSvgLogo(svg('<path d="M0 0" rotate="45"/>'))).toThrow(
      new UnreadableSvgError("A logo cannot hold the SVG's rotate on <path>."),
    );
  });
});
