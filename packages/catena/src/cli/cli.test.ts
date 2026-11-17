import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sourceHanSansJP } from "@catena/font-source-han-sans";
import * as fc from "fast-check";
import * as v from "valibot";
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";
import { readCustomIcons } from "../config";
import { drawDiagram, type DiagramOptions } from "../diagram";
import * as nodeModule from "../node";
import {
  badge,
  buildNode,
  defineTheme,
  iconTile,
  iconTitleCard,
  InvalidNodeContentError,
  type Node,
  titleBodyCard,
} from "../node";
import { InvalidGraphError, placeGraph, type Graph } from "../place";
import { Typeface } from "../text";
import {
  InvalidDiagramFileError,
  NODE_KIND_NAMES,
  NODE_KINDS,
  readDiagramFile,
} from "./diagram-file";
import { drawDiagramFile } from "./draw";
import { run, USAGE } from "./main";

const theme = defineTheme({
  regular: [Typeface.read(readFileSync(sourceHanSansJP.regular))],
  bold: [Typeface.read(readFileSync(sourceHanSansJP.bold))],
});

// The real reader, watched so one test can make it fail with a fault of catena's own.
vi.mock(import("../config"), async (original) => {
  const config = await original();
  return {
    ...config,
    readCustomIcons: vi.fn<typeof config.readCustomIcons>(config.readCustomIcons),
  };
});

// `run` reads the user's config on every call: it is read from here, never from the real home.
const configDirectory = mkdtempSync(join(tmpdir(), "catena-cli-config-"));
const configPath = join(configDirectory, "config.json");
vi.stubEnv("CATENA_CONFIG_DIR", configDirectory);
afterAll(() => rmSync(configDirectory, { recursive: true, force: true }));

const SPACING = { nodeGap: 32, padding: 16, edgeToNode: 8, edgeGap: 8, minSegment: 8 };

const SAMPLE = {
  direction: "right",
  nodes: [
    { id: "user", kind: "iconTile", content: { icon: "service", label: { caption: "User" } } },
    {
      id: "side",
      direction: "down",
      cell: { row: 0, column: 1 },
      children: [
        {
          id: "app",
          kind: "iconTitleCard",
          content: { icon: "spark", title: "ここで LLM を使う" },
        },
        { id: "store", kind: "titleBodyCard", content: { title: "Store", body: "Keeps answers." } },
      ],
    },
    { id: "beta", kind: "badge", content: "Beta" },
  ],
  edges: [
    { id: "user>app", from: "user", to: "app" },
    { id: "app>store", from: "app", to: "store" },
  ],
  header: { title: "Sample", repository: { name: "catena" }, capturedAt: "2026-11-18" },
  background: { canvas: "#ffffff", spacing: 20 },
};

const text = (json: unknown) => JSON.stringify(json);

/** What `readDiagramFile` throws for `given`. */
function refusalOf(given: string): InvalidDiagramFileError {
  try {
    readDiagramFile(given);
  } catch (error) {
    if (error instanceof InvalidDiagramFileError) return error;
    throw error;
  }
  throw new Error("The text was read as a diagram.");
}

/** What `readDiagramFile` throws for `given`, or `undefined` when it reads a diagram. */
function thrownBy(given: string): unknown {
  try {
    readDiagramFile(given);
    return undefined;
  } catch (error) {
    return error;
  }
}

const isPart = (value: unknown) =>
  typeof value === "object" && value !== null && "schema" in value && "layout" in value;

const draw = (json: unknown) => drawDiagramFile(readDiagramFile(text(json)), theme);

/** Whether every tag in `svg` is closed in the order it was opened, under one root `<svg>`. */
function wellFormed(svg: string): boolean {
  const open: string[] = [];
  let roots = 0;
  for (const [, closing, name, selfClosing] of svg.matchAll(/<(\/?)([\w-]+)[^>]*?(\/?)>/g)) {
    if (open.length === 0) roots += 1;
    if (closing === "/") {
      if (open.pop() !== name) return false;
    } else if (selfClosing !== "/" && name !== undefined) {
      open.push(name);
    }
  }
  return open.length === 0 && roots === 1 && svg.startsWith("<svg");
}

