import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { sourceHanSansJP } from "@catena/font-source-han-sans";
import { describe, expect, test } from "vitest";
import type { PlacedNode, Rect } from "../layout";
import { placeGraph, type Cell, type GraphNode, type Group } from "../place";
import { Typeface } from "../text";
import {
  activeRoundButton,
  badge,
  bodyText,
  buildNode,
  defineTheme,
  frame,
  iconTile,
  iconTitleBodyCard,
  iconTitleCard,
  iconTitleCardPair,
  imageTitleBodyCard,
  redBadge,
  roundButton,
  selectedIconTile,
  statusTitleCard,
  titleBadgeCard,
  titleBodyBadgeCard,
  titleBodyCard,
  titleBodyItemsSectionCard,
  type Node,
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
const theme = defineTheme(fonts);

// The text of the picture on #20.
const TITLE = "ここで LLM を使う";
const BODY = "サンプルの文章".repeat(15);
const IMAGE_HREF = "sunset.png";

/** The picture's card holding only body text, made by a user from the parts. */
const bodyCard = frame(bodyText);

/** Every node in the picture on #20, built from its kind, by id. */
function pictureNodes(): ReadonlyMap<string, Node> {
  const nodes = [
    buildNode(imageTitleBodyCard, theme, "image-card", {
      image: IMAGE_HREF,
      title: TITLE,
      body: BODY,
    }),
    buildNode(titleBodyItemsSectionCard, theme, "section-card", {
      title: TITLE,
      body: BODY,
      items: [TITLE, TITLE],
      section: { heading: "セクション名", items: [TITLE, TITLE] },
    }),
    buildNode(iconTile, theme, "service-tile", {
      icon: "service",
      label: { caption: "Service 1" },
    }),
    buildNode(iconTile, theme, "claude-tile", {
      icon: "spark",
      label: { caption: "Claude", subcaption: "LLM" },
    }),
    buildNode(selectedIconTile, theme, "selected-tile", { icon: "spark" }),
    buildNode(roundButton, theme, "plus-button", "plus"),
    buildNode(activeRoundButton, theme, "info-button", "info"),
    buildNode(badge, theme, "plain-badge", "Badge"),
    buildNode(redBadge, theme, "red-badge", "Badge"),
    buildNode(titleBodyBadgeCard, theme, "badge-body-card", {
      title: TITLE,
      body: BODY,
      badge: "Badge",
    }),
    buildNode(iconTitleCardPair, theme, "pair", {
      first: { icon: "spark", title: TITLE },
      second: { icon: "spark", title: TITLE },
    }),
    buildNode(titleBodyCard, theme, "body-card", { title: TITLE, body: BODY }),
    buildNode(titleBadgeCard, theme, "title-card", { title: TITLE }),
    buildNode(bodyCard, theme, "plain-body-card", BODY),
    buildNode(titleBadgeCard, theme, "badge-card", { title: TITLE, badge: "Badge" }),
    buildNode(iconTitleCard, theme, "icon-card", { icon: "spark", title: TITLE }),
    buildNode(statusTitleCard, theme, "status-card", { status: "red", title: TITLE }),
    buildNode(iconTitleBodyCard, theme, "icon-body-card", {
      icon: "spark",
      text: { title: TITLE, body: BODY },
    }),
  ];
  return new Map(nodes.map((node) => [node.leaf.id, node]));
}

const SPACING = { nodeGap: 32, padding: 16, edgeToNode: 8, edgeGap: 8, minSegment: 8 };

type Nodes = readonly [GraphNode, ...GraphNode[]];

/** `nodes`, each in the cell `cellOf` gives for its place in the list. */
function inCells([first, ...rest]: Nodes, cellOf: (index: number) => Cell): Nodes {
  return [
    { ...first, cell: cellOf(0) },
    ...rest.map((node, index) => ({ ...node, cell: cellOf(index + 1) })),
  ];
}

const inColumn = (id: string, ...children: Nodes): Group => ({
  id,
  direction: "down",
  children: inCells(children, (row) => ({ row, column: 0 })),
});

const inRow = (id: string, ...children: Nodes): Group => ({
  id,
  direction: "right",
  children: inCells(children, (column) => ({ row: 0, column })),
});

/** The nodes in groups that roughly follow the picture's columns and rows. */
function pictureGraph(nodes: ReadonlyMap<string, Node>): Nodes {
  const leaf = (id: string) => {
    const node = nodes.get(id);
    if (node === undefined) throw new Error(`No node "${id}".`);
    return node.leaf;
  };
  return inCells(
    [
      inColumn("left", leaf("image-card"), leaf("section-card")),
      inColumn(
        "middle",
        inRow(
          "tiles",
          leaf("service-tile"),
          leaf("claude-tile"),
          leaf("selected-tile"),
          inColumn("buttons", leaf("plus-button"), leaf("info-button")),
          inColumn("badges", leaf("plain-badge"), leaf("red-badge")),
        ),
        leaf("badge-body-card"),
      ),
      inColumn(
        "right",
        leaf("pair"),
        inRow(
          "columns",
          inColumn("plain-cards", leaf("body-card"), leaf("title-card"), leaf("plain-body-card")),
          inColumn(
            "icon-cards",
            leaf("badge-card"),
            leaf("icon-card"),
            leaf("status-card"),
            leaf("icon-body-card"),
          ),
        ),
      ),
    ],
    (column) => ({ row: 0, column }),
  );
}

function leavesOf(placed: readonly PlacedNode[]): PlacedNode[] {
  return placed.flatMap((node) => (node.children.length === 0 ? [node] : leavesOf(node.children)));
}

/** Every node of the picture placed by `placeGraph` and drawn at its box, in one SVG document. */
function drawPicture() {
  const nodes = pictureNodes();
  const layout = placeGraph({ direction: "right", nodes: pictureGraph(nodes), edges: [] }, SPACING);
  const drawn = leavesOf(layout.nodes).map(({ id, box }) => {
    const node = nodes.get(id);
    if (node === undefined) throw new Error(`placeGraph placed an unknown node "${id}".`);
    return { id, box, svg: node.draw(box) };
  });
  const document =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">` +
    `<rect width="${layout.width}" height="${layout.height}" fill="#f4f4f4"/>` +
    drawn.map(({ svg }) => svg).join("") +
    "</svg>";
  return { nodes, drawn, document };
}

const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const numbers = (text: string) => Array.from(text.matchAll(NUMBER), ([n]) => Number(n));

/**
 * The area the shapes in `svg` cover: rectangles, circles, lines, images, and paths whose data is
 * absolute M, L, Q, C and Z commands, as glyphs and icons are, so a curve stays inside its points. What
 * sits in a `<clipPath>` or a `<filter>` is not drawn itself and is left out.
 */
function shapesArea(svg: string): Rect {
  const shown = svg.replaceAll(/<(clipPath|filter)\b.*?<\/\1>/g, "");
  const xs: number[] = [];
  const ys: number[] = [];
  const cover = (x0: number, y0: number, x1: number, y1: number) => {
    xs.push(x0, x1);
    ys.push(y0, y1);
  };
  for (const [, name = "", written = ""] of shown.matchAll(/<(\w+)([^>]*?)\/?>/g)) {
    const at = Object.fromEntries(
      Array.from(written.matchAll(/([\w:-]+)="([^"]*)"/g), ([, key, value]) => [key, value]),
    );
    const n = (key: string) => Number(at[key] ?? 0);
    if (name === "rect" || name === "image") {
      cover(n("x"), n("y"), n("x") + n("width"), n("y") + n("height"));
    } else if (name === "circle") {
      cover(n("cx") - n("r"), n("cy") - n("r"), n("cx") + n("r"), n("cy") + n("r"));
    } else if (name === "line") {
      const half = n("stroke-width") / 2;
      cover(
        Math.min(n("x1"), n("x2")),
        Math.min(n("y1"), n("y2")) - half,
        Math.max(n("x1"), n("x2")),
        Math.max(n("y1"), n("y2")) + half,
      );
    } else if (name === "path") {
      const [dx = 0, dy = 0, scale = 1] = numbers(at.transform ?? "");
      const half = at.stroke === undefined ? 0 : (n("stroke-width") * scale) / 2;
      const points = numbers(at.d ?? "");
      for (let i = 0; i + 1 < points.length; i += 2) {
        const x = dx + (points[i] ?? 0) * scale;
        const y = dy + (points[i + 1] ?? 0) * scale;
        cover(x - half, y - half, x + half, y + half);
      }
    }
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** The regions of the filters drawing shadows in `svg`, which hold all a shadow reaches. */
function shadowRegions(svg: string): Rect[] {
  return Array.from(svg.matchAll(/<filter [^>]*>/g), ([tag]) => {
    const n = (key: string) => Number(new RegExp(` ${key}="([^"]*)"`).exec(tag)?.[1]);
    return { x: n("x"), y: n("y"), width: n("width"), height: n("height") };
  });
}

const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x - 1e-9 &&
  inner.y >= outer.y - 1e-9 &&
  inner.x + inner.width <= outer.x + outer.width + 1e-9 &&
  inner.y + inner.height <= outer.y + outer.height + 1e-9;

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("every node kind in the picture on #20, drawn through placeGraph", () => {
  const { nodes, drawn, document } = drawPicture();

  test("places every node", () => {
    expect(drawn.map(({ id }) => id).toSorted()).toEqual([...nodes.keys()].toSorted());
  });

  test("draws every node inside its box", () => {
    for (const { id, box, svg } of drawn) {
      expect({ id, inside: inside(shapesArea(svg), box) }).toEqual({ id, inside: true });
    }
  });

  test("draws no two nodes over each other", () => {
    for (const [index, a] of drawn.entries()) {
      for (const b of drawn.slice(index + 1)) {
        expect({ a: a.id, b: b.id, overlap: overlap(a.box, b.box) }).toEqual({
          a: a.id,
          b: b.id,
          overlap: false,
        });
      }
    }
  });

  test("draws a shadow under every card, and none under the buttons and badges", () => {
    const flat = new Set(["plus-button", "info-button", "plain-badge", "red-badge"]);
    for (const { id, svg } of drawn) {
      expect({ id, shadowed: shadowRegions(svg).length > 0 }).toEqual({
        id,
        shadowed: !flat.has(id),
      });
    }
  });

  test("casts no node's shadow onto another node", () => {
    for (const a of drawn) {
      for (const b of drawn) {
        if (a === b) continue;
        for (const region of shadowRegions(a.svg)) {
          expect({ a: a.id, b: b.id, overlap: overlap(region, b.box) }).toEqual({
            a: a.id,
            b: b.id,
            overlap: false,
          });
        }
      }
    }
  });

  test("passes the image in by its href", () => {
    expect(document).toContain(`href="${IMAGE_HREF}"`);
  });
});
