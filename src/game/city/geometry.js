import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function randomSource(seed = 7709) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

// Merge by material within each block, retaining block-level culling and shadow control.
export class StaticBatch {
  constructor() { this.groups = new Map(); this.matrix = new THREE.Matrix4(); this.quaternion = new THREE.Quaternion(); }
  add(geometry, material, x = 0, y = 0, z = 0, ry = 0, scale = [1, 1, 1]) {
    this.quaternion.setFromEuler(new THREE.Euler(0, ry, 0));
    this.matrix.compose(new THREE.Vector3(x, y, z), this.quaternion, new THREE.Vector3(...scale));
    const transformed = geometry.clone().applyMatrix4(this.matrix);
    if (!this.groups.has(material)) this.groups.set(material, []);
    this.groups.get(material).push(transformed);
  }
  box(material, x, y, z, w, h, d, ry = 0) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    // Texture density is meters, independent of the module's dimensions.
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4), sx = face < 2 ? d : w, sy = face < 2 || face > 3 ? h : d;
      uv.setXY(i, uv.getX(i) * sx / 3, uv.getY(i) * sy / 3);
    }
    this.add(geometry, material, x, y, z, ry); geometry.dispose();
  }
  build(parent, castShadow = true) {
    const result = [];
    for (const [material, geometries] of this.groups) {
      const geometry = mergeGeometries(geometries);
      geometries.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = castShadow; mesh.receiveShadow = true;
      parent.add(mesh); result.push(mesh);
    }
    this.groups.clear();
    return result;
  }
}

export function textTexture(text, {background = '#173940', color = '#e8e5dd', subtitle = '', width = 1024, height = 256} = {}) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const c = canvas.getContext('2d');
  c.fillStyle = background; c.fillRect(0, 0, width, height);
  c.strokeStyle = `${color}65`; c.lineWidth = 3; c.strokeRect(12, 12, width - 24, height - 24);
  c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `500 ${subtitle ? 73 : 90}px "Helvetica Neue", sans-serif`; c.fillText(text, width / 2, subtitle ? 101 : height / 2, width - 90);
  if (subtitle) { c.font = '23px monospace'; c.fillText(subtitle, width / 2, 188, width - 90); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; return texture;
}
