import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import { iconPathData } from "../icon";
import type { PlacedEdge, Point } from "../layout";
import { defineTheme, UnknownIconError, UnknownLogoError, type OwnIcon } from "../node";
import { writeSvg } from "../svg";
import { Typeface } from "../text";
import {
  DEFAULT_EDGE_RADIUS,
  EDGE_END_RADIUS,
  EDGE_ICON_RADIUS,
  EDGE_ICON_SIZE,
  drawEdge,
  drawEdgeEnd,
  drawEdgeIcon,
} from "./index";

const edgeAlong = (...points: [Point, Point, ...Point[]]): PlacedEdge => ({
  id: "e",
  from: "a",
  to: "b",
  points,
  labels: [],
});

const pathOf = (edge: PlacedEdge, radius?: number) =>
  writeSvg(drawEdge(edge, radius === undefined ? {} : { radius }));

describe("drawEdge", () => {
  const corner = edgeAlong({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 });

  test("rounds a bend by the default radius when none is given", () => {
    expect(DEFAULT_EDGE_RADIUS).toBe(8);
    expect(pathOf(corner)).toBe('<path d="M 0 0 L 92 0 A 8 8 0 0 1 100 8 L 100 50" fill="none"/>');
  });

  test("rounds a bend by the radius given", () => {
    expect(pathOf(corner, 20)).toBe(
      '<path d="M 0 0 L 80 0 A 20 20 0 0 1 100 20 L 100 50" fill="none"/>',
    );
  });

  test("draws sharp bends for a radius of 0", () => {
    expect(pathOf(corner, 0)).toBe('<path d="M 0 0 L 100 0 L 100 50" fill="none"/>');
  });

  test("gives each bend at most half of a stretch between two bends", () => {
    const step = edgeAlong(
      { x: 0, y: 20 },
      { x: 100, y: 20 },
      { x: 100, y: 30 },
      { x: 200, y: 30 },
    );
    expect(pathOf(step)).toBe(
      '<path d="M 0 20 L 95 20 A 5 5 0 0 1 100 25 A 5 5 0 0 0 105 30 L 200 30" fill="none"/>',
    );
    const hook = edgeAlong(
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 0, y: 30 },
      { x: 0, y: 60 },
    );
    expect(pathOf(hook)).toBe(
      '<path d="M 0 0 L 32 0 A 8 8 0 0 1 40 8 L 40 22 A 8 8 0 0 1 32 30 L 8 30 A 8 8 0 0 0 0 38 L 0 60" fill="none"/>',
    );
  });

  test("gives a bend all of a stretch at an end", () => {
    const short = edgeAlong({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 50 });
    expect(pathOf(short)).toBe('<path d="M 0 0 A 3 3 0 0 1 3 3 L 3 50" fill="none"/>');
    const lastStretchShorter = edgeAlong({ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 });
    expect(pathOf(lastStretchShorter)).toBe('<path d="M 0 0 L 2 0 A 4 4 0 0 1 6 4" fill="none"/>');
  });

  test("goes straight through a point that is not a bend", () => {
    const straight = edgeAlong({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 0 }, { x: 100, y: 0 });
    expect(pathOf(straight)).toBe('<path d="M 0 0 L 100 0" fill="none"/>');
  });

  test("turns each way at bends away from the origin", () => {
    const upThenRight = edgeAlong({ x: 10, y: 50 }, { x: 10, y: 20 }, { x: 60, y: 20 });
    expect(pathOf(upThenRight)).toBe(
      '<path d="M 10 50 L 10 28 A 8 8 0 0 1 18 20 L 60 20" fill="none"/>',
    );
    const leftThenDown = edgeAlong({ x: 60, y: 20 }, { x: 10, y: 20 }, { x: 10, y: 50 });
    expect(pathOf(leftThenDown)).toBe(
      '<path d="M 60 20 L 18 20 A 8 8 0 0 0 10 28 L 10 50" fill="none"/>',
    );
  });

  test("draws sharp a bend that is not between a horizontal and a vertical stretch", () => {
    const slanted = edgeAlong({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 100 });
    expect(pathOf(slanted)).toBe('<path d="M 0 0 L 100 0 L 200 100" fill="none"/>');
    const diagonal = edgeAlong({ x: 0, y: 0 }, { x: 3, y: 1 }, { x: 9, y: 3 }, { x: 9, y: 50 });
    expect(pathOf(diagonal)).toBe('<path d="M 0 0 L 3 1 L 9 3 L 9 50" fill="none"/>');
    const peak = edgeAlong({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 });
    expect(pathOf(peak)).toBe('<path d="M 0 0 L 10 10 L 20 0" fill="none"/>');
  });

  test("draws sharp a point where the path turns back on itself", () => {
    const back = edgeAlong({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 });
    expect(pathOf(back)).toBe('<path d="M 0 0 L 100 0 L 50 0" fill="none"/>');
  });

  test("goes straight through a point on a vertical stretch", () => {
    const down = edgeAlong({ x: 5, y: 10 }, { x: 5, y: 30 }, { x: 5, y: 60 });
    expect(pathOf(down)).toBe('<path d="M 5 10 L 5 60" fill="none"/>');
  });

  test("drops a repeated point at an end", () => {
    const repeated = edgeAlong(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 100, y: 50 },
    );
    expect(pathOf(repeated)).toBe(pathOf(corner));
    const repeatedAtBend = edgeAlong(
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    );
    expect(pathOf(repeatedAtBend)).toBe(pathOf(corner));
    expect(pathOf(edgeAlong({ x: 1, y: 1 }, { x: 1, y: 1 }))).toBe('<path d="M 1 1" fill="none"/>');
  });

  test("refuses a negative radius or none at all", () => {
    expect(() => drawEdge(corner, { radius: -1 })).toThrow(RangeError);
    expect(() => drawEdge(corner, { radius: Number.NaN })).toThrow(RangeError);
  });
});

