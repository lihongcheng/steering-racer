import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader, DRACO_GLTF_CONFIG} from 'three/addons/loaders/DRACOLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {ASSETS} from './manifest.js';
import {fetchAsset} from './fetch-asset.js';

export async function loadAssets(onProgress = () => {}) {
  const controller = new AbortController();
  const draco = new DRACOLoader().setDecoderPath(DRACO_GLTF_CONFIG).setWorkerLimit(2);
  const gltf = new GLTFLoader().setDRACOLoader(draco);
  const assets = {}, entries = Object.entries(ASSETS);
  let completed = 0;
  try {
    // Limit concurrent image decoding to keep the M1's shared memory steady.
    let next = 0;
    const work = async () => {
      while (next < entries.length) {
        const [key, spec] = entries[next++];
        const bytes = await fetchAsset(spec.url, {signal: controller.signal});
        if (spec.type === 'model') assets[key] = (await gltf.parseAsync(bytes, '')).scene;
        else if (spec.type === 'hdr') {
          const data = new HDRLoader().parse(bytes);
          assets[key] = new THREE.DataTexture(data.data, data.width, data.height, THREE.RGBAFormat, data.type);
          assets[key].colorSpace = THREE.LinearSRGBColorSpace;
          assets[key].flipY = true;
          assets[key].mapping = THREE.EquirectangularReflectionMapping;
          assets[key].minFilter = THREE.LinearFilter;
          assets[key].magFilter = THREE.LinearFilter;
          assets[key].needsUpdate = true;
        } else {
          const bitmap = await createImageBitmap(new Blob([bytes]), {imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none'});
          const texture = new THREE.Texture(bitmap);
          texture.colorSpace = spec.color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.needsUpdate = true;
          assets[key] = texture;
        }
        onProgress(++completed / entries.length, spec.label);
      }
    };
    const jobs = await Promise.allSettled([work(), work(), work(), work()]);
    const failure = jobs.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    return assets;
  } catch (error) {
    controller.abort();
    disposeAssets(assets);
    throw error;
  } finally {
    draco.dispose();
  }
}

export function disposeAssets(assets) {
  const textures = new Set();
  for (const value of Object.values(assets)) {
    if (value?.isTexture) textures.add(value);
    else value?.traverse?.(node => {
      node.geometry?.dispose();
      for (const material of node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []) {
        for (const item of Object.values(material)) if (item?.isTexture) textures.add(item);
        material.dispose();
      }
    });
  }
  for (const texture of textures) { texture.dispose(); texture.image?.close?.(); }
}
