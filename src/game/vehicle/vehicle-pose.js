import {clamp, projectTrack} from '../../../shared/track.js';
import {roadSurfaceHeight} from '../../../shared/road-surface.js';

export const VEHICLE = Object.freeze({wheelRadius: .358, wheelbase: 2.65, track: 1.67, eyeX: .346, eyeY: .98, eyeZ: -.10});

export function vehiclePose(state, previousSpeed, dt) {
  const step = clamp(Number.isFinite(dt) ? dt : 0, 0, .06);
  const acceleration = step > .001 ? clamp((state.speed - previousSpeed) / step, -15, 9) : 0;
  const lateral = state.speed * state.speed / VEHICLE.wheelbase * Math.tan(state.wheelAngle || 0);
  const heights = [];
  for (const z of [-1.495, 1.155]) for (const x of [-.835, .835]) {
    const wx = state.x + Math.cos(state.heading) * x + Math.sin(state.heading) * z;
    const wz = state.z - Math.sin(state.heading) * x + Math.cos(state.heading) * z;
    heights.push(roadSurfaceHeight(projectTrack(wx, wz).offset));
  }
  return {
    supports: heights,
    height: heights.reduce((a, b) => a + b) / 4,
    pitch: clamp(-acceleration * .0018 + ((heights[0] + heights[1]) - (heights[2] + heights[3])) / (2 * VEHICLE.wheelbase), -.045, .045),
    roll: clamp(lateral * .0015 + ((heights[1] + heights[3]) - (heights[0] + heights[2])) / (2 * VEHICLE.track), -.055, .055),
    spin: state.speed * step / VEHICLE.wheelRadius
  };
}

// High eye positions lean forward beneath the convertible header, without
// deforming the frame or changing the requested vertical displacement.
export function cockpitForwardOffset(height) {
  const t=clamp((height-.10)/.03,0,1);
  return VEHICLE.eyeZ+.50*t*t*(3-2*t);
}