describe("drawEdgeEnd", () => {
  test("centres an unpainted circle 4 round on the point", () => {
    expect(EDGE_END_RADIUS).toBe(4);
    expect(writeSvg(drawEdgeEnd({ x: 10, y: 0.5 }))).toBe('<circle cx="10" cy="0.5" r="4"/>');
  });
});

describe("drawEdgeIcon", () => {
  const require = createRequire(import.meta.url);
  const inter = (weight: 400 | 700) =>
    Typeface.read(
      readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`)),
    );
  const fonts = { regular: [inter(400)], bold: [inter(700)] } as const;
  const cross: OwnIcon = {
    pathData: "M 4 4 L 44 44",
    viewBox: { x: 0, y: 0, width: 48, height: 48 },
    paint: "stroke",
  };
  const theme = defineTheme(fonts, { icon: { color: "#123456" }, icons: { cross } });
  const at = { x: 100, y: 50 };

  test("centres an unpainted circle 11 round on the point, with the icon 14 across in its middle", () => {
    expect([EDGE_ICON_RADIUS, EDGE_ICON_SIZE]).toEqual([11, 14]);
    expect(writeSvg(drawEdgeIcon(at, "plus", theme))).toBe(
      '<g><circle cx="100" cy="50" r="11"/>' +
        `<path d="${iconPathData.plus}" transform="translate(93 43) scale(0.5833333333333334)" ` +
        'fill="none" stroke-width="2.571428571428571" stroke-linecap="round" stroke-linejoin="round" ' +
        'stroke="#123456"/></g>',
    );
  });

  test("draws a built-in icon in the colour a node's icon gives it", () => {
    const spark = defineTheme(fonts, { icon: { colors: { spark: "#abcdef" } } });
    expect(writeSvg(drawEdgeIcon(at, "spark", spark))).toContain('stroke="#abcdef"');
  });

  test("draws a custom icon named by the theme as the same icon given inline", () => {
    expect(writeSvg(drawEdgeIcon(at, "cross", theme))).toBe(
      writeSvg(drawEdgeIcon(at, cross, theme)),
    );
    expect(writeSvg(drawEdgeIcon(at, cross, theme))).toContain('d="M 4 4 L 44 44"');
  });

  test("refuses a name neither built in nor custom, and a logo the theme does not hold", () => {
    expect(() => drawEdgeIcon(at, "nowhere", theme)).toThrow(UnknownIconError);
    expect(() => drawEdgeIcon(at, { logo: "nowhere" }, theme)).toThrow(UnknownLogoError);
  });
});
