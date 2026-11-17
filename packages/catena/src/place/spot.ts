/**
 * Where a node sits in its grid: `step` counts along the flow and `place` across it, each from 0.
 */
export interface Spot {
  readonly step: number;
  readonly place: number;
}

export const keyOf = (spot: Spot): string => `${spot.step}:${spot.place}`;
