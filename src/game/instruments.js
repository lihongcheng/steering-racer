import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Everything stays below the dashboard's upper surface (~ -0.22 m).
// This cluster is mounted in its front face, not standing above the windshield sill.
export function createRecessedInstruments(parent,trimMaterial,texture){
 const group=new THREE.Group();group.name='recessed-instrument-cluster';parent.add(group);
 const surround=new THREE.Mesh(new RoundedBoxGeometry(.65,.206,.062,3,.019),trimMaterial);
 surround.position.set(0,-.349,-1.162);group.add(surround);
 const face=new THREE.Mesh(new THREE.PlaneGeometry(.600,.180),new THREE.MeshBasicMaterial({map:texture,transparent:true}));
 face.position.set(0,-.348,-1.127);face.name='instrument-screen';group.add(face);
 return group;
}
