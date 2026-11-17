/**
 * Where a node sits in its grid: `step` rows along the flow and `place` columns across it.
 */
export interface Spot {
  readonly step: number;
  readonly place: number;
}

export const keyOf = (spot: Spot): string => `${spot.step}:${spot.place}`;
