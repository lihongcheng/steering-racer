import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRecessedInstruments} from '../src/game/instruments.js';

test('instrument geometry is below the dash top and leaves road sightlines clear',()=>{
 const scene=new THREE.Scene(),material=new THREE.MeshBasicMaterial(),texture=new THREE.Texture();
 const cluster=createRecessedInstruments(scene,material,texture);scene.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(cluster);
 assert.ok(bounds.max.y<=-.24,`cluster protrudes above dash: ${bounds.max.y}`);
 for(const eyeHeight of [0,.1,.18])for(const x of [-.3,0,.3]){
  const ray=new THREE.Raycaster(new THREE.Vector3(0,eyeHeight,0),new THREE.Vector3(x,-.18-eyeHeight,-1.16).normalize());
  assert.equal(ray.intersectObject(cluster,true).length,0);
 }
 // The inset panel still faces the driver and can receive a visible gauge texture.
 const target=cluster.getObjectByName('instrument-screen').position;
 const towardFace=new THREE.Raycaster(new THREE.Vector3(0,.1,0),target.clone().sub(new THREE.Vector3(0,.1,0)).normalize());
 assert.ok(towardFace.intersectObject(cluster,true).length>0);
 cluster.traverse(o=>o.geometry?.dispose());material.dispose();texture.dispose();
});
