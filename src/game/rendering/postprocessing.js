import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';

export function createPostprocessing(renderer, scene, camera, quality) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (quality.ao) {
    const ao = new GTAOPass(scene, camera, 640, 360);
    ao.updateGtaoMaterial({radius: .6, distanceExponent: 1.3, thickness: .5, scale: 1});
    ao.blendIntensity = .4;
    composer.addPass(ao);
  }
  composer.addPass(new OutputPass());
  // A restrained display-space glow avoids spreading the physical sky's solar radiance over the road.
  if (quality.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(640, 360), .055, .15, .95));
  composer.addPass(new SMAAPass());
  return composer;
}
