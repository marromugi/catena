import { expect, test } from "vitest";
import { iconGrid, iconNames, iconPathData, iconStroke } from "./index";

// Half the stroke on every side of the grid, so nothing is cut off at the edge.
const inside = (value: number) =>
  value >= iconStroke.width / 2 && value <= iconGrid - iconStroke.width / 2;

test.each(iconNames)("%s keeps its ink inside the grid", (name) => {
  const values = iconPathData[name].match(/-?[\d.]+/g)!.map(Number);

  expect(values.filter((value) => !inside(value))).toEqual([]);
});

const columns = [16, 20, 24, 48, 96];
const rowHeight = 112;
const nameWidth = 120;
const gap = 24;
const columnX = columns.map((_, index) =>
  columns.slice(0, index).reduce((x, size) => x + size + gap, nameWidth),
);
const sheetColumns = 3;
const columnWidth = columnX.at(-1)! + columns.at(-1)! + gap * 2;

function sheet(): string {
  const perColumn = Math.ceil(iconNames.length / sheetColumns);
  const rows = iconNames.map((name, index) => {
    const x = gap + Math.floor(index / perColumn) * columnWidth;
    const y = gap + (index % perColumn) * rowHeight;
    const icons = columns.map(
      (size, column) =>
        `<svg x="${x + columnX[column]!}" y="${y + (96 - size) / 2}" width="${size}" height="${size}" viewBox="0 0 ${iconGrid} ${iconGrid}"><path d="${iconPathData[name]}"/></svg>`,
    );
    return `<text x="${x}" y="${y + 52}" fill="#333" stroke="none">${name}</text>${icons.join("")}`;
  });
  const width = columnWidth * sheetColumns + gap;
  const height = gap * 2 + perColumn * rowHeight;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<g font-family="sans-serif" font-size="14">`,
    `<g fill="none" stroke="#1f1f1f" stroke-width="${iconStroke.width}" stroke-linecap="${iconStroke.linecap}" stroke-linejoin="${iconStroke.linejoin}">`,
    ...rows,
    `</g></g></svg>`,
    "",
  ].join("\n");
}

test("the sheet of every icon is drawn from the icons as they are", async () => {
  await expect(sheet()).toMatchFileSnapshot("sheet.svg");
});
