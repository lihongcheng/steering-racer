import * as THREE from 'three';
import {sampleTrack, segments, trackLength} from '../../../shared/track.js';
import {ROAD_Y, roadSurfaceHeight} from '../../../shared/road-surface.js';
import {StaticBatch, textTexture} from './geometry.js';

function ribbon(low, high, y, material, repeat = 4) {
  const positions = [], uv = [], indices = [];
  for (let i = 0; i <= segments.length; i++) {
    const segment = segments[i % segments.length], s = i === segments.length ? trackLength : segment.start;
    for (const offset of [low, high]) {
      positions.push(segment.a.x + segment.nx * offset, typeof y === 'function' ? y(offset) : y, segment.a.z + segment.nz * offset);
      uv.push(offset / repeat, s / repeat);
    }
    if (i < segments.length) { const n = 2 * i; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; return mesh;
}

export function createRoad(scene, materials) {
  const group = new THREE.Group(); group.name = 'city-road'; scene.add(group);
  group.add(ribbon(-6.4, 6.4, ROAD_Y, materials.road, 3));
  for (const side of [-1, 1]) {
    const sorted = pair => pair.map(v => side * v).sort((a, b) => a - b);
    group.add(ribbon(...sorted([6.4, 6.65]), roadSurfaceHeight, materials.curb));
    group.add(ribbon(...sorted([6.65, 10.1]), ROAD_Y + .16, materials.paving, 3));
    group.add(ribbon(...sorted([5.94, 6.02]), ROAD_Y + .006, materials.white));
    group.add(ribbon(...sorted([.09, .16]), ROAD_Y + .006, materials.yellow));
  }
  const batch = new StaticBatch();
  for (let s = 0; s < trackLength; s += 6) {
    const p = sampleTrack(s);
    if (s % 12 === 0) for (const side of [-1, 1]) batch.box(materials.white, p.x + p.nx * side * 3.15, .109, p.z + p.nz * side * 3.15, .10, .006, 3.2, p.heading);
    for (const side of [-1, 1]) {
      const x = p.x + p.nx * side * 10.2, z = p.z + p.nz * side * 10.2;
      // Track edge at 10 m matches the existing center-based collision margin.
      batch.box(materials.concrete, x, .57, z, .44, .90, 5.94, p.heading);
      batch.box(materials.trim, x, 1.025, z, .49, .06, 5.94, p.heading);
      if (s % 24 === 0) {
        batch.box(materials.rubber, p.x + p.nx * side * 6.12, .112, p.z + p.nz * side * 6.12, .36, .012, .7, p.heading);
        for (let j = -2; j <= 2; j++) {
          const q = sampleTrack(s + j * .12);
          batch.box(materials.metal, q.x + q.nx * side * 6.12, .123, q.z + q.nz * side * 6.12, .36, .01, .025, q.heading);
        }
      }
    }
    if (s % 48 === 0) {
      const disk = new THREE.CylinderGeometry(.32, .32, .012, 24);
      batch.add(disk, materials.metal, p.x + p.nx * 1.8, .112, p.z + p.nz * 1.8); disk.dispose();
    }
  }
  batch.build(group);
  const infrastructure = new StaticBatch();
  for (let s = 14; s < trackLength; s += 34) {
    const p = sampleTrack(s), side = Math.floor(s / 34) % 2 ? 1 : -1;
    const x = p.x + p.nx * side * 9.0, z = p.z + p.nz * side * 9.0;
    const pole = new THREE.CylinderGeometry(.065, .11, 7.2, 8);
    infrastructure.add(pole, materials.metal, x, 3.85, z); pole.dispose();
    infrastructure.box(materials.metal, x - p.nx * side * 1.1, 7.45, z - p.nz * side * 1.1, 2.2, .07, .07, p.heading);
    infrastructure.box(materials.metal, x - p.nx * side * 2.1, 7.41, z - p.nz * side * 2.1, .8, .10, .27, p.heading);
    infrastructure.box(materials.white, x - p.nx * side * 2.1, 7.35, z - p.nz * side * 2.1, .65, .013, .20, p.heading);
  }
  infrastructure.build(group);
  const start = sampleTrack(0), gantry = new THREE.Group();
  gantry.position.set(start.x, 0, start.z); gantry.rotation.y = start.heading; group.add(gantry);
  const structure = new StaticBatch();
  for (const x of [-9, 9]) structure.box(materials.metal, x, 3.6, 0, .18, 7.2, .18);
  structure.box(materials.metal, 0, 7, 0, 18, .16, .2); structure.build(gantry);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 1.1), new THREE.MeshStandardMaterial({map: textTexture('GREYPORT', {subtitle: 'CITY CIRCUIT  /  START — FINISH'}), roughness: .8, side: THREE.DoubleSide}));
  banner.position.set(0, 6.65, 0); banner.rotation.y = Math.PI; gantry.add(banner);
  const line = new StaticBatch();
  for (let x = -6; x < 6; x += .5) for (let z = 0; z < 1.5; z += .5)
    line.box(((x * 2 + z * 2) % 2) ? materials.white : materials.rubber, x + .25, .112, z + .25, .5, .006, .5);
  line.build(gantry, false);
  return group;
}