describe("readDiagramFile", () => {
  test("reads the graph, each node's kind and content, the header and the background", () => {
    expect(readDiagramFile(text(SAMPLE))).toEqual(SAMPLE);
  });

  test("names every part the node module exports as a kind, but the parts that are not nodes", () => {
    const notNodes = ["bodyText", "divider", "icon", "image", "statusDot", "subtitle", "title"];
    const kinds = Object.entries(nodeModule).filter(
      ([name, value]) => isPart(value) && !notNodes.includes(name),
    );
    expect(kinds.map(([name]) => name).toSorted()).toEqual([...NODE_KIND_NAMES].toSorted());
    for (const [name, kind] of kinds) expect(NODE_KINDS).toHaveProperty([name], kind);
  });

  test("refuses text that is not JSON, with the SyntaxError as its cause", () => {
    const refusal = refusalOf("{ direction: down");
    expect(refusal).toEqual(
      new InvalidDiagramFileError(
        "The file is not JSON: SyntaxError: Expected property name or '}' in JSON at position 2 (line 1 column 3)",
      ),
    );
    expect(refusal.name).toBe("InvalidDiagramFileError");
    expect(refusal.cause).toBeInstanceOf(SyntaxError);
  });

  test("gives the issues as a ValiError for its cause when the file is not a diagram", () => {
    const refusal = refusalOf(text({ ...SAMPLE, direction: "up" }));
    expect(refusal.name).toBe("InvalidDiagramFileError");
    expect(refusal.cause).toBeInstanceOf(v.ValiError);
    expect(refusal.cause).toHaveProperty(["issues", 0, "received"], '"up"');
  });

  test.each([
    ["no direction", { nodes: [], edges: [] }, "→ at direction"],
    ["a direction not down or right", { ...SAMPLE, direction: "up" }, "→ at direction"],
    ["a key it doesn't hold", { ...SAMPLE, colour: "red" }, "→ at colour"],
    ["a node that is null", { ...SAMPLE, nodes: [null] }, "→ at nodes.0"],
    [
      "a node with neither kind nor children",
      { ...SAMPLE, nodes: [{ id: "a", content: "x" }] },
      "→ at nodes.0.kind",
    ],
    [
      "a leaf with a key it doesn't hold",
      { ...SAMPLE, nodes: [{ id: "a", kind: "badge", content: "x", colour: "red" }] },
      "→ at nodes.0.colour",
    ],
    [
      "a node with no content",
      { ...SAMPLE, nodes: [{ id: "a", kind: "badge" }] },
      "→ at nodes.0.content",
    ],
    [
      "a group with no children",
      { ...SAMPLE, nodes: [{ id: "g", direction: "down", children: [] }] },
      "→ at nodes.0.children",
    ],
    [
      "a group with a key it doesn't hold",
      { ...SAMPLE, nodes: [{ ...SAMPLE.nodes[1], kind: "badge" }] },
      "→ at nodes.0.kind",
    ],
    [
      "a cell with a key it doesn't hold",
      { ...SAMPLE, nodes: [{ id: "a", kind: "badge", content: "x", cell: { row: 0, col: 1 } }] },
      "→ at nodes.0.cell.col",
    ],
    ["an edge with no id", { ...SAMPLE, edges: [{ from: "user", to: "app" }] }, "→ at edges.0.id"],
    [
      "an edge with a key it doesn't hold",
      { ...SAMPLE, edges: [{ id: "e", from: "user", to: "app", label: "x" }] },
      "→ at edges.0.label",
    ],
    ["a header that is not text", { ...SAMPLE, header: { title: 1 } }, "→ at header.title"],
    [
      "a header with a key it doesn't hold",
      { ...SAMPLE, header: { subtitle: "x" } },
      "→ at header.subtitle",
    ],
    [
      "a repository with a key it doesn't hold",
      { ...SAMPLE, header: { repository: { name: "catena", url: "x" } } },
      "→ at header.repository.url",
    ],
    [
      "a background that is not a dot grid",
      { ...SAMPLE, background: { spacing: "wide" } },
      "→ at background.spacing",
    ],
    [
      "a background with a key it doesn't hold",
      { ...SAMPLE, background: { grid: "x" } },
      "→ at background.grid",
    ],
    [
      "a dot radius below 0",
      { ...SAMPLE, background: { dotRadius: -1 } },
      "→ at background.dotRadius",
    ],
    ["a spacing of 0", { ...SAMPLE, background: { spacing: 0 } }, "→ at background.spacing"],
  ])("refuses a file with %s, naming where", (_, json, where) => {
    expect(refusalOf(text(json)).message).toContain(where);
  });

  test("takes a dot radius of 0", () => {
    expect(readDiagramFile(text({ ...SAMPLE, background: { dotRadius: 0 } })).background).toEqual({
      dotRadius: 0,
    });
  });

  test("refuses a kind catena doesn't have, naming it and where it is, nested in a group", () => {
    const json = {
      ...SAMPLE,
      nodes: [
        { id: "g", direction: "down", children: [{ id: "a", kind: "fooCard", content: "x" }] },
      ],
    };
    expect(refusalOf(text(json)).message).toMatch(
      /^The file is not a diagram: × Invalid type: Expected \("activeRoundButton" \| .*\) but received "fooCard"\n {2}→ at nodes\.0\.children\.0\.kind$/,
    );
  });
});

