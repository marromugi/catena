import { drawDiagram } from "../diagram";
import type { Spacing } from "../layout";
import { buildNode, type Node, type Theme } from "../node";
import { placeGraph, type GraphNode } from "../place";
import { NODE_KINDS, type DiagramFile, type NodeEntry } from "./diagram-file";

/** The distances every diagram file is laid out with: those of the picture on #20. */
const SPACING: Spacing = { nodeGap: 32, padding: 16, edgeToNode: 8, edgeGap: 8, minSegment: 8 };

/**
 * `file` as one SVG document: each node built from its kind in `theme`, placed, and drawn.
 * @throws InvalidNodeContentError when a node's content is not what its kind shows, naming the node.
 * @throws InvalidGraphError when the graph cannot be laid out as written.
 */
export function drawDiagramFile(file: DiagramFile, theme: Theme): string {
  const built = file.nodes.map((entry) => build(entry, theme));
  const layout = placeGraph(
    { direction: file.direction, nodes: built.map(({ node }) => node), edges: file.edges },
    SPACING,
  );
  const nodes = new Map(built.flatMap(({ leaves }) => leaves).map((node) => [node.leaf.id, node]));
  const { header, background } = file;
  return drawDiagram(layout, nodes, {
    ...(background === undefined ? {} : { background }),
    ...(header === undefined ? {} : { header: { ...header, fonts: theme.fonts } }),
  });
}

/** `entry` as `placeGraph` takes it, and every node built from a kind in it. */
function build(entry: NodeEntry, theme: Theme): { node: GraphNode; leaves: Node[] } {
  const cell = entry.cell === undefined ? {} : { cell: entry.cell };
  if ("children" in entry) {
    const [firstChild, ...otherChildren] = entry.children;
    const first = build(firstChild, theme);
    const rest = otherChildren.map((child) => build(child, theme));
    return {
      node: {
        id: entry.id,
        direction: entry.direction,
        children: [first.node, ...rest.map(({ node }) => node)],
        ...cell,
      },
      leaves: [first, ...rest].flatMap(({ leaves }) => leaves),
    };
  }
  const node = buildNode(NODE_KINDS[entry.kind], theme, entry.id, entry.content);
  return { node: { ...node.leaf, ...cell }, leaves: [node] };
}
