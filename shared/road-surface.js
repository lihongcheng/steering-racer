import {clamp} from './track.js';

export const ROAD_Y = .1;
export function roadSurfaceHeight(offset) {
  const t = clamp((Math.abs(offset) - 6.4) / .25, 0, 1);
  return ROAD_Y + .16 * t * t * (3 - 2 * t);
}
