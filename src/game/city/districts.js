import {sampleTrack, projectTrack, trackLength} from '../../../shared/track.js';
import {randomSource} from './geometry.js';

export function districtAt(progress) {
  return progress < .34 ? 'boulevard' : progress < .68 ? 'oldtown' : 'works';
}

export function lotsOverlap(a, b, margin = .4) {
  for (const angle of [a.rotation, a.rotation + Math.PI / 2, b.rotation, b.rotation + Math.PI / 2]) {
    const ax = Math.cos(angle), az = -Math.sin(angle);
    const radius = lot => Math.abs(Math.cos(lot.rotation) * ax - Math.sin(lot.rotation) * az) * lot.width / 2 +
      Math.abs(Math.sin(lot.rotation) * ax + Math.cos(lot.rotation) * az) * lot.depth / 2;
    if (Math.abs((a.x - b.x) * ax + (a.z - b.z) * az) >= radius(a) + radius(b) + margin) return false;
  }
  return true;
}

export function createDistrictLayout() {
  const random = randomSource(34081), lots = [];
  for (let s = 5; s < trackLength; s += 27) for (const side of [-1, 1]) {
    const p = sampleTrack(s), district = districtAt(s / trackLength);
    const width = 18 + random() * 5, depth = 11 + random() * 5;
    const offset = 13 + depth / 2 + (district === 'works' ? 2 : 0);
    const x = p.x + p.nx * side * offset, z = p.z + p.nz * side * offset;
    const rotation = p.heading - side * Math.PI / 2;
    const corners = [-1, 1].flatMap(a => [-1, 1].map(b => ({
      x: x + Math.cos(rotation) * a * width / 2 + Math.sin(rotation) * b * depth / 2,
      z: z - Math.sin(rotation) * a * width / 2 + Math.cos(rotation) * b * depth / 2
    })));
    if (corners.some(c => projectTrack(c.x, c.z).distance < 11.2)) continue;
    const floors = district === 'works' ? 2 + Math.floor(random() * 2) : 3 + Math.floor(random() * 3);
    const lot = {x, z, width, depth, floors, height: 3.7 + floors * 3.05, rotation, district, index: lots.length, s};
    if (!lots.some(other => lotsOverlap(lot, other))) lots.push(lot);
  }
  return lots;
}
