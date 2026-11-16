import type { Cell, Direction, GraphEdge, GraphNode } from "./graph";
import { InvalidGraphError } from "./graph";

const keyOf = (cell: Cell): string => `${cell.row}:${cell.column}`;

/** The cell `step` steps along the flow and `place` places across it. */
function cellAt(step: number, place: number, direction: Direction): Cell {
  return direction === "down" ? { row: step, column: place } : { row: place, column: step };
}

function stepOf(cell: Cell, direction: Direction): number {
  return direction === "down" ? cell.row : cell.column;
}

function requireCell(node: GraphNode, cell: Cell): void {
  for (const value of [cell.row, cell.column]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new InvalidGraphError(
        `Node "${node.id}" is put in row ${cell.row}, column ${cell.column}, which is not a cell.`,
      );
    }
  }
}

/**
 * Gives every node of one grid a cell.
 *
 * A node that names its cell gets it. Any other node goes one step along the flow past the furthest
 * node that leads to it, and takes the first free place across the flow. Only an edge from a node
 * listed earlier leads to a node: an edge from a later one goes back, and moves nothing, whether or
 * not that later node names its cell.
 *
 * @param edges Edges between nodes of this grid.
 * @throws InvalidGraphError when a node names a cell that is not one, or two nodes name the same cell.
 */
export function assignCells(
  nodes: readonly GraphNode[],
  direction: Direction,
  edges: readonly GraphEdge[],
): Map<string, Cell> {
  const holders = new Map<string, string>();
  for (const node of nodes) {
    if (node.cell === undefined) {
      continue;
    }
    requireCell(node, node.cell);
    const holder = holders.get(keyOf(node.cell));
    if (holder !== undefined) {
      throw new InvalidGraphError(
        `Nodes "${holder}" and "${node.id}" are both put in row ${node.cell.row}, column ${node.cell.column}.`,
      );
    }
    holders.set(keyOf(node.cell), node.id);
  }

  const cells = new Map<string, Cell>();
  const steps = new Map<string, number>();
  for (const node of nodes) {
    if (node.cell !== undefined) {
      cells.set(node.id, node.cell);
      steps.set(node.id, stepOf(node.cell, direction));
      continue;
    }
    let step = 0;
    for (const edge of edges) {
      const from = edge.to === node.id ? steps.get(edge.from) : undefined;
      if (from !== undefined) {
        step = Math.max(step, from + 1);
      }
    }
    let place = 0;
    while (holders.has(keyOf(cellAt(step, place, direction)))) {
      place += 1;
    }
    const cell = cellAt(step, place, direction);
    holders.set(keyOf(cell), node.id);
    cells.set(node.id, cell);
    steps.set(node.id, step);
  }
  return cells;
}