/** Each node, by id. */
const byId = (nodes: readonly Node[]) => new Map(nodes.map((node) => [node.leaf.id, node]));

/** The sample's nodes built from their kinds and placed as the sample places them, drawn with `options`. */
function sampleDrawn(options: DiagramOptions): string {
  const user = buildNode(iconTile, theme, "user", { icon: "service", label: { caption: "User" } });
  const app = buildNode(iconTitleCard, theme, "app", { icon: "spark", title: "ここで LLM を使う" });
  const store = buildNode(titleBodyCard, theme, "store", {
    title: "Store",
    body: "Keeps answers.",
  });
  const beta = buildNode(badge, theme, "beta", "Beta");
  const graph: Graph = {
    direction: "right",
    nodes: [
      user.leaf,
      {
        id: "side",
        direction: "down",
        cell: { row: 0, column: 1 },
        children: [app.leaf, store.leaf],
      },
      beta.leaf,
    ],
    edges: SAMPLE.edges,
  };
  return drawDiagram(placeGraph(graph, SPACING), byId([user, app, store, beta]), options);
}

/** A leaf and a group of two set side by side, each put in a cell it names. */
const MOVED = {
  direction: "down",
  nodes: [
    { id: "a", kind: "badge", content: "A", cell: { row: 1, column: 1 } },
    {
      id: "g",
      direction: "right",
      cell: { row: 0, column: 2 },
      children: [
        { id: "b", kind: "badge", content: "B" },
        { id: "c", kind: "badge", content: "C" },
      ],
    },
  ],
  edges: [],
};

