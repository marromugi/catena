import { drawDiagram } from "../diagram";
import { EDGE_ICON_RADIUS, edgeIcon, type EdgeIcon } from "../edge";
import type { Spacing } from "../layout";
import {
  buildNode,
  UnknownIconError,
  UnknownLogoError,
  type IconContent,
  type Node,
  type Theme,
} from "../node";
import { placeGraph, type GraphNode } from "../place";
import { NODE_KINDS, type DiagramFile, type NodeEntry } from "./diagram-file";

/** The distances every diagram file is laid out with: those of the picture on #20. */
const SPACING: Spacing = { nodeGap: 32, padding: 16, edgeToNode: 8, edgeGap: 8, minSegment: 8 };

export class InvalidEdgeIconError extends Error {
  override readonly name = "InvalidEdgeIconError";
}

/**
 * Where edges carrying a branch icon bend at one point, the first of them in the file gives the icon.
 * @throws InvalidNodeContentError when a node's content is not what its kind shows, naming the node.
 * @throws InvalidEdgeIconError when an edge's branch icon names an icon or logo there is none of,
 * naming the edge, with the UnknownIconError or UnknownLogoError as its cause.
 * @throws InvalidGraphError when the graph cannot be laid out as written.
 */
export function drawDiagramFile(file: DiagramFile, theme: Theme): string {
  const built = file.nodes.map((entry) => build(entry, theme));
  const branchIcons = new Map(
    file.edges.flatMap(({ id, branchIcon }) =>
      branchIcon === undefined ? [] : [[id, branchIconOf(id, branchIcon, theme)] as const],
    ),
  );
  const edges = file.edges.map(({ id, from, to }) =>
    branchIcons.has(id) ? { id, from, to, room: EDGE_ICON_RADIUS } : { id, from, to },
  );
  const layout = placeGraph(
    { direction: file.direction, nodes: built.map(({ node }) => node), edges },
    SPACING,
  );
  const nodes = new Map(built.flatMap(({ leaves }) => leaves).map((node) => [node.leaf.id, node]));
  const { header, background } = file;
  return drawDiagram(layout, nodes, {
    branchIcons,
    ...(background === undefined ? {} : { background }),
    ...(header === undefined ? {} : { header: { ...header, fonts: theme.fonts } }),
  });
}

function branchIconOf(id: string, content: IconContent, theme: Theme): EdgeIcon {
  try {
    return edgeIcon(content, theme);
  } catch (error) {
    if (error instanceof UnknownLogoError) {
      throw new InvalidEdgeIconError(
        `The branch icon of edge "${id}" names the logo "${error.logo}", which the theme does not hold.`,
        { cause: error },
      );
    }
    if (error instanceof UnknownIconError) {
      throw new InvalidEdgeIconError(
        `The branch icon of edge "${id}" names the icon "${error.icon}", which is neither a built-in icon nor a custom one.`,
        { cause: error },
      );
    }
    throw error;
  }
}

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
