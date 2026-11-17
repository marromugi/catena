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

// Made-up shapes: catena's tests carry no real company's mark or colours.
const svg = (body: string, root = 'viewBox="0 0 48 48"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${body}</svg>`;

const ROUND = 'stroke-linecap="round" stroke-linejoin="round"';

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
  ];

  test.each(refusals)("refuses %s, naming it", (_, given, message) => {
    expect(() => readSvgLogo(given)).toThrow(new UnreadableSvgError(message));
    expect(() => readSvgLogo(given)).toThrow(UnreadableSvgError);
  });
});
