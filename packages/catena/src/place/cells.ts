import type { Cell, Direction, GraphEdge, GraphNode } from "./graph";
import { InvalidGraphError } from "./graph";

const keyOf = (cell: Cell): string => `${cell.row}:${cell.column}`;

/** The cell `slot` places across the flow, in the `level`-th step along it. */
function cellAt(level: number, slot: number, direction: Direction): Cell {
  return direction === "down" ? { row: level, column: slot } : { row: slot, column: level };
}

function levelOf(cell: Cell, direction: Direction): number {
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
 * listed earlier leads to a node: an edge from a later one goes back, and moves nothing.
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
  const levels = new Map<string, number>();
  for (const node of nodes) {
    if (node.cell !== undefined) {
      cells.set(node.id, node.cell);
      levels.set(node.id, levelOf(node.cell, direction));
      continue;
    }
    // Only nodes listed earlier have a level yet, so an edge that goes back adds nothing here.
    const pastEarlier = edges
      .filter((edge) => edge.to === node.id)
      .flatMap((edge) => {
        const level = levels.get(edge.from);
        return level === undefined ? [] : [level + 1];
      });
    const level = Math.max(0, ...pastEarlier);
    let slot = 0;
    while (holders.has(keyOf(cellAt(level, slot, direction)))) {
      slot += 1;
    }
    const cell = cellAt(level, slot, direction);
    holders.set(keyOf(cell), node.id);
    cells.set(node.id, cell);
    levels.set(node.id, level);
  }
  return cells;
}
