import * as THREE from 'three';
import {sampleTrack, trackLength} from '../../../shared/track.js';
import {randomSource, StaticBatch} from './geometry.js';

export class Vegetation {
  constructor(scene, assets, materials) {
    this.group = new THREE.Group(); this.group.name = 'street-trees'; scene.add(this.group);
    this.trees = []; this.time = {value: 0};
    const random = randomSource(442);
    const material = new THREE.MeshStandardMaterial({map: assets.leaves, alphaTest: .45, side: THREE.DoubleSide,
      roughness: .95, color: '#aeb991', emissive: '#263410', emissiveIntensity: .08});
    material.forceSinglePass = true;
    const animate = shader => {
      shader.uniforms.windTime = this.time;
      shader.vertexShader = 'uniform float windTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float phase = instanceMatrix[3].x * .7 + instanceMatrix[3].z * .9;
        transformed.x += sin(windTime * 1.3 + phase + position.y * 2.0) * .045 * (position.y + .5);
      `);
    };
    material.onBeforeCompile = animate; material.customProgramCacheKey = () => 'street-leaf-wind-v1';
    const depth = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, map: assets.leaves, alphaTest: .45, side: THREE.DoubleSide});
    depth.onBeforeCompile = animate; depth.customProgramCacheKey = () => 'street-leaf-depth-v1';
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 2), dummy = new THREE.Object3D(), trunks = new StaticBatch();
    for (let s = 17; s < trackLength; s += 25) {
      const p = sampleTrack(s), side = Math.floor(s / 25) % 2 ? -1 : 1, x = p.x + p.nx * side * 8.1, z = p.z + p.nz * side * 8.1;
      const scale = .82 + random() * .28, group = new THREE.Group(); group.position.set(x, .26, z); this.group.add(group);
      const trunk = new THREE.CylinderGeometry(.10, .21, 3.6 * scale, 8);
      trunks.add(trunk, materials.bark, x, .26 + 1.8 * scale, z); trunk.dispose();
      for (let b = 0; b < 7; b++) {
        const a = b / 7 * Math.PI * 2 + random(), from = new THREE.Vector3(x, 2.6 * scale, z),
          to = new THREE.Vector3(x + Math.cos(a) * 1.8 * scale, (4.6 + random() * 1.1) * scale, z + Math.sin(a) * 1.8 * scale);
        const delta = to.clone().sub(from), branch = new THREE.CylinderGeometry(.025, .075, delta.length(), 6);
        branch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
        const middle = from.add(to).multiplyScalar(.5); trunks.add(branch, materials.bark, middle.x, middle.y, middle.z); branch.dispose();
      }
      const makeLeaves = (count, enlargement) => {
        const leaves = new THREE.InstancedMesh(geometry, material, count); leaves.customDepthMaterial = depth;
        for (let i = 0; i < count; i++) {
          const theta = random() * Math.PI * 2, yy = random() * 2 - 1, radius = Math.sqrt(1 - yy * yy) * (1.1 + random() * 1.2) * scale;
          dummy.position.set(Math.cos(theta) * radius, (4.75 + yy * 1.6) * scale, Math.sin(theta) * radius);
          dummy.rotation.set((random() - .5) * 1.8, random() * Math.PI * 2, (random() - .5) * 1.1);
          dummy.scale.set((.65 + random() * .55) * scale * enlargement, (1.05 + random() * .9) * scale * enlargement, 1);
          dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix);
          leaves.setColorAt(i, new THREE.Color().setHSL(.21 + random() * .055, .22 + random() * .15, .51 + random() * .20));
        }
        leaves.castShadow = true; leaves.receiveShadow = true; leaves.computeBoundingSphere(); return leaves;
      };
      const near = makeLeaves(160, 1), far = makeLeaves(42, 1.6);
      const lod = new THREE.LOD(); lod.addLevel(near, 0); lod.addLevel(far, 85, .12); group.add(lod);
      this.trees.push({group, lod});
      const grate = new THREE.BoxGeometry(1.25, .02, 1.25); trunks.add(grate, materials.metal, x, .277, z); grate.dispose();
    }
    trunks.build(this.group);
    this.depth = depth;
  }
  update(time, camera, distance) {
    this.time.value = time;
    for (const tree of this.trees) {
      tree.group.visible = tree.group.position.distanceTo(camera.position) < distance;
      if (tree.group.visible) tree.lod.update(camera);
    }
  }
  dispose() { this.depth.dispose(); }
}
