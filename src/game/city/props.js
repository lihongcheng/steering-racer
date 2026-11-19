import * as THREE from 'three';
import {sampleTrack, trackLength} from '../../../shared/track.js';
import {StaticBatch, textTexture} from './geometry.js';

export function createProps(scene, materials, model) {
  const group = new THREE.Group();group.name='street-furniture';scene.add(group);
  const batch = new StaticBatch(), p = new THREE.Vector3();
  for (let s=35;s<trackLength;s+=67) {
    const t=sampleTrack(s),side=Math.floor(s/67)%2?1:-1;
    const x=t.x+t.nx*side*8.7,z=t.z+t.nz*side*8.7,a=t.heading;
    for(let i=-2;i<=2;i++)batch.box(materials.wood,x+t.nx*i*.115,.72,z+t.nz*i*.115,.095,.065,1.7,a);
    for(const dz of [-.62,.62])batch.box(materials.metal,x+Math.sin(a)*dz,.47,z+Math.cos(a)*dz,.52,.48,.055,a);
    const bin=new THREE.CylinderGeometry(.27,.25,.85,12);batch.add(bin,materials.metal,x+Math.sin(a)*2.2,.69,z+Math.cos(a)*2.2);bin.dispose();
    const planter=new THREE.CylinderGeometry(.45,.34,.6,12);batch.add(planter,materials.terracotta,x-Math.sin(a)*2.2,.56,z-Math.cos(a)*2.2);planter.dispose();
  }
  for(let s=45;s<trackLength;s+=95){
    const t=sampleTrack(s),x=t.x+t.nx*8.7,z=t.z+t.nz*8.7;
    batch.box(materials.metal,x,1.7,z,.045,2.9,.045);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(.65,.80),new THREE.MeshStandardMaterial({map:textTexture('30',{background:'#f0ece2',color:'#344148',subtitle:'CITY LIMIT'}),side:THREE.DoubleSide,roughness:.8}));
    sign.position.set(x,2.8,z);sign.rotation.y=t.heading+Math.PI;group.add(sign);
  }
  batch.build(group);
  const parked=[];
  for(const [progress,side,color] of [[.18,1,'#455969'],[.57,-1,'#bfb7a7']]){
    const t=sampleTrack(trackLength*progress),car=model.clone(true),anchor=new THREE.Group();
    anchor.position.set(t.x+t.nx*side*12.0,.26,t.z+t.nz*side*12.0);anchor.rotation.y=t.heading+.12;anchor.add(car);car.rotation.y=Math.PI;group.add(anchor);
    const paint=new THREE.MeshPhysicalMaterial({color,metalness:.5,roughness:.32,clearcoat:.8});
    car.traverse(node=>{if(!node.isMesh)return;node.castShadow=false;node.receiveShadow=true;
      if(/interior|steering|carpet|leather|carbon|trim/.test(node.name))node.visible=false;
      if(node.name==='body'){node.material=paint;node.castShadow=true;}
    });parked.push(anchor);
  }
  return {group,update(camera){for(const car of parked){car.getWorldPosition(p);car.visible=p.distanceTo(camera.position)<95;}}};
}
