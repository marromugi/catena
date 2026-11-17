import { drawDiagram } from "../diagram";
import type { Spacing } from "../layout";
import { buildNode, type Node, type Theme } from "../node";
import { placeGraph, type GraphNode } from "../place";
import { NODE_KINDS, type DiagramFile, type LeafEntry, type NodeEntry } from "./diagram-file";

/** The distances every diagram file is laid out with: those of the picture on #20. */
const SPACING: Spacing = { nodeGap: 32, padding: 16, edgeToNode: 8, edgeGap: 8, minSegment: 8 };

/**
 * `file` as one SVG document: each node built from its kind in `theme`, placed, and drawn.
 * @throws InvalidNodeContentError when a node's content is not what its kind shows, naming the node.
 * @throws InvalidGraphError when the graph cannot be laid out as written.
 * @throws RangeError when the background's dot radius or spacing is out of range.
 */
export function drawDiagramFile(file: DiagramFile, theme: Theme): string {
  const nodes = new Map(
    leavesOf(file.nodes).map((entry) => {
      const kind = NODE_KINDS[entry.kind];
      if (kind === undefined) {
        throw new Error(`The diagram file let through a kind "${entry.kind}".`);
      }
      return [entry.id, buildNode(kind, theme, entry.id, entry.content)] as const;
    }),
  );
  const layout = placeGraph(
    {
      direction: file.direction,
      nodes: file.nodes.map((entry) => graphNode(entry, nodes)),
      edges: file.edges,
    },
    SPACING,
  );
  const { header, background } = file;
  return drawDiagram(layout, nodes, {
    ...(background === undefined ? {} : { background }),
    ...(header === undefined ? {} : { header: { ...header, fonts: theme.fonts } }),
  });
}

function leavesOf(entries: readonly NodeEntry[]): LeafEntry[] {
  return entries.flatMap((entry) => ("children" in entry ? leavesOf(entry.children) : [entry]));
}

/** `entry` as `placeGraph` takes it, each leaf at the size its built node takes. */
function graphNode(entry: NodeEntry, nodes: ReadonlyMap<string, Node>): GraphNode {
  const cell = entry.cell === undefined ? {} : { cell: entry.cell };
  if ("children" in entry) {
    const [first, ...rest] = entry.children;
    return {
      id: entry.id,
      direction: entry.direction,
      children: [graphNode(first, nodes), ...rest.map((child) => graphNode(child, nodes))],
      ...cell,
    };
  }
  const node = nodes.get(entry.id);
  if (node === undefined) throw new Error(`No node was built for "${entry.id}".`);
  return { ...node.leaf, ...cell };
}
