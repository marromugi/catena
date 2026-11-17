import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sourceHanSansJP } from "@catena/font-source-han-sans";
import { afterAll, describe, expect, test } from "vitest";
import { drawDiagram, type DiagramOptions } from "../diagram";
import {
  badge,
  buildNode,
  defineTheme,
  iconTile,
  iconTitleCard,
  InvalidNodeContentError,
  titleBodyCard,
} from "../node";
import { InvalidGraphError, placeGraph } from "../place";
import { Typeface } from "../text";
import { InvalidDiagramFileError, NODE_KINDS, readDiagramFile } from "./diagram-file";
import { drawDiagramFile } from "./draw";
import { run, USAGE } from "./main";

const theme = defineTheme({
  regular: [Typeface.read(readFileSync(sourceHanSansJP.regular))],
  bold: [Typeface.read(readFileSync(sourceHanSansJP.bold))],
});

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

describe("readDiagramFile", () => {
  test("reads the graph, each node's kind and content, the header and the background", () => {
    expect(readDiagramFile(text(SAMPLE))).toEqual(SAMPLE);
  });

  test("names every kind catena's node module exports", () => {
    expect(Object.keys(NODE_KINDS).toSorted()).toEqual([
      "activeRoundButton",
      "badge",
      "iconTile",
      "iconTitleBodyCard",
      "iconTitleCard",
      "iconTitleCardPair",
      "imageTitleBodyCard",
      "itemCard",
      "redBadge",
      "roundButton",
      "selectedIconTile",
      "statusTitleCard",
      "titleBadgeCard",
      "titleBodyBadgeCard",
      "titleBodyCard",
      "titleBodyItemsSectionCard",
    ]);
  });

  test("refuses text that is not JSON", () => {
    expect(() => readDiagramFile("{ direction: down")).toThrow(
      new InvalidDiagramFileError(
        "The file is not JSON: SyntaxError: Expected property name or '}' in JSON at position 2 (line 1 column 3)",
      ),
    );
  });

  test.each([
    ["no direction", { nodes: [], edges: [] }, "→ at direction"],
    ["a direction not down or right", { ...SAMPLE, direction: "up" }, "→ at direction"],
    ["a key it doesn't hold", { ...SAMPLE, colour: "red" }, "→ at colour"],
    ["an edge with no id", { ...SAMPLE, edges: [{ from: "user", to: "app" }] }, "→ at edges.0.id"],
    [
      "a node with neither kind nor children",
      { ...SAMPLE, nodes: [{ id: "a", content: "x" }] },
      "→ at nodes.0.kind",
    ],
    [
      "a group with no children",
      { ...SAMPLE, nodes: [{ id: "g", direction: "down", children: [] }] },
      "→ at nodes.0.children",
    ],
    [
      "a node with no content",
      { ...SAMPLE, nodes: [{ id: "a", kind: "badge" }] },
      "→ at nodes.0.content",
    ],
    ["a header that is not text", { ...SAMPLE, header: { title: 1 } }, "→ at header.title"],
    [
      "a background that is not a dot grid",
      { ...SAMPLE, background: { spacing: "wide" } },
      "→ at background.spacing",
    ],
  ])("refuses a file with %s, naming where", (_, json, where) => {
    expect(() => readDiagramFile(text(json))).toThrow(InvalidDiagramFileError);
    expect(() => readDiagramFile(text(json))).toThrow(where);
  });

  test("refuses a kind catena doesn't have, naming it and where it is, nested in a group", () => {
    const json = {
      ...SAMPLE,
      nodes: [
        { id: "g", direction: "down", children: [{ id: "a", kind: "fooCard", content: "x" }] },
      ],
    };
    expect(() => readDiagramFile(text(json))).toThrow(
      /^The file is not a diagram: × Invalid type: Expected \("activeRoundButton" \| .*\) but received "fooCard"\n {2}→ at nodes\.0\.children\.0\.kind$/,
    );
  });
});

/** The sample's nodes built from their kinds and placed as the sample places them, drawn with `options`. */
function sampleDrawn(options: DiagramOptions): string {
  const nodes = new Map(
    [
      buildNode(iconTile, theme, "user", { icon: "service", label: { caption: "User" } }),
      buildNode(iconTitleCard, theme, "app", { icon: "spark", title: "ここで LLM を使う" }),
      buildNode(titleBodyCard, theme, "store", { title: "Store", body: "Keeps answers." }),
      buildNode(badge, theme, "beta", "Beta"),
    ].map((node) => [node.leaf.id, node]),
  );
  const leaf = (id: string) => nodes.get(id)?.leaf ?? { id, size: { width: 0, height: 0 } };
  const layout = placeGraph(
    {
      direction: "right",
      nodes: [
        leaf("user"),
        {
          id: "side",
          direction: "down",
          cell: { row: 0, column: 1 },
          children: [leaf("app"), leaf("store")],
        },
        leaf("beta"),
      ],
      edges: SAMPLE.edges,
    },
    { nodeGap: 32, padding: 16, edgeToNode: 8, edgeGap: 8, minSegment: 8 },
  );
  return drawDiagram(layout, nodes, options);
}

describe("drawDiagramFile", () => {
  test("draws what building each node from its kind, placing the graph and drawing the layout draws", () => {
    expect(drawDiagramFile(readDiagramFile(text(SAMPLE)), theme)).toBe(
      sampleDrawn({
        header: { ...SAMPLE.header, fonts: theme.fonts },
        background: SAMPLE.background,
      }),
    );
  });

  test("draws no header and the default background when the file gives none", () => {
    const { header: _, background: __, ...bare } = SAMPLE;
    expect(drawDiagramFile(readDiagramFile(text(bare)), theme)).toBe(sampleDrawn({}));
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

  test("refuses a background drawDiagram refuses", () => {
    const file = readDiagramFile(text({ ...SAMPLE, background: { spacing: 0 } }));
    expect(() => drawDiagramFile(file, theme)).toThrow(RangeError);
  });
});

const directory = mkdtempSync(join(tmpdir(), "catena-cli-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

/** A file in the test's directory holding `content`, by its path. */
function fileOf(name: string, content: string): string {
  const path = join(directory, name);
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
  const sample = fileOf("sample.json", text(SAMPLE));
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
  ])("exits 1 for a file holding %s, saying why after its path", (name, content, why) => {
    const path = fileOf(`${name}.json`, content);
    const { code, stdout, stderr } = runWith(["draw", path]);
    expect({ code, stdout }).toEqual({ code: 1, stdout: "" });
    expect(stderr.startsWith(`catena: ${path}: `)).toBe(true);
    expect(stderr).toContain(why);
  });

  test("exits 1 for a file it can't read, naming the file", () => {
    const missing = join(directory, "missing.json");
    expect(runWith(["draw", missing])).toEqual({
      code: 1,
      stdout: "",
      stderr: `catena: ENOENT: no such file or directory, open '${missing}'\n`,
    });
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

describe("the catena command", () => {
  const bin = fileURLToPath(new URL("../../bin/catena.js", import.meta.url));

  test("draws a diagram file from any directory", () => {
    const sample = fileOf("command.json", text(SAMPLE));
    expect(execFileSync(bin, ["draw", sample], { cwd: directory, encoding: "utf8" })).toBe(
      `${drawDiagramFile(readDiagramFile(text(SAMPLE)), theme)}\n`,
    );
  });

  test("exits non-zero for a file that isn't a diagram", () => {
    const result = spawnSync(bin, ["draw", fileOf("broken.json", "[]")], {
      cwd: directory,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("The file is not a diagram");
  });
});
