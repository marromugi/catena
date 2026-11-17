import { readFileSync } from "node:fs";
import { sourceHanSansJP } from "@catena/font-source-han-sans";
import { Ajv } from "ajv";
import * as fc from "fast-check";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { iconNames } from "../icon";
import { defineTheme, InvalidNodeContentError, type CustomIcon } from "../node";
import { InvalidGraphError } from "../place";
import { Typeface } from "../text";
import {
  InvalidDiagramFileError,
  NODE_KIND_NAMES,
  NODE_KINDS,
  readDiagramFile,
  type NodeKind,
} from "./diagram-file";
import { diagramJsonSchema } from "./diagram-schema";
import { drawDiagramFile } from "./draw";

// Made-up shapes: catena's tests carry no real company's mark or colours.
const OWN_ICON: CustomIcon = {
  pathData: "M2 2L8 8",
  viewBox: { x: 0, y: 0, width: 10, height: 10 },
  paint: "stroke",
};
const SQUARE_LOGO = {
  viewBox: { x: 0, y: 0, width: 10, height: 10 },
  shapes: [{ pathData: "M0 0H10V10H0Z", paint: "fill", color: "teal" }],
};

/** The theme `catena draw` draws in with a config holding the one custom icon `mine`. */
const theme = defineTheme(
  {
    regular: [Typeface.read(readFileSync(sourceHanSansJP.regular))],
    bold: [Typeface.read(readFileSync(sourceHanSansJP.bold))],
  },
  { icons: { mine: OWN_ICON } },
);

/**
 * Whether `catena draw` draws `file`, given as JSON or as its text, with the config's icon `mine`.
 * @throws what drawing throws that is not a refusal of the file's.
 */
function draws(file: unknown): boolean {
  try {
    drawDiagramFile(readDiagramFile(typeof file === "string" ? file : JSON.stringify(file)), theme);
    return true;
  } catch (error) {
    if (
      error instanceof InvalidDiagramFileError ||
      error instanceof InvalidNodeContentError ||
      error instanceof InvalidGraphError
    ) {
      return false;
    }
    throw error;
  }
}

/** Whether a diagram file is valid against the schema made with `customIconNames`. */
function validator(customIconNames: readonly string[]) {
  const validate = new Ajv({ allErrors: true, strictTuples: false }).compile(
    diagramJsonSchema(customIconNames),
  );
  return (json: unknown) => validate(json);
}

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
    second: { icon: "mine", title: "Two" },
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

/** A diagram of one group holding `children`, in `direction`. */
const grouping = (children: unknown[], direction: unknown = "down") => ({
  direction: "down",
  nodes: [{ id: "g", direction, children }],
  edges: [],
});

const badge = (id: unknown, content: unknown = "x") => ({ id, kind: "badge", content });

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
    expect(draws(file)).toBe(true);
  });

  test.each(NODE_KIND_NAMES)(
    "accepts the content %s takes, as that kind's own schema does",
    (kind) => {
      expect(v.is(NODE_KINDS[kind].schema, CONTENT[kind])).toBe(true);
      expect(valid(holding(kind, CONTENT[kind]))).toBe(true);
      expect(draws(holding(kind, CONTENT[kind]))).toBe(true);
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
    ["a logo named on the theme, which catena draw registers none of", { logo: "mine" }, false],
    ["an object of no form", { stars: 5 }, false],
  ])("for an icon, takes %s: %s, as catena draw does", (_, icon, accepted) => {
    expect(valid(naming(icon))).toBe(accepted);
    expect(draws(naming(icon))).toBe(accepted);
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
    ["a group with no children", grouping([])],
    ["a group in a direction of none", grouping([badge("a")], "up")],
    ["a bad leaf in a group", grouping([badge("a", 1)])],
    ["a bad second child in a group", grouping([badge("a"), badge("b", 1)])],
    ["a leaf whose id is not a string", { ...holding("badge", "x"), nodes: [badge(1)] }],
    [
      "a divider given content",
      holding("titleBodyItemsSectionCard", { ...SECTION_CARD, divider: null }),
    ],
    ["a background spacing of 0", { ...holding("badge", "x"), background: { spacing: 0 } }],
    ["a $schema that is not a string", { ...holding("badge", "x"), $schema: 1 }],
  ])("refuses a diagram file with %s, as catena draw does", (_, file) => {
    expect(valid(file)).toBe(false);
    expect(draws(file)).toBe(false);
  });

  test.each([
    ["background.spacing", '"nodes":[],"background":{"spacing":1e999}'],
    ["background.dotRadius", '"nodes":[],"background":{"dotRadius":1e999}'],
    [
      "nodes.0.cell.row",
      '"nodes":[{"id":"a","kind":"badge","content":"x","cell":{"row":1e999,"column":0}}]',
    ],
  ])("catena draw refuses a number JSON gives as Infinity at %s, naming it", (where, part) => {
    const given = `{"direction":"down","edges":[],${part}}`;
    expect(() => readDiagramFile(given)).toThrow(InvalidDiagramFileError);
    expect(() => readDiagramFile(given)).toThrow(where);
  });
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

