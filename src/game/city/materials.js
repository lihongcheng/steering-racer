import * as THREE from 'three';

export function cityMaterials(assets, renderer) {
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const value of Object.values(assets)) if (value?.isTexture) value.anisotropy = anisotropy;
  const pbr = (prefix, color, roughness = 1) => new THREE.MeshStandardMaterial({
    color, map: assets[`${prefix}Color`], normalMap: assets[`${prefix}Normal`],
    roughnessMap: assets[`${prefix}Roughness`], roughness,
    normalScale: new THREE.Vector2(prefix === 'road' ? .4 : .6, prefix === 'road' ? .4 : .6)
  });
  const standard = (color, roughness = .85, metalness = 0) => new THREE.MeshStandardMaterial({color, roughness, metalness});
  return {
    road: pbr('road', '#b5b5b5', .96), paving: pbr('paving', '#d7d4cf'), brick: pbr('brick', '#d5c1af'),
    concrete: pbr('concrete', '#ddd7c9'), plaster: pbr('concrete', '#f5eee0'),
    warmPlaster: pbr('concrete', '#cdbfad'), darkBrick: pbr('brick', '#998478'),
    curb: standard('#bebcb5'), metal: standard('#343b3e', .48, .7),
    white: standard('#e6e3d7', .82), yellow: standard('#d9b769', .78),
    rubber: standard('#25282a'), roof: standard('#5e6062'), trim: standard('#bdb9ac', .6, .12),
    wood: standard('#615649'), terracotta: standard('#c18460'),
    glass: new THREE.MeshPhysicalMaterial({color: '#7c9aab', roughness: .19, metalness: .6, clearcoat: .6, envMapIntensity: .7}),
    darkGlass: new THREE.MeshStandardMaterial({color: '#354855', roughness: .27, metalness: .4}),
    interior: standard('#242b2d'), fabric: standard('#254b4e'),
    bark: new THREE.MeshStandardMaterial({map: assets.bark, color: '#8e8371', roughness: 1})
  };
}
