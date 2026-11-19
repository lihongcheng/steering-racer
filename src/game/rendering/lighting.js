import * as THREE from 'three';
import {Sky} from 'three/addons/objects/Sky.js';

// World-space direction. Moving the shadow volume never rotates the afternoon sun.
export const SUN_DIRECTION = new THREE.Vector3(-.65, .574, -.498).normalize();

export class AfternoonLighting {
  constructor(scene, renderer, assets, quality) {
    this.scene = scene;
    this.sun = new THREE.DirectionalLight('#fff0dc', 3.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(quality.shadowSize);
    this.sun.shadow.bias = -.00009;
    this.sun.shadow.normalBias = .025;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 250;
    this.radius = quality.shadowRadius;
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -this.radius;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = this.radius;
    this.sun.shadow.camera.updateProjectionMatrix();
    scene.add(this.sun, this.sun.target);
    this.fill = new THREE.HemisphereLight('#d5e6ff', '#635648', .48);
    scene.add(this.fill);
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    const uniforms = this.sky.material.uniforms;
    uniforms.turbidity.value = 2.1;
    uniforms.rayleigh.value = 1.5;
    uniforms.mieCoefficient.value = .004;
    uniforms.mieDirectionalG.value = .82;
    uniforms.sunPosition.value.copy(SUN_DIRECTION);
    this.sky.material.depthWrite = false;
    // Draw at far depth after opaque surfaces so covered pixels skip the cloud shader.
    this.sky.renderOrder = 1000;
    scene.add(this.sky);
    scene.fog = new THREE.Fog('#bbced9', 180, 650);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.environment = pmrem.fromEquirectangular(assets.sky);
    pmrem.dispose();
    scene.environment = this.environment.texture;
    scene.environmentIntensity = .42;
    this.update(new THREE.Vector3());
  }
  update(position) {
    // Quantize the anchor to a shadow texel to reduce crawling on static facades.
    const step = 2 * this.radius / this.sun.shadow.mapSize.x;
    const target = this.sun.target.position;
    target.set(Math.round(position.x / step) * step, 0, Math.round(position.z / step) * step);
    this.sun.position.copy(target).addScaledVector(SUN_DIRECTION, 150);
    this.sun.target.updateMatrixWorld();
  }
  dispose() { this.environment.dispose(); this.sun.shadow.dispose(); this.sky.geometry.dispose(); this.sky.material.dispose(); }
}
