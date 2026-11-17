import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { Graph, GraphNode } from "./graph";
import { graphs, nestedGroups } from "./graph.arbitrary";

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
  const flows = new Map(
    order.flatMap(({ node }) => ("children" in node ? [[node.id, node.direction]] : [])),
  );
  /** The outermost of the first three groups around a node, one inside another, whose flows alternate. */
  const chainAround = (at: number): string | undefined => {
    const around = order[at]?.around ?? [];
    return around.find((id, index) => {
      const [outer, middle, inner] = around.slice(index, index + 3).map((each) => flows.get(each));
      return inner !== undefined && outer !== middle && middle !== inner;
    });
  };
  return graph.edges.map((edge) => {
    const from = find(edge.from);
    const to = find(edge.to);
    return {
      fromChain: chainAround(from),
      toChain: chainAround(to),
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
    ...[3, 4, 5].map((depth): [string, boolean] => [
      `an edge with an end ${depth} groups deeper than the grid that holds both ends`,
      edges.some(
        (edge) => !edge.intoOwnGroup && !edge.outOfOwnGroup && edge.depthBelowShared === depth,
      ),
    ]),
    [
      "an edge into three groups, one inside another, whose flows alternate",
      edges.some((edge) => edge.fromChain === undefined && edge.toChain !== undefined),
    ],
    [
      "an edge out of three groups, one inside another, whose flows alternate",
      edges.some((edge) => edge.fromChain !== undefined && edge.toChain === undefined),
    ],
    [
      "an edge between two sets of three groups, one inside another, whose flows alternate",
      edges.some(
        (edge) =>
          edge.fromChain !== undefined &&
          edge.toChain !== undefined &&
          edge.fromChain !== edge.toChain,
      ),
    ],
    [
      "a group with a group inside it that flows the same way",
      groups.some((each) =>
        each.children.some((child) => "children" in child && child.direction === each.direction),
      ),
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

/** The groups from `node` inward through each first child, outermost first. */
const chainOf = (node: GraphNode): GraphNode[] =>
  "children" in node ? [node, ...chainOf(node.children[0])] : [];

const chains = fc.sample(nestedGroups, { numRuns: 500, seed: 20_261_117 }).map(chainOf);

describe("nestedGroups", () => {
  test("are each three to five groups, one inside the first child of the next, each flowing down or right and the other way than the one around it, with at most two leaves beside each and leaves in the innermost", () => {
    for (const chain of chains) {
      expect(chain.length).toBeGreaterThanOrEqual(3);
      expect(chain.length).toBeLessThanOrEqual(5);
      const flows = chain.map((each) => ("children" in each ? each.direction : undefined));
      expect(flows.every((flow) => flow === "down" || flow === "right")).toBe(true);
      expect(flows.slice(1).every((flow, at) => flow !== flows[at])).toBe(true);
      for (const each of chain.slice(0, -1)) {
        const beside = "children" in each ? each.children.slice(1) : [];
        expect(beside.length).toBeLessThanOrEqual(2);
        expect(beside.every((node) => !("children" in node))).toBe(true);
      }
      const inmost = chain.at(-1);
      expect(
        inmost !== undefined &&
          "children" in inmost &&
          inmost.children.every((child) => !("children" in child)),
      ).toBe(true);
    }
  });

  test.each([3, 4, 5])("include a chain of %i groups", (length) => {
    expect(chains.some((chain) => chain.length === length)).toBe(true);
  });

  test("include a chain with a node beside the next group in every group but the innermost", () => {
    expect(
      chains.some((chain) =>
        chain.slice(0, -1).every((each) => "children" in each && each.children.length > 1),
      ),
    ).toBe(true);
  });

  test.each(["down", "right"])("include a chain whose outermost group flows %s", (flow) => {
    expect(
      chains.some(
        (chain) => chain[0] !== undefined && "children" in chain[0] && chain[0].direction === flow,
      ),
    ).toBe(true);
  });

  test("include a chain whose outermost group names its cell", () => {
    expect(chains.some((chain) => chain[0]?.cell !== undefined)).toBe(true);
  });
});

describe("graphs", () => {
  test("hold three groups one inside another whose flows alternate in most of those that have nodes", () => {
    const withNodes = sample.filter((graph) => graph.nodes.length > 0);
    const nesting = withNodes.filter((graph) =>
      listed(graph.nodes).some(({ node }) => alternating(node) >= 3),
    );
    expect(nesting.length).toBeGreaterThan(withNodes.length / 2);
  });
});