describe("properties", () => {
  const valid = validator(["mine"]);

  /** Any JSON value but `[]`, which Valibot reads as an object of optional keys, and with no `__proto__` key. */
  const junk = fc.letrec((tie) => ({
    value: fc.oneof(
      { depthSize: "small" },
      fc.string({ maxLength: 4 }),
      fc.constantFrom("spark", "mine", "sprak", "down", "red"),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.boolean(),
      fc.constant(null),
      fc.dictionary(
        fc.string({ maxLength: 6 }).filter((key) => key !== "__proto__"),
        tie("value"),
        { maxKeys: 3 },
      ),
      fc.array(tie("value"), { minLength: 1, maxLength: 3 }),
    ),
  })).value;

  /** `value`, with one key given junk, taken away or itself changed, or junk in its place. */
  function changed(value: unknown): fc.Arbitrary<unknown> {
    if (!isObject(value)) return junk;
    const keys = Object.keys(value);
    if (keys.length === 0)
      return fc.oneof(
        junk,
        junk.map((given) => ({ extra: given })),
      );
    return fc.oneof(
      junk,
      fc
        .tuple(fc.constantFrom(...keys, "extra"), junk)
        .map(([key, given]) => ({ ...value, [key]: given })),
      fc.constantFrom(...keys).map((key) => {
        const { [key]: _, ...rest } = value;
        return rest;
      }),
      fc
        .constantFrom(...keys)
        .chain((key) => changed(value[key]).map((given) => ({ ...value, [key]: given }))),
    );
  }

  const contentOf = (kind: NodeKind) =>
    fc.oneof(
      { weight: 12, arbitrary: fc.constant(CONTENT[kind]) },
      { weight: 1, arbitrary: changed(CONTENT[kind]) },
    );

  const leaf = fc
    .oneof(
      {
        weight: 12,
        arbitrary: fc
          .constantFrom(...NODE_KIND_NAMES)
          .chain((kind) => fc.record({ kind: fc.constant(kind), content: contentOf(kind) })),
      },
      { weight: 1, arbitrary: fc.record({ kind: junk, content: junk }) },
    )
    .chain((node) => fc.oneof({ weight: 40, arbitrary: fc.constant(node) }, changed(node)));

  const direction = fc.oneof(
    { weight: 30, arbitrary: fc.constantFrom("down", "right") },
    { weight: 1, arbitrary: junk },
  );

  const group = fc.record({
    direction,
    children: fc.oneof(
      { weight: 30, arbitrary: fc.array(leaf, { minLength: 1, maxLength: 3 }) },
      { weight: 1, arbitrary: fc.constant([]) },
    ),
  });

  const header = { title: "Sample", repository: { name: "catena" }, capturedAt: "2026-11-18" };
  const background = { canvas: "#ffffff", dot: "#eeeeee", dotRadius: 1, spacing: 20 };

  /** Left out, `value`, or `value` changed. */
  const sometimesChanged = (value: unknown) =>
    fc.oneof(
      { weight: 3, arbitrary: fc.constant(undefined) },
      { weight: 3, arbitrary: fc.constant(value) },
      { weight: 1, arbitrary: changed(value) },
    );

  /** A diagram file each of whose parts is as catena draws it, or changed; its ids unique and its edges between top-level leaves. */
  const file = fc
    .record({
      direction,
      nodes: fc.array(fc.oneof({ weight: 3, arbitrary: leaf }, group), { maxLength: 4 }),
      header: sometimesChanged(header),
      background: sometimesChanged(background),
      extra: fc.oneof(
        { weight: 6, arbitrary: fc.constant(undefined) },
        { weight: 2, arbitrary: fc.tuple(fc.constant("$schema"), fc.string({ maxLength: 4 })) },
        { weight: 1, arbitrary: fc.tuple(fc.constantFrom("$schema", "notes"), junk) },
      ),
    })
    .map(({ direction: way, nodes, header: given, background: drawnOn, extra }) => {
      let ids = 0;
      const withId = (node: unknown): unknown => {
        if (!isObject(node)) return node;
        ids += 1;
        const children = node["children"];
        return {
          id: `n${ids}`,
          ...node,
          ...(Array.isArray(children) ? { children: children.map((child) => withId(child)) } : {}),
        };
      };
      const placed = nodes.map((node) => withId(node));
      const leaves = placed.filter(isObject).filter((node) => !("children" in node));
      return {
        direction: way,
        nodes: placed,
        edges: leaves.slice(1).map((node, index) => ({
          id: `e${index}`,
          from: leaves[index]?.["id"],
          to: node["id"],
        })),
        ...(given === undefined ? {} : { header: given }),
        ...(drawnOn === undefined ? {} : { background: drawnOn }),
        ...(extra === undefined ? {} : { [extra[0]]: extra[1] }),
      };
    });

  test("the schema takes a diagram file exactly when catena draw draws it", () => {
    fc.assert(
      fc.property(file, (json) => {
        expect(valid(json)).toBe(draws(json));
      }),
      { seed: 20261118, numRuns: 2000 },
    );
  });
});
