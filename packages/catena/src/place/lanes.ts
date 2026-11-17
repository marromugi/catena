import { keyOf, type Spot } from "./spot";

/** What lies around a grid, as an end of an edge that crosses the grid's border. */
export const outside: unique symbol = Symbol("outside");

/** An end of an edge in one grid: a node of the grid, or the outside. */
export type End = string | typeof outside;

/**
 * How the edges between a grid and the outside cross its border, each at the middle of a side:
 * - "along": along the flow, in at the side before the first row and out at the side after the last;
 * - "across": across the flow, in at the side before the first column and out at the side after the last.
 */
export type BorderCrossing = "along" | "across";

export type Run =
  | {
      readonly id: string;
      readonly from: string;
      readonly to: string;
      /** Whether the edge starts inside `from`, not at it. */
      readonly startsInside: boolean;
      /** Whether the edge ends inside `to`, not at it. */
      readonly endsInside: boolean;
    }
  | {
      readonly id: string;
      readonly from: typeof outside;
      readonly to: string;
      readonly startsInside: false;
      readonly endsInside: boolean;
    }
  | {
      readonly id: string;
      readonly from: string;
      readonly to: typeof outside;
      readonly startsInside: boolean;
      readonly endsInside: false;
    };

/**
 * How an edge runs from its source to its target. It leaves a node, and enters one, along the flow:
 * - "straight": in one stretch, to the node right after its source;
 * - "direct": along the lane of its source, then into its target in the next row;
 * - "joining": straight on from its source to the lane of its target, then along that lane;
 * - "around": along the lane of its source, along a lane in the corridor before the column `beside`,
 *   then along the lane of its target;
 * - "fromBeside": from the outside across the flow to the outside's lane in the corridor before the
 *   column `beside`, along that lane, then along the lane of its target;
 * - "toBeside": along the lane of its source, along the outside's lane in the corridor `beside`, the
 *   one after the last column, then across the flow to the outside.
 */
export type Route =
  | { readonly kind: "straight" }
  | { readonly kind: "direct" }
  | { readonly kind: "joining" }
  | { readonly kind: "around"; readonly beside: number }
  | { readonly kind: "fromBeside"; readonly beside: number }
  | { readonly kind: "toBeside"; readonly beside: number };

/**
 * The lanes the edges of one grid run in. A corridor is the room before a row or a column, or after the
 * last one, and is counted by the row or column after it. Every list names nodes in the order of their lanes.
 */
