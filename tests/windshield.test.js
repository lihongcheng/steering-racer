import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWindshield} from '../src/game/windshield.js';

test('integrated windshield has an open road sightline and connected perimeter',()=>{
 const scene=new THREE.Scene();const frame=createWindshield(scene,new THREE.MeshBasicMaterial());scene.updateMatrixWorld(true);
 const cast=(x,y)=>new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(x,y,-1.42).normalize()).intersectObject(frame,true);
 for(const x of [-.8,-.4,0,.4,.8])for(const y of [0,.2,.4,.6])assert.equal(cast(x,y).length,0,`road view blocked at ${x},${y}`);
 for(const height of [.1,.18])for(const x of [-.7,0,.7])for(const y of [-.05,.2,.5]){
  const hits=new THREE.Raycaster(new THREE.Vector3(0,height,0),new THREE.Vector3(x,y,-1.42).normalize()).intersectObject(frame,true);
  assert.equal(hits.length,0,`raised eye blocked at ${height},${x},${y}`);
 }
 assert.ok(cast(-1.8,.3).length>0);assert.ok(cast(1.8,.3).length>0);assert.ok(cast(0,1.2).length>0);
 scene.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});
});
