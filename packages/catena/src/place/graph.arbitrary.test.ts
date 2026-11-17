import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { Graph, GraphNode } from "./graph";
import { graphs } from "./graph.arbitrary";

const sample = fc.sample(graphs, { numRuns: 500, seed: 20_261_117 });

interface Listed {
  readonly node: GraphNode;
  readonly depth: number;
  /** The ids of the groups around the node, outermost first. */
  readonly around: readonly string[];
}

const listed = (nodes: readonly GraphNode[], around: readonly string[] = []): Listed[] =>
  nodes.flatMap((node) => [
    { node, depth: around.length, around },
    ...("children" in node ? listed(node.children, [...around, node.id]) : []),
  ]);

const all = sample.flatMap((graph) => listed(graph.nodes));
const leaves = all.flatMap(({ node }) => ("children" in node ? [] : [node]));
const groups = all.flatMap(({ node }) => ("children" in node ? [node] : []));

/** How many groups a chain from `node` inward holds, each flowing the other way than the one around it. */
const alternating = (node: GraphNode): number =>
  "children" in node
    ? 1 +
      Math.max(
        ...node.children.map((child) =>
          "children" in child && child.direction !== node.direction ? alternating(child) : 0,
        ),
      )
    : 0;

/** Every edge of the sample with where its ends are written in its own graph. */
const edges = sample.flatMap((graph: Graph) => {
  const order = listed(graph.nodes);
  const find = (id: string) => order.findIndex(({ node }) => node.id === id);
  return graph.edges.map((edge) => {
    const from = find(edge.from);
    const to = find(edge.to);
    return {
      from,
      to,
      intoOwnGroup: order[from]?.around.includes(edge.to) === true,
      outOfOwnGroup: order[to]?.around.includes(edge.from) === true,
      sameGrid: order[from]?.around.join("/") === order[to]?.around.join("/"),
      /** How many groups deeper than the grid that holds both ends the deeper end lies. */
      depthBelowShared: (() => {
        const outOf = order[from]?.around ?? [];
        const into = order[to]?.around ?? [];
        let shared = 0;
        while (shared < outOf.length && outOf[shared] === into[shared]) {
          shared += 1;
        }
        return Math.max(outOf.length, into.length) - shared;
      })(),
    };
  });
});

describe("graphs", () => {
  test.each([
    ["a graph with no nodes", sample.some((graph) => graph.nodes.length === 0)],
    ["a graph with several top-level nodes", sample.some((graph) => graph.nodes.length > 1)],
    ["a graph that flows down", sample.some((graph) => graph.direction === "down")],
    ["a graph that flows right", sample.some((graph) => graph.direction === "right")],
    ["a group that flows down", groups.some((each) => each.direction === "down")],
    ["a group that flows right", groups.some((each) => each.direction === "right")],
    ["a group with several children", groups.some((each) => each.children.length > 1)],
    [
      "a group inside a group inside a group",
      all.some((each) => "children" in each.node && each.depth >= 2),
    ],
    [
      "groups three deep, each flowing the other way than the one around it",
      groups.some((each) => alternating(each) >= 3),
    ],
    [
      "a width that is not a whole number",
      leaves.some((each) => !Number.isInteger(each.size.width)),
    ],
    [
      "a height that is not a whole number",
      leaves.some((each) => !Number.isInteger(each.size.height)),
    ],
    ["a leaf that names its cell", leaves.some((each) => each.cell !== undefined)],
    [
      "a graph whose first node names no cell",
      sample.some((graph) => graph.nodes[0] !== undefined && graph.nodes[0].cell === undefined),
    ],
    ["a leaf that names no cell", leaves.some((each) => each.cell === undefined)],
    ["a group that names its cell", groups.some((each) => each.cell !== undefined)],
    ["a group that names no cell", groups.some((each) => each.cell === undefined)],
    ["a cell past the first row", all.some(({ node }) => (node.cell?.row ?? 0) > 0)],
    ["a cell past the first column", all.some(({ node }) => (node.cell?.column ?? 0) > 0)],
    [
      "a cell whose row and column differ",
      all.some(({ node }) => node.cell !== undefined && node.cell.row !== node.cell.column),
    ],
    [
      "a graph with no edges",
      sample.some((graph) => graph.nodes.length > 0 && graph.edges.length === 0),
    ],
    [
      "an edge to a later node of the same grid",
      edges.some((edge) => edge.sameGrid && edge.from < edge.to),
    ],
    [
      "an edge back to an earlier node of the same grid",
      edges.some((edge) => edge.sameGrid && edge.from > edge.to),
    ],
    ["an edge from a node to itself", edges.some((edge) => edge.from === edge.to)],
    [
      "an edge between nodes of different grids",
      edges.some((edge) => !edge.sameGrid && !edge.intoOwnGroup && !edge.outOfOwnGroup),
    ],
    [
      "an edge with an end three groups deeper than the grid that holds both ends",
      edges.some((edge) => !edge.intoOwnGroup && !edge.outOfOwnGroup && edge.depthBelowShared >= 3),
    ],
    ["an edge from a node to a group around it", edges.some((edge) => edge.intoOwnGroup)],
    ["an edge from a group to a node inside it", edges.some((edge) => edge.outOfOwnGroup)],
    [
      "an edge to a node written further on than the next",
      edges.some((edge) => edge.to - edge.from > 1),
    ],
    ["an edge from a node that is not the first", edges.some((edge) => edge.from > 0)],
  ])("include %s", (_, found) => {
    expect(found).toBe(true);
  });

  test("give every node and every edge of a graph its own id, and every edge two nodes", () => {
    for (const graph of sample) {
      const ids = listed(graph.nodes).map(({ node }) => node.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(graph.edges.map(({ id }) => id)).size).toBe(graph.edges.length);
      expect(
        graph.edges.filter((edge) => !ids.includes(edge.from) || !ids.includes(edge.to)),
      ).toEqual([]);
    }
  });
});