export interface Lanes {
  /** The route of each edge, by its id. */
  readonly routes: ReadonlyMap<string, Route>;
  /** For each corridor between rows, the nodes of the row before it whose edges turn in it, the nearest to that row first. Before the first row, the outside when an edge comes in from it along the flow. */
  readonly leaving: readonly (readonly End[])[];
  /** For each corridor between rows, the nodes of the row after it that edges run to along a lane in it, rather than dropping into them from their source's lane. Their lanes follow those of `leaving`. After the last row, the outside when an edge goes out to it along the flow. */
  readonly entering: readonly (readonly End[])[];
  /** For each corridor between columns, the ends whose edges run along it. */
  readonly beside: readonly (readonly End[])[];
}

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
  readonly #later = new Map<End, Set<End>>();

  #precedes(first: End, second: End): boolean {
    const seen = new Set<End>([first]);
    const open: End[] = [first];
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
  put(first: End, second: End): boolean {
    if (this.#precedes(second, first)) {
      return false;
    }
    const later = this.#later.get(first) ?? new Set<End>();
    later.add(second);
    this.#later.set(first, later);
    return true;
  }

  /** `ids` in an order that keeps every pair put so far, and otherwise as given. */
  sorted(ids: readonly End[]): End[] {
    const waiting = new Set(ids);
    const earlier = new Map(ids.map((id) => [id, 0]));
    for (const id of ids) {
      for (const later of this.#later.get(id) ?? []) {
        earlier.set(later, (earlier.get(later) ?? 0) + 1);
      }
    }
    const sorted: End[] = [];
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
 * beside its source to the lane of its target, in the corridor before the target's row. Every edge that
 * runs to a node along a lane, whether it comes around or comes in from the outside beside the columns,
 * shares that lane.
 *
 * Where the border is crossed along the flow, the outside has a lane like a node's at each end of the
 * grid: the one its edges come in along is the first of the corridor before the first row, and the one
 * its edges go out along is the last of the corridor after the last row. An edge from the outside is
 * direct to a node of the first row, and an edge to the outside is joining from a node of the last row.
 * To or from any other row it goes around, through the corridor beside its node on the side of the
 * middle of the columns, or before a node in the middle one.
 *
 * Where the border is crossed across the flow, the outside has a lane beside the columns at each side
 * of the grid, the nearest to the border: the one its edges come in to is the first of the corridor
 * before the first column, and the one its edges go out from is the last of the corridor after the last
 * column. An edge from the outside runs along the first to the lane of its target, and an edge to the
 * outside runs from the lane of its source along the second.
 *
 * @param spots The nodes of the grid in the order they are listed, with no row or column left empty.
 */
export function assignLanes(
  spots: ReadonlyMap<string, Spot>,
  edges: readonly Run[],
  border: BorderCrossing,
): Lanes {
  const rows: string[][] = [];
  let places = 0;
  for (const [id, spot] of spots) {
    (rows[spot.step] ??= []).push(id);
    places = Math.max(places, spot.place + 1);
  }
  const holders = new Map([...spots].map(([id, spot]) => [keyOf(spot), id]));
  const towardTheMiddle = ({ place }: Spot): number => (place * 2 + 1 < places ? place + 1 : place);

  const order = new LaneOrder();
  const routeBetween = (edge: Run): Route => {
    if (edge.from === outside) {
      if (border === "across") {
        return { kind: "fromBeside", beside: 0 };
      }
      const to = spotOf(spots, edge.to);
      return to.step === 0 ? { kind: "direct" } : { kind: "around", beside: towardTheMiddle(to) };
    }
    const from = spotOf(spots, edge.from);
    if (edge.to === outside) {
      if (border === "across") {
        return { kind: "toBeside", beside: places };
      }
      return from.step === rows.length - 1
        ? { kind: "joining" }
        : { kind: "around", beside: towardTheMiddle(from) };
    }
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
  const turning = new Set<End>();
  const entering = new Set<End>();
  const beside = Array.from({ length: places + 1 }, () => new Set<End>());
  for (const edge of edges) {
    const route = routeBetween(edge);
    routes.set(edge.id, route);
    if (route.kind === "direct" || route.kind === "around" || route.kind === "toBeside") {
      turning.add(edge.from);
    }
    if (route.kind === "joining" || route.kind === "around" || route.kind === "fromBeside") {
      entering.add(edge.to);
    }
    if (route.kind === "around") {
      beside[route.beside]?.add(edge.from);
    }
    if (route.kind === "fromBeside" || route.kind === "toBeside") {
      beside[route.beside]?.add(outside);
    }
  }

  const besideIn = (corridor: number): readonly End[] =>
    corridor === places ? [...spots.keys(), outside] : [outside, ...spots.keys()];
  const inRow = (step: number): readonly End[] => rows[step] ?? [outside];
  return {
    routes,
    leaving: Array.from({ length: rows.length + 1 }, (_, corridor) =>
      order.sorted(inRow(corridor - 1).filter((id) => turning.has(id))),
    ),
    entering: Array.from({ length: rows.length + 1 }, (_, corridor) =>
      inRow(corridor).filter((id) => entering.has(id)),
    ),
    beside: beside.map((besideIt, corridor) =>
      besideIn(corridor).filter((end) => besideIt.has(end)),
    ),
  };
}
