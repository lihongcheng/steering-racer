import * as THREE from 'three';
import {StaticBatch, textTexture, randomSource} from './geometry.js';

export function createBuildings(scene, lots, m) {
  const batch = new StaticBatch(), random = randomSource(991), roofBatch = new StaticBatch();
  const shops = [['ATELIER', 'DESIGN & OBJECTS', '#344e51'], ['MORNING', 'COFFEE  ·  BAKERY', '#765546'],
    ['CYCLES', 'SERVICE  &  REPAIR', '#33473d'], ['WEST & CO.', 'BOOKS  ·  PRINT  ·  PAPER', '#374752'],
    ['NORTH FREIGHT', 'WAREHOUSE  /  07', '#505958'], ['PORT GARAGE', 'MOTOR WORKS', '#5a4c3b']];
  const signs = shops.map(([text, subtitle, background]) => new THREE.MeshStandardMaterial({map: textTexture(text, {subtitle, background}), roughness: .8}));
  const pane = new THREE.PlaneGeometry(1, 1);
  const occluders = [];
  for (const lot of lots) {
    const {x, z, width: w, depth: d, height: h, rotation: a, floors, district, index} = lot;
    const windowGlass=m.districtGlass[district];
    const world = (lx, lz) => [x + Math.cos(a) * lx + Math.sin(a) * lz, z - Math.sin(a) * lx + Math.cos(a) * lz];
    const box = (mat, lx, y, lz, sx, sy, sz, turn = 0) => { const p = world(lx, lz); batch.box(mat, p[0], y, p[1], sx, sy, sz, a + turn); };
    const face = (mat, lx, y, lz, sx, sy, turn = 0) => { const p = world(lx, lz); batch.add(pane, mat, p[0], y, p[1], a + turn, [sx, sy, 1]); };
    const wall = district === 'oldtown' ? (index % 2 ? m.brick : m.darkBrick) : district === 'works' ? m.concrete : index % 3 ? m.plaster : m.warmPlaster;
    box(wall, 0, h / 2, -.25, w, h, d - .5);
    box(m.concrete, 0, .45, 0, w + .10, .9, d);
    box(m.trim, 0, h, 0, w + .35, .3, d + .25);
    box(m.roof, 0, h + .11, 0, w - .2, .09, d - .2);
    for (const side of [-1, 1]) box(wall, side * (w / 2 - .15), h / 2, d / 2 - .12, .3, h, .35);
    const count = Math.floor(w / 3.1), spacing = (w - 1.3) / count;
    for (let floor = 0; floor < floors; floor++) {
      const y = 4.9 + floor * 3.05;
      box(m.trim, 0, y - 1.53, d / 2 + .025, w + .12, .13, .22);
      for (let col = 0; col < count; col++) {
        const lx = -w / 2 + .65 + (col + .5) * spacing, ww = district === 'works' ? 2.0 : 1.42, wh = district === 'works' ? 1.1 : 1.72;
        box(m.interior, lx, y, d / 2 - .19, ww + .12, wh + .12, .045);
        box(random() > .3 ? windowGlass : m.darkGlass, lx, y, d / 2 - .15, ww, wh, .018);
        for (const side of [-1, 1]) box(m.trim, lx + side * (ww / 2 + .05), y, d / 2 - .025, .09, wh + .18, .18);
        box(m.trim, lx, y - wh / 2 - .07, d / 2 + .08, ww + .28, .10, .32);
        box(m.trim, lx, y + wh / 2 + .035, d / 2 -.01, ww + .23, .09, .19);
        box(m.metal, lx, y, d / 2 - .12, .045, wh, .04);
        if (index % 3 === 0) box(m.metal, lx, y, d / 2 - .12, ww, .035, .04);
        if (random() > .68) box(m.curb, lx, y + wh * .3, d / 2 - .10, ww - .08, .4, .012);
        if (district === 'oldtown' && floor === 0 && col % 2 === 0) {
          box(m.trim, lx, y - 1.08, d / 2 + .24, ww + .55, .10, .72);
          box(m.metal, lx, y - .58, d / 2 + .57, ww + .50, .05, .04);
          for (let i = -3; i <= 3; i++) box(m.metal, lx + i * .24, y - .85, d / 2 + .57, .026, .5, .03);
        }
      }
    }
    // Side elevations are modeled, rather than reusing a window-filled box texture.
    for (const side of [-1, 1]) for (let floor = 0; floor < floors; floor++) for (let col = 0; col < 3; col++) {
      const y = 4.9 + floor * 3.05, zz = -d / 2 + 2.5 + col * (d - 5) / 2;
      box(m.darkGlass, side * (w / 2 + .016), y, zz, .025, 1.65, 1.2);
      box(m.trim, side * (w / 2 + .075), y - .90, zz, .22, .10, 1.4);
    }
    const shopCount = district === 'works' ? 2 : 3;
    for (let i = 0; i < shopCount; i++) {
      const sw = (w - 1.4) / shopCount, lx = -w / 2 + .7 + sw * (i + .5);
      box(m.interior, lx, 1.63, d / 2 - .12, sw - .28, 2.68, .06);
      box(windowGlass, lx, 1.67, d / 2 - .075, sw - .42, 2.47, .02);
      for (const side of [-1, 1]) box(m.metal, lx + side * (sw / 2 - .17), 1.63, d / 2 + .01, .08, 2.7, .12);
      box(m.metal, lx + sw * .15, 1.63, d / 2 + .01, .06, 2.7, .10);
      box(m.trim, lx + sw * .25, 1.35, d / 2 + .09, .035, .42, .03);
      const sign = district === 'works' ? signs[4 + index % 2] : signs[(index + i) % 4];
      face(sign, lx, 3.13, d / 2 + .06, sw - .1, .68);
      if (district !== 'works' && i % 2 === 0) {
        box(m.fabric, lx, 2.83, d / 2 + .54, sw, .10, 1.1);
        box(m.fabric, lx, 2.68, d / 2 + 1.06, sw, .25, .045);
      }
    }
    for (let unit = 0; unit < 2; unit++) {
      const p = world(-w * .25 + unit * w * .5, -d * .15);
      roofBatch.box(m.metal, p[0], h + .62, p[1], 2.6, 1.0, 1.5, a);
      roofBatch.box(m.trim, p[0], h + 1.14, p[1], 2.7, .07, 1.6, a);
    }
    occluders.push(lot);
  }
  const group = new THREE.Group(); group.name = 'modeled-street-blocks'; scene.add(group);
  const meshes = batch.build(group); roofBatch.build(group);
  pane.dispose();
  return {group, occluders, meshes};
}

export function createDistantCity(scene, m) {
  const batch = new StaticBatch(), random = randomSource(188);
  for (let i = 0; i < 65; i++) {
    const angle = i / 65 * Math.PI * 2, radius = 260 + random() * 150, height = 18 + random() * 54;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius, w = 16 + random() * 18;
    batch.box(i % 3 ? m.concrete : m.warmPlaster, x, height / 2, z, w, height, 18);
    for (let floor = 3; floor < height; floor += 3.6) batch.box(m.darkGlass, x, floor, z + 9.01, w - 2, 1.3, .025);
  }
  const group = new THREE.Group(); group.name = 'distant-city'; scene.add(group); batch.build(group, false); return group;
}
