import { readFileSync } from "node:fs";
import { sourceHanSansJP } from "@catena/font-source-han-sans";
import { Ajv } from "ajv";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { iconNames } from "../icon";
import { defineTheme } from "../node";
import { Typeface } from "../text";
import { NODE_KIND_NAMES, NODE_KINDS, readDiagramFile, type NodeKind } from "./diagram-file";
import { diagramJsonSchema } from "./diagram-schema";
import { drawDiagramFile } from "./draw";

const theme = defineTheme({
  regular: [Typeface.read(readFileSync(sourceHanSansJP.regular))],
  bold: [Typeface.read(readFileSync(sourceHanSansJP.bold))],
});

/** Whether `catena draw` draws `file`, its custom icons none. */
function draws(file: unknown): boolean {
  try {
    drawDiagramFile(readDiagramFile(JSON.stringify(file)), theme);
    return true;
  } catch {
    return false;
  }
}

/** Whether a diagram file is valid against the schema made with `customIconNames`. */
function validator(customIconNames: readonly string[]) {
  const validate = new Ajv({ allErrors: true }).compile(diagramJsonSchema(customIconNames));
  return (json: unknown) => validate(json);
}

// Made-up shapes: catena's tests carry no real company's mark or colours.
const OWN_ICON = {
  pathData: "M2 2L8 8",
  viewBox: { x: 0, y: 0, width: 10, height: 10 },
  paint: "stroke",
};
const SQUARE_LOGO = {
  viewBox: { x: 0, y: 0, width: 10, height: 10 },
  shapes: [{ pathData: "M0 0H10V10H0Z", paint: "fill", color: "teal" }],
};

const SECTION_CARD = {
  title: "Run",
  body: "What ran.",
  items: ["build"],
  section: { heading: "Checks", items: ["lint"] },
};

/** Content each kind takes, so a kind added without one here fails to typecheck. */
const CONTENT: Record<NodeKind, unknown> = {
  activeRoundButton: "plus",
  badge: "Beta",
  iconTile: { icon: "service", label: { caption: "User", subcaption: "signed in" } },
  iconTitleBodyCard: { icon: "spark", text: { title: "App", body: "Answers." } },
  iconTitleCard: { icon: OWN_ICON, title: "App" },
  iconTitleCardPair: {
    first: { icon: SQUARE_LOGO, title: "One" },
    second: { icon: { logo: "registered" }, title: "Two" },
  },
  imageTitleBodyCard: { image: "data:image/png;base64,AAAA", title: "Photo", body: "A photo." },
  itemCard: "Item",
  redBadge: "New",
  roundButton: { href: "data:image/png;base64,AAAA" },
  selectedIconTile: { icon: "user" },
  statusTitleCard: { status: "red", title: "Down" },
  titleBadgeCard: { title: "Inbox", badge: "3" },
  titleBodyBadgeCard: { title: "Plan", body: "Steps.", badge: "Draft" },
  titleBodyCard: { title: "Store", body: "Keeps answers." },
  titleBodyItemsSectionCard: SECTION_CARD,
};

/** A diagram of one node of `kind` holding `content`. */
const holding = (kind: string, content: unknown) => ({
  direction: "down",
  nodes: [{ id: "a", kind, content }],
  edges: [],
});

/** A diagram of one card whose icon is `icon`. */
const naming = (icon: unknown) => holding("iconTitleCard", { icon, title: "App" });

describe("diagramJsonSchema", () => {
  const valid = validator(["mine"]);

  test("accepts a whole diagram file, its $schema key, groups, header and background", () => {
    const file = {
      $schema: "/home/someone/.config/catena/diagram.schema.json",
      direction: "right",
      nodes: [
        { id: "user", kind: "iconTile", content: { icon: "mine" }, cell: { row: 0, column: 0 } },
        {
          id: "side",
          direction: "down",
          children: [
            { id: "app", kind: "badge", content: "App" },
            {
              id: "inner",
              direction: "right",
              children: [{ id: "x", kind: "itemCard", content: "X" }],
            },
          ],
        },
      ],
      edges: [{ id: "e", from: "user", to: "app" }],
      header: { title: "Sample", repository: { name: "catena" }, capturedAt: "2026-11-18" },
      background: { canvas: "#ffffff", dot: "#eeeeee", dotRadius: 0, spacing: 20 },
    };
    expect(valid(file)).toBe(true);
    expect(() => readDiagramFile(JSON.stringify(file))).not.toThrow();
  });

  test.each(NODE_KIND_NAMES)(
    "accepts the content %s takes, as that kind's own schema does",
    (kind) => {
      expect(v.is(NODE_KINDS[kind].schema, CONTENT[kind])).toBe(true);
      expect(valid(holding(kind, CONTENT[kind]))).toBe(true);
    },
  );

  test.each(NODE_KIND_NAMES)(
    "refuses content %s does not take, as that kind's own schema does",
    (kind) => {
      const wrong = typeof CONTENT[kind] === "string" ? { text: "x" } : 1;
      expect(v.is(NODE_KINDS[kind].schema, wrong)).toBe(false);
      expect(valid(holding(kind, wrong))).toBe(false);
    },
  );

  test("lists the built-in icons' names, then the custom ones, as the enum of a bare string icon", () => {
    const text = JSON.stringify(diagramJsonSchema(["mine", "ours"]));
    expect(text).toContain(
      JSON.stringify({ type: "string", enum: [...iconNames, "mine", "ours"] }),
    );
  });

  test.each([
    ["a built-in icon's name", "spark", true],
    ["a custom icon's name", "mine", true],
    ["a misspelt name", "sprak", false],
    ["a custom name of no config", "ours", false],
    ["an own icon", OWN_ICON, true],
    ["a logo", SQUARE_LOGO, true],
    ["a registered logo, named", { logo: "registered" }, true],
    ["an object of no form", { letters: "AB" }, false],
  ])("for an icon, takes %s: %s", (_, icon, accepted) => {
    expect(valid(naming(icon))).toBe(accepted);
  });

  test("lists only the built-in names with no custom icons", () => {
    const builtInOnly = validator([]);
    expect(builtInOnly(naming("spark"))).toBe(true);
    expect(builtInOnly(naming("mine"))).toBe(false);
  });

  test.each([
    ["an unknown kind", holding("fooCard", "x")],
    ["a misspelt key", { ...holding("badge", "x"), edgse: [] }],
    ["no edges", { direction: "down", nodes: [] }],
    [
      "a group with no children",
      { direction: "down", nodes: [{ id: "g", direction: "down", children: [] }], edges: [] },
    ],
    [
      "a divider given content",
      holding("titleBodyItemsSectionCard", {
        ...SECTION_CARD,
        divider: null,
      }),
    ],
    ["a background spacing of 0", { ...holding("badge", "x"), background: { spacing: 0 } }],
    ["a $schema that is not a string", { ...holding("badge", "x"), $schema: 1 }],
  ])("refuses a diagram file with %s, as catena draw does", (_, file) => {
    expect(valid(file)).toBe(false);
    expect(draws(file)).toBe(false);
  });
});
