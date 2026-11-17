import { describe, expect, test } from "vitest";
import { drawEdge } from "../edge";
import type { Layout, Rect } from "../layout";
import { writeSvg, type Node } from "../node";
import { placeGraph } from "../place";
import { DEFAULT_DOT_GRID, DEFAULT_EDGE_PAINT, drawDiagram } from "./index";

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
      }),
    ).toBe(drawDiagram(layout, nodes));
  });

  test("refuses a dot radius below 0 or a spacing of 0 or less", () => {
    expect(() => drawDiagram(layout, nodes, { background: { dotRadius: -1 } })).toThrow(RangeError);
    expect(() => drawDiagram(layout, nodes, { background: { spacing: 0 } })).toThrow(RangeError);
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

  test("paints and shapes the edges as the options say", () => {
    const paths = layout.edges.map((edge) => writeSvg(drawEdge(edge, { radius: 0 }))).join("");
    expect(
      drawDiagram(layout, nodes, { edgePaint: { stroke: "#123456" }, edge: { radius: 0 } }),
    ).toContain(`<g fill="none" stroke="#123456" stroke-width="1.5">${paths}</g>`);
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