describe("drawDiagramFile", () => {
  test("draws what building each node from its kind, placing the graph and drawing the layout draws", () => {
    expect(draw(SAMPLE)).toBe(
      sampleDrawn({
        header: { ...SAMPLE.header, fonts: theme.fonts },
        background: SAMPLE.background,
      }),
    );
  });

  test("draws no header and the default background when the file gives none", () => {
    const { header: _, background: __, ...bare } = SAMPLE;
    expect(draw(bare)).toBe(sampleDrawn({}));
  });

  test("draws a header holding only some of its texts", () => {
    expect(draw({ ...SAMPLE, header: { title: "Sample" }, background: undefined })).toBe(
      sampleDrawn({ header: { title: "Sample", fonts: theme.fonts } }),
    );
  });

  test("places a leaf and a group in the cells they name, and a group's children its way", () => {
    const [a, b, c] = ["A", "B", "C"].map((content) =>
      buildNode(badge, theme, content.toLowerCase(), content),
    );
    if (a === undefined || b === undefined || c === undefined) throw new Error("Three badges.");
    const graph: Graph = {
      direction: "down",
      nodes: [
        { ...a.leaf, cell: { row: 1, column: 1 } },
        { id: "g", direction: "right", cell: { row: 0, column: 2 }, children: [b.leaf, c.leaf] },
      ],
      edges: [],
    };
    const moved = draw(MOVED);
    expect(moved).toBe(drawDiagram(placeGraph(graph, SPACING), byId([a, b, c])));
    const [leaf, group] = MOVED.nodes;
    expect(draw({ ...MOVED, nodes: [{ ...leaf, cell: undefined }, group] })).not.toBe(moved);
    expect(draw({ ...MOVED, nodes: [leaf, { ...group, cell: undefined }] })).not.toBe(moved);
    expect(draw({ ...MOVED, nodes: [leaf, { ...group, direction: "down" }] })).not.toBe(moved);
  });

  test("refuses content a kind refuses, naming the node", () => {
    const file = readDiagramFile(
      text({ ...SAMPLE, nodes: [{ id: "app", kind: "iconTitleCard", content: { title: 1 } }] }),
    );
    expect(() => drawDiagramFile(file, theme)).toThrow(InvalidNodeContentError);
    expect(() => drawDiagramFile(file, theme)).toThrow('The content of node "app"');
  });

  test("refuses a graph placeGraph refuses", () => {
    const file = readDiagramFile(
      text({ ...SAMPLE, edges: [{ id: "user>nobody", from: "user", to: "nobody" }] }),
    );
    expect(() => drawDiagramFile(file, theme)).toThrow(
      new InvalidGraphError('Edge "user>nobody" connects "nobody", which is not in the graph.'),
    );
  });

  test("refuses two nodes with one id", () => {
    const file = readDiagramFile(
      text({
        direction: "down",
        nodes: [
          { id: "a", kind: "badge", content: "One" },
          { id: "a", kind: "badge", content: "Two" },
        ],
        edges: [],
      }),
    );
    expect(() => drawDiagramFile(file, theme)).toThrow(
      new InvalidGraphError('The graph has two nodes with the id "a".'),
    );
  });
});

