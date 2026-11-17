import type { Cell, Direction, EdgeEnds, GraphNode } from "./graph";
import { InvalidGraphError } from "./graph";
import { keyOf, type Spot } from "./spot";

/** The spot of a cell in a grid that flows in `direction`. */
function spotOf(cell: Cell, direction: Direction): Spot {
  return direction === "down"
    ? { step: cell.row, place: cell.column }
    : { step: cell.column, place: cell.row };
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

function ranksOf(indices: readonly number[]): Map<number, number> {
  const inUse = [...new Set(indices)].toSorted((a, b) => a - b);
  return new Map(inUse.map((index, rank) => [index, rank]));
}

/**
 * Gives every node of one grid a spot, counting only the rows and columns that hold a node.
 *
 * A node that names its cell gets it. Any other node goes one step along the flow past the furthest
 * node that leads to it, and takes the first free place across the flow. Only an edge from a node
 * listed earlier leads to a node: an edge from a later one goes back, and moves nothing, whether or
 * not that later node names its cell.
 *
 * @param edges Edges between nodes of this grid.
 * @returns The spots, in the order of `nodes`.
 * @throws InvalidGraphError when a node names a cell that is not one, or two nodes name the same cell.
 */
export function assignSpots(
  nodes: readonly GraphNode[],
  direction: Direction,
  edges: readonly EdgeEnds[],
): Map<string, Spot> {
  const holders = new Map<string, string>();
  for (const node of nodes) {
    if (node.cell === undefined) {
      continue;
    }
    requireCell(node, node.cell);
    const key = keyOf(spotOf(node.cell, direction));
    const holder = holders.get(key);
    if (holder !== undefined) {
      throw new InvalidGraphError(
        `Nodes "${holder}" and "${node.id}" are both put in row ${node.cell.row}, column ${node.cell.column}.`,
      );
    }
    holders.set(key, node.id);
  }

  const spots = new Map<string, Spot>();
  for (const node of nodes) {
    if (node.cell !== undefined) {
      spots.set(node.id, spotOf(node.cell, direction));
      continue;
    }
    let step = 0;
    for (const edge of edges) {
      const from = edge.to === node.id ? spots.get(edge.from)?.step : undefined;
      if (from !== undefined) {
        step = Math.max(step, from + 1);
      }
    }
    let place = 0;
    while (holders.has(keyOf({ step, place }))) {
      place += 1;
    }
    holders.set(keyOf({ step, place }), node.id);
    spots.set(node.id, { step, place });
  }

  const steps = ranksOf([...spots.values()].map((spot) => spot.step));
  const places = ranksOf([...spots.values()].map((spot) => spot.place));
  return new Map(
    [...spots].map(([id, spot]) => [
      id,
      { step: steps.get(spot.step) ?? 0, place: places.get(spot.place) ?? 0 },
    ]),
  );
}
