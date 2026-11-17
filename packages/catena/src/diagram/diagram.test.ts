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