const directory = mkdtempSync(join(tmpdir(), "catena-cli-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

let files = 0;

/** A new file in the test's directory holding `content`, by its path. */
function fileOf(content: string): string {
  files += 1;
  const path = join(directory, `diagram-${files}.json`);
  writeFileSync(path, content);
  return path;
}

/** `run` with `args`, and what it wrote. */
function runWith(args: readonly string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(
    args,
    { write: (written: string) => (stdout += written) },
    { write: (written: string) => (stderr += written) },
  );
  return { code, stdout, stderr };
}

describe("run", () => {
  const sample = fileOf(text(SAMPLE));
  const expected = `${drawDiagramFile(readDiagramFile(text(SAMPLE)), theme)}\n`;

  test("writes the diagram's SVG to stdout and exits 0", () => {
    expect(runWith(["draw", sample])).toEqual({ code: 0, stdout: expected, stderr: "" });
  });

  test.each([["-o"], ["--output"]])("writes the SVG to the file %s names", (flag) => {
    const out = join(directory, `out${flag}.svg`);
    expect(runWith(["draw", sample, flag, out])).toEqual({ code: 0, stdout: "", stderr: "" });
    expect(readFileSync(out, "utf8")).toBe(expected);
  });

  test.each([
    ["not JSON", "{", "The file is not JSON"],
    ["not a diagram", text({ nodes: [] }), "The file is not a diagram"],
    [
      "an unknown kind",
      text({ ...SAMPLE, nodes: [{ id: "a", kind: "fooCard", content: "x" }] }),
      'received "fooCard"\n  → at nodes.0.kind',
    ],
    [
      "content a kind refuses",
      text({ ...SAMPLE, nodes: [{ id: "a", kind: "badge", content: 1 }] }),
      'The content of node "a" does not match its kind',
    ],
    [
      "a graph that can't be laid out",
      text({ ...SAMPLE, edges: [{ id: "e", from: "user", to: "nobody" }] }),
      'Edge "e" connects "nobody"',
    ],
  ])("exits 1 for a file holding %s, saying why after its path", (_, content, why) => {
    const path = fileOf(content);
    const { code, stdout, stderr } = runWith(["draw", path]);
    expect({ code, stdout }).toEqual({ code: 1, stdout: "" });
    expect(stderr.startsWith(`catena: ${path}: `)).toBe(true);
    expect(stderr).toContain(why);
  });

  test("exits 1 for a file that isn't there, after its path", () => {
    const missing = join(directory, "missing.json");
    expect(runWith(["draw", missing])).toEqual({
      code: 1,
      stdout: "",
      stderr: `catena: ${missing}: ENOENT: no such file or directory, open '${missing}'\n`,
    });
  });

  test("exits 1 for a directory given as the file, after its path", () => {
    expect(runWith(["draw", directory])).toEqual({
      code: 1,
      stdout: "",
      stderr: `catena: ${directory}: EISDIR: illegal operation on a directory, read\n`,
    });
  });

  test("exits 1 when the SVG can't be written where -o says, after that path", () => {
    const out = join(directory, "no-such-directory", "out.svg");
    expect(runWith(["draw", sample, "-o", out])).toEqual({
      code: 1,
      stdout: "",
      stderr: `catena: ${out}: ENOENT: no such file or directory, open '${out}'\n`,
    });
  });

  test("throws a fault of catena's own rather than saying the file is wrong", () => {
    const depth = 6000;
    const group = '{"id":"g","direction":"down","children":[';
    const deep = `${group.repeat(depth)}{"id":"leaf","kind":"badge","content":"x"}${"]}".repeat(depth)}`;
    const path = fileOf(`{"direction":"down","edges":[],"nodes":[${deep}]}`);
    expect(() => runWith(["draw", path])).toThrow(RangeError);
  });

  test.each([
    [[]],
    [["draw"]],
    [["paint", sample]],
    [["draw", sample, sample]],
    [["draw", sample, "-o"]],
    [["draw", sample, "--colour", "red"]],
  ])("exits 2 with the usage for %j", (args) => {
    const { code, stdout, stderr } = runWith(args);
    expect({ code, stdout }).toEqual({ code: 2, stdout: "" });
    expect(stderr.endsWith(`${USAGE}\n`)).toBe(true);
  });
});

/** A diagram of one card whose icon is `icon`. */
const naming = (icon: unknown) => ({
  direction: "down",
  nodes: [{ id: "app", kind: "iconTitleCard", content: { icon, title: "App" } }],
  edges: [],
});

describe("icons from the user's config", () => {
  // Made-up shapes: catena's tests carry no real company's mark or colours.
  const ownIcon = {
    pathData: "M2 2L8 8",
    viewBox: { x: 0, y: 0, width: 10, height: 10 },
    paint: "stroke",
  };
  const squareLogo = {
    viewBox: { x: 0, y: 0, width: 10, height: 10 },
    shapes: [{ pathData: "M0 0H10V10H0Z", paint: "fill", color: "teal" }],
  };
  const squareSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10V10H0Z" fill="teal"/></svg>';
  const ownImage = { href: "data:image/png;base64,AAAA" };

  afterEach(() => rmSync(configPath, { recursive: true, force: true }));

  const writeConfig = (config: unknown) =>
    writeFileSync(configPath, typeof config === "string" ? config : text(config));

  test.each([
    ["one-colour icon", ownIcon, ownIcon],
    ["logo", squareLogo, squareLogo],
    ["logo read from an SVG file", "square.svg", squareLogo],
    ["image", ownImage, ownImage],
  ])(
    "draws the config's %s named by a bare string as it draws the same one inline",
    (_, entry, inline) => {
      writeFileSync(join(configDirectory, "square.svg"), squareSvg);
      writeConfig({ icons: { mine: entry } });
      expect(runWith(["draw", fileOf(text(naming("mine")))])).toEqual({
        code: 0,
        stdout: `${draw(naming(inline))}\n`,
        stderr: "",
      });
    },
  );

  test("draws a built-in icon's name as the built-in icon beside the config's icons", () => {
    writeConfig({ icons: { mine: ownIcon } });
    expect(runWith(["draw", fileOf(text(naming("spark")))]).stdout).toBe(
      `${draw(naming("spark"))}\n`,
    );
  });

  test.each([
    ["a config", { icons: { mine: ownIcon } }],
    ["no config", undefined],
  ])(
    "exits 1 with %s for a name neither built in nor the config's, naming the node",
    (_, config) => {
      if (config !== undefined) writeConfig(config);
      const path = fileOf(text(naming("nope")));
      expect(runWith(["draw", path])).toEqual({
        code: 1,
        stdout: "",
        stderr: `catena: ${path}: The content of node "app" names the icon "nope", which is neither a built-in icon nor a custom one.\n`,
      });
    },
  );

  test.each([
    ["not JSON", "{", `The catena config ${configPath} is not JSON.`],
    [
      "a built-in icon's name",
      { icons: { spark: ownIcon } },
      `The catena config ${configPath}: icon "spark" is a built-in icon's name.`,
    ],
    [
      "an icon of no form",
      { icons: { mine: { letters: "AB" } } },
      `The catena config ${configPath}: icon "mine" is none of: a path to an SVG file, an OwnIcon, an OwnLogo, an OwnImage.`,
    ],
  ])(
    "exits 1 with the reader's message for a config holding %s, before reading the diagram",
    (_, config, message) => {
      writeConfig(config);
      const expected = { code: 1, stdout: "", stderr: `catena: ${message}\n` };
      expect(runWith(["draw", fileOf(text(SAMPLE))])).toEqual(expected);
      expect(runWith(["draw", join(directory, "missing.json")])).toEqual(expected);
    },
  );

  test("throws a fault of catena's own in reading the config rather than saying the config is wrong", () => {
    const fault = new TypeError("a fault of catena's own");
    vi.mocked(readCustomIcons).mockImplementationOnce(() => {
      throw fault;
    });
    expect(() => runWith(["draw", fileOf(text(SAMPLE))])).toThrow(fault);
  });

  test("exits 1 for a config the system can't read, after its path", () => {
    mkdirSync(configPath);
    expect(runWith(["draw", fileOf(text(SAMPLE))])).toEqual({
      code: 1,
      stdout: "",
      stderr: `catena: ${configPath}: EISDIR: illegal operation on a directory, read\n`,
    });
  });

  test("the catena command draws the config's icon by name from a directory outside the repo", () => {
    writeConfig({ icons: { mine: ownIcon } });
    const bin = fileURLToPath(new URL("../../bin/catena.js", import.meta.url));
    const elsewhere = mkdtempSync(join(tmpdir(), "catena-elsewhere-"));
    try {
      const svg = execFileSync(bin, ["draw", fileOf(text(naming("mine")))], {
        cwd: elsewhere,
        env: { ...process.env, CATENA_CONFIG_DIR: configDirectory },
        encoding: "utf8",
      });
      expect(svg).toBe(`${draw(naming(ownIcon))}\n`);
      expect(svg).toContain('d="M2 2L8 8"');
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });
});

describe("the catena command", () => {
  const bin = fileURLToPath(new URL("../../bin/catena.js", import.meta.url));
  const expected = `${drawDiagramFile(readDiagramFile(text(SAMPLE)), theme)}\n`;

  test("draws a diagram file from any directory", () => {
    expect(
      execFileSync(bin, ["draw", fileOf(text(SAMPLE))], { cwd: directory, encoding: "utf8" }),
    ).toBe(expected);
  });

  test("loads catena's own modules from a directory whose tsconfig maps imports elsewhere", () => {
    const project = join(directory, "project");
    mkdirSync(project);
    writeFileSync(
      join(project, "tsconfig.json"),
      text({ compilerOptions: { baseUrl: ".", paths: { "*": ["./*"] } } }),
    );
    writeFileSync(
      join(project, "valibot.ts"),
      'throw new Error("The project\'s valibot.ts ran.");\n',
    );
    expect(
      execFileSync(bin, ["draw", fileOf(text(SAMPLE))], { cwd: project, encoding: "utf8" }),
    ).toBe(expected);
  });

  test("exits 1 for a file that isn't a diagram", () => {
    const result = spawnSync(bin, ["draw", fileOf("[]")], { cwd: directory, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("The file is not a diagram");
  });
});

describe("properties", () => {
  const SEED = 20261118;
  const words = fc.string({ unit: "grapheme" });
  const id = fc.string({ minLength: 1, maxLength: 4 });
  const direction = fc.constantFrom("down", "right");
  const cell = fc.record({
    row: fc.integer({ min: 0, max: 3 }),
    column: fc.integer({ min: 0, max: 3 }),
  });
  const leaf = fc.record(
    { id, kind: fc.constantFrom(...NODE_KIND_NAMES), content: fc.jsonValue(), cell },
    { requiredKeys: ["id", "kind", "content"] },
  );
  const { entry } = fc.letrec<{ entry: unknown; group: unknown }>((tie) => ({
    entry: fc.oneof({ depthSize: "small" }, leaf, tie("group")),
    group: fc.record(
      { id, direction, children: fc.array(tie("entry"), { minLength: 1, maxLength: 3 }), cell },
      { requiredKeys: ["id", "direction", "children"] },
    ),
  }));
  const header = fc.record(
    { title: words, repository: fc.record({ name: words }), capturedAt: words },
    { requiredKeys: [] },
  );
  const length = { noNaN: true, noDefaultInfinity: true, min: 0 } as const;
  const diagram = fc.record(
    {
      direction,
      nodes: fc.array(entry, { maxLength: 4 }),
      edges: fc.array(fc.record({ id, from: id, to: id }), { maxLength: 3 }),
      header,
      background: fc.record(
        {
          canvas: words,
          dot: words,
          dotRadius: fc.double(length),
          spacing: fc.double({ ...length, minExcluded: true }),
        },
        { requiredKeys: [] },
      ),
    },
    { requiredKeys: ["direction", "nodes", "edges"] },
  );

  /** A diagram whose nodes are all content their kinds take, each joined to the one before. */
  const drawable = fc
    .record({
      direction,
      leaves: fc.array(
        fc.oneof(
          fc.record({ kind: fc.constant("badge"), content: words }),
          fc.record({
            kind: fc.constant("titleBodyCard"),
            content: fc.record({ title: words, body: words }),
          }),
          fc.record({
            kind: fc.constant("iconTile"),
            content: fc.record({
              icon: fc.constant("service"),
              label: fc.record({ caption: words }),
            }),
          }),
        ),
        { minLength: 1, maxLength: 5 },
      ),
      header: fc.option(header, { nil: undefined }),
    })
    .map(({ direction: way, leaves, header: given }) => ({
      direction: way,
      nodes: leaves.map((content, index) => ({ id: `n${index}`, ...content })),
      edges: leaves
        .slice(1)
        .map((_, index) => ({ id: `e${index}`, from: `n${index}`, to: `n${index + 1}` })),
      ...(given === undefined ? {} : { header: given }),
    }));

  test("reads a diagram file back as written", () => {
    fc.assert(
      fc.property(diagram, (json) => {
        expect(readDiagramFile(text(json))).toEqual(JSON.parse(text(json)));
      }),
      { seed: SEED },
    );
  });

  test("throws nothing but InvalidDiagramFileError for any text", () => {
    const anyText = fc.oneof(
      fc.string(),
      fc.json(),
      fc.jsonValue().map((json) => text(json)),
    );
    const inFrame = fc
      .tuple(fc.jsonValue(), fc.jsonValue())
      .map(([nodes, edges]) => text({ direction: "down", nodes, edges }));
    fc.assert(
      fc.property(fc.oneof(anyText, inFrame), (given) => {
        const thrown = thrownBy(given);
        expect(thrown === undefined || thrown instanceof InvalidDiagramFileError).toBe(true);
      }),
      { seed: SEED, numRuns: 1000 },
    );
  });

  test("exits 0 with only SVG, or 1 with only a message, for any diagram file", () => {
    fc.assert(
      fc.property(diagram, (json) => {
        const { code, stdout, stderr } = runWith(["draw", fileOf(text(json))]);
        expect(code === 0 ? [stdout !== "", stderr] : [code, stdout]).toEqual(
          code === 0 ? [true, ""] : [1, ""],
        );
      }),
      { seed: SEED, numRuns: 300 },
    );
  });

  test("draws a diagram of content its kinds take as the same well-formed SVG every time", () => {
    fc.assert(
      fc.property(drawable, (json) => {
        const path = fileOf(text(json));
        const first = runWith(["draw", path]);
        expect({ code: first.code, stderr: first.stderr }).toEqual({ code: 0, stderr: "" });
        expect(runWith(["draw", path]).stdout).toBe(first.stdout);
        expect(wellFormed(first.stdout.trimEnd())).toBe(true);
      }),
      { seed: SEED, numRuns: 100 },
    );
  });
});
