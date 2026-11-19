import car from '../../../assets/runtime/ferrari.glb?url';
import sky from '../../../assets/runtime/afternoon.hdr?url';
import roadColor from '../../../assets/runtime/asphalt_02_Diffuse.webp?url';
import roadNormal from '../../../assets/runtime/asphalt_02_nor_gl.webp?url';
import roadRoughness from '../../../assets/runtime/asphalt_02_Rough.webp?url';
import pavingColor from '../../../assets/runtime/concrete_pavement_Diffuse.webp?url';
import pavingNormal from '../../../assets/runtime/concrete_pavement_nor_gl.webp?url';
import pavingRoughness from '../../../assets/runtime/concrete_pavement_Rough.webp?url';
import brickColor from '../../../assets/runtime/brick_wall_001_Diffuse.webp?url';
import brickNormal from '../../../assets/runtime/brick_wall_001_nor_gl.webp?url';
import brickRoughness from '../../../assets/runtime/brick_wall_001_Rough.webp?url';
import concreteColor from '../../../assets/runtime/concrete_wall_007_Diffuse.webp?url';
import concreteNormal from '../../../assets/runtime/concrete_wall_007_nor_gl.webp?url';
import concreteRoughness from '../../../assets/runtime/concrete_wall_007_Rough.webp?url';
import leaves from '../../../assets/runtime/leaf-branch.webp?url';
import bark from '../../../assets/runtime/bark.webp?url';

export const ASSETS = {
  car: {url: car, type: 'model', label: '加载赛车与内饰'},
  sky: {url: sky, type: 'hdr', label: '加载下午天空'},
  ...Object.fromEntries(Object.entries({roadColor, roadNormal, roadRoughness, pavingColor,
    pavingNormal, pavingRoughness, brickColor, brickNormal, brickRoughness,
    concreteColor, concreteNormal, concreteRoughness, leaves, bark}).map(([key, url]) =>
    [key, {url, type: 'texture', color: /Color$/.test(key) || ['leaves', 'bark'].includes(key), label: '加载街区材质'}]))
};
