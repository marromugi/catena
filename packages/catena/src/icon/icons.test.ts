import { expect, test } from "vitest";
import {
  filledIconPaint,
  filledIconPathData,
  iconGrid,
  iconNames,
  iconPathData,
  iconStroke,
  type IconName,
} from "./index";

// Half the stroke on every side of the grid, so nothing is cut off at the edge.
const halfStroke = iconStroke["stroke-width"] / 2;
const outsideTheGrid = (pathData: string) =>
  pathData
    .match(/-?[\d.]+/g)!
    .map(Number)
    .filter((value) => value < halfStroke || value > iconGrid - halfStroke);

test("a coordinate is outside the grid when it leaves less than half the stroke to the edge", () => {
  expect(outsideTheGrid("M1 23 L12 12")).toEqual([]);
  expect(outsideTheGrid("M0.9 12 L12 23.1 L-12 5")).toEqual([0.9, 23.1, -12]);
});

test.each(iconNames)("%s keeps its ink inside the grid", (name) => {
  expect(outsideTheGrid(iconPathData[name])).toEqual([]);
});

test.each(Object.entries(filledIconPathData))("filled %s keeps its ink inside the grid", (_, d) => {
  const outside = d
    .match(/-?[\d.]+/g)!
    .map(Number)
    .filter((value) => value < 0 || value > iconGrid);
  expect(outside).toEqual([]);
});

/** Twice the signed area of each contour, from the points its steps end at. */
const windings = (pathData: string) =>
  pathData
    .split("M")
    .filter((contour) => contour.trim() !== "")
    .map((contour) => {
      const points = contour.split(/[LC]/).map((step) =>
        step
          .match(/-?[\d.]+/g)!
          .map(Number)
          .slice(-2),
      );
      return points.reduce((sum, [x = 0, y = 0], index) => {
        const [nextX = 0, nextY = 0] = points[(index + 1) % points.length] ?? [];
        return sum + x * nextY - nextX * y;
      }, 0);
    });

test("the filled clock's hands wind against its disc, so they are cut out under either fill rule", () => {
  const [disc = 0, hands = 0, ...rest] = windings(filledIconPathData.clock);
  expect(rest).toEqual([]);
  expect(Math.sign(disc) * Math.sign(hands)).toBe(-1);
});

test("IconName is only the names in the set", () => {
  // @ts-expect-error a name outside the set is not an IconName
  const notAnIcon: IconName = "not-an-icon";

  expect(iconNames).not.toContain(notAnIcon);
});

const columns = [12, 16, 20, 24, 48, 96];
const rowHeight = 112;
const nameWidth = 120;
const gap = 24;
const columnX = columns.map((_, index) =>
  columns.slice(0, index).reduce((x, size) => x + size + gap, nameWidth),
);
const sheetColumns = 3;
const columnWidth = columnX.at(-1)! + columns.at(-1)! + gap * 2;

const filledPaint = Object.entries(filledIconPaint)
  .map(([name, value]) => `${name}="${value}"`)
  .join(" ");
const sheetIcons = [
  ...iconNames.map((name) => ({ name, path: `<path d="${iconPathData[name]}"/>` })),
  ...Object.entries(filledIconPathData).map(([name, d]) => ({
    name: `${name} (filled)`,
    path: `<path d="${d}" fill="#1f1f1f" ${filledPaint}/>`,
  })),
];

function sheet(): string {
  const perColumn = Math.ceil(sheetIcons.length / sheetColumns);
  const rows = sheetIcons.map(({ name, path }, index) => {
    const x = gap + Math.floor(index / perColumn) * columnWidth;
    const y = gap + (index % perColumn) * rowHeight;
    const icons = columns.map(
      (size, column) =>
        `<svg x="${x + columnX[column]!}" y="${y + (96 - size) / 2}" width="${size}" height="${size}" viewBox="0 0 ${iconGrid} ${iconGrid}">${path}</svg>`,
    );
    return `<text x="${x}" y="${y + 52}" fill="#333" stroke="none">${name}</text>${icons.join("")}`;
  });
  const width = columnWidth * sheetColumns + gap;
  const height = gap * 2 + perColumn * rowHeight;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<g font-family="sans-serif" font-size="14">`,
    `<g stroke="#1f1f1f" ${Object.entries(iconStroke)
      .map(([name, value]) => `${name}="${value}"`)
      .join(" ")}>`,
    ...rows,
    `</g></g></svg>`,
    "",
  ].join("\n");
}

test("the sheet of every icon is drawn from the icons as they are", async () => {
  await expect(sheet()).toMatchFileSnapshot("sheet.svg");
});
