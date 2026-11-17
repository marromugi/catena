import type { GraphEdge } from "./graph";

/**
 * Where a node sits in its grid: `step` rows along the flow and `place` columns across it,
 * counting only the rows and columns that hold a node.
 */
export interface Spot {
  readonly step: number;
  readonly place: number;
}

/**
 * How an edge runs from its source, which it leaves along the flow, to its target, which it enters along the flow:
 * - "straight": in one stretch, to the node right after its source;
 * - "direct": along the lane of its source, then into its target in the next row;
 * - "around": along the lane of its source, along a lane in the corridor before the column `beside`,
 *   then along the lane of its target.
 */
export type Route =
  | { readonly kind: "straight" }
  | { readonly kind: "direct" }
  | { readonly kind: "around"; readonly beside: number };

/**
 * The lanes the edges of one grid run in. A corridor is the room before a row or a column, or after the
 * last one, and is counted by the row or column after it. Every list names nodes in the order of their lanes.
 */
export interface Lanes {
  /** The route of each edge, by its id. */
  readonly routes: ReadonlyMap<string, Route>;
  /** For each corridor between rows, the nodes of the row before it whose edges turn in it, the nearest to that row first. */
  readonly leaving: readonly (readonly string[])[];
  /** For each corridor between rows, the nodes of the row after it that edges come around to. Their lanes follow those of `leaving`. */
  readonly entering: readonly (readonly string[])[];
  /** For each corridor between columns, the nodes whose edges go around through it. */
  readonly beside: readonly (readonly string[])[];
}

const keyOf = (spot: Spot): string => `${spot.step}:${spot.place}`;

function spotOf(spots: ReadonlyMap<string, Spot>, id: string): Spot {
  const spot = spots.get(id);
  if (spot === undefined) {
    throw new Error(`Node "${id}" has no spot, though an edge of its grid connects it.`);
  }
  return spot;
}

function isStraight(from: Spot, to: Spot): boolean {
  return to.step === from.step + 1 && to.place === from.place;
}

/** The corridor an edge goes around through: beside its source, on the side of its target, or after it when they share a column. */
function corridorBeside(from: Spot, to: Spot): number {
  return to.place < from.place ? from.place : from.place + 1;
}

/** Which lanes must come before which, each node having one lane. */
class LaneOrder {
  readonly #later = new Map<string, Set<string>>();

  /** Whether the lane of `first` already has to come before that of `second`. */
  #precedes(first: string, second: string): boolean {
    const seen = new Set<string>([first]);
    const open = [first];
    for (let id = open.pop(); id !== undefined; id = open.pop()) {
      for (const next of this.#later.get(id) ?? []) {
        if (next === second) {
          return true;
        }
        if (!seen.has(next)) {
          seen.add(next);
          open.push(next);
        }
      }
    }
    return false;
  }

  /** Puts the lane of `first` before that of `second`, unless the order so far has them the other way round. */
  put(first: string, second: string): boolean {
    if (this.#precedes(second, first)) {
      return false;
    }
    const later = this.#later.get(first) ?? new Set<string>();
    later.add(second);
    this.#later.set(first, later);
    return true;
  }

  /** `ids` in an order that keeps every pair put so far, and otherwise as given. */
  sorted(ids: readonly string[]): string[] {
    const waiting = new Set(ids);
    const earlier = new Map(ids.map((id) => [id, 0]));
    for (const id of ids) {
      for (const later of this.#later.get(id) ?? []) {
        earlier.set(later, (earlier.get(later) ?? 0) + 1);
      }
    }
    const sorted: string[] = [];
    while (waiting.size > 0) {
      const next = [...waiting].find((id) => earlier.get(id) === 0);
      if (next === undefined) {
        throw new Error(
          "The lanes cannot be put in order, though no pair is ever put both ways round.",
        );
      }
      waiting.delete(next);
      sorted.push(next);
      for (const later of this.#later.get(next) ?? []) {
        earlier.set(later, (earlier.get(later) ?? 0) - 1);
      }
    }
    return sorted;
  }
}

/**
 * Gives every edge of one grid its route, and every lane its place in its corridor.
 *
 * All the edges that leave a node share one lane, in the corridor after its row. An edge to the next row
 * drops from that lane straight into its target. The node right before the target may have a lane of its
 * own, which its edges run out to along the same line: that lane then comes first, so the drop starts
 * past it, and where two nodes would each have to come first, the later edge goes around instead. An
 * edge straight from that node into the target is one the drop may join. Every other edge goes around: through a corridor
 * beside its source to the lane of its target, in the corridor before the target's row. All the edges
 * that come around to a node share that lane.
 *
 * @param spots The nodes of the grid, in the order they are listed.
 * @param edges Edges between nodes of this grid.
 */
export function assignLanes(spots: ReadonlyMap<string, Spot>, edges: readonly GraphEdge[]): Lanes {
  const rows: string[][] = [];
  let places = 0;
  for (const [id, spot] of spots) {
    (rows[spot.step] ??= []).push(id);
    places = Math.max(places, spot.place + 1);
  }
  const holders = new Map([...spots].map(([id, spot]) => [keyOf(spot), id]));

  const turning = new Set<string>();
  for (const edge of edges) {
    if (!isStraight(spotOf(spots, edge.from), spotOf(spots, edge.to))) {
      turning.add(edge.from);
    }
  }

  const order = new LaneOrder();
  const routeBetween = (edge: GraphEdge): Route => {
    const from = spotOf(spots, edge.from);
    const to = spotOf(spots, edge.to);
    if (isStraight(from, to)) {
      return { kind: "straight" };
    }
    if (to.step === from.step + 1) {
      const before = holders.get(keyOf({ step: from.step, place: to.place }));
      if (before === undefined || order.put(before, edge.from)) {
        return { kind: "direct" };
      }
    }
    return { kind: "around", beside: corridorBeside(from, to) };
  };

  const routes = new Map<string, Route>();
  const entering = new Set<string>();
  const beside = Array.from({ length: places + 1 }, () => new Set<string>());
  for (const edge of edges) {
    const route = routeBetween(edge);
    routes.set(edge.id, route);
    if (route.kind === "around") {
      entering.add(edge.to);
      beside[route.beside]?.add(edge.from);
    }
  }

  const inRow = (step: number): readonly string[] => rows[step] ?? [];
  return {
    routes,
    leaving: Array.from({ length: rows.length + 1 }, (_, corridor) =>
      order.sorted(inRow(corridor - 1).filter((id) => turning.has(id))),
    ),
    entering: Array.from({ length: rows.length + 1 }, (_, corridor) =>
      inRow(corridor).filter((id) => entering.has(id)),
    ),
    beside: beside.map((nodes) => [...spots.keys()].filter((id) => nodes.has(id))),
  };
}
