import * as THREE from 'three';
import {cameraPositionFactor,normalizeSeatHeight} from '../../../shared/camera.js';
import {sampleTrack,clamp} from '../../../shared/track.js';
import {VEHICLE,cockpitForwardOffset} from '../vehicle/vehicle-pose.js';

export class CameraRig {
  constructor(camera){this.camera=camera;this.look=new THREE.Vector3();this.mode=null;this.ray=new THREE.Ray();this.hit=new THREE.Vector3();}
  update(state,{phase,mode,dt,time,seatHeight},vehicle,obstacles){
    const f=new THREE.Vector3(Math.sin(state.heading),0,Math.cos(state.heading)),right=new THREE.Vector3(f.z,0,-f.x);
    const base=new THREE.Vector3(state.x,vehicle.root.position.y,state.z);
    let goal,look,targetFov;
    const active=phase==='ready'?'showcase':mode;
    if(active==='showcase'){
      goal=base.clone().addScaledVector(f,-6.7).addScaledVector(right,-4.5);goal.y+=2.0;
      look=base.clone().addScaledVector(f,.35).addScaledVector(right,1.0);look.y+=.7;targetFov=42;
    }else if(mode==='cockpit'){
      goal=base.clone().addScaledVector(right,VEHICLE.eyeX).addScaledVector(f,cockpitForwardOffset(normalizeSeatHeight(seatHeight)));goal.y+=VEHICLE.eyeY+normalizeSeatHeight(seatHeight);
      look=goal.clone().addScaledVector(f,40);look.y-=.45;targetFov=62;
    }else if(mode==='hood'){
      goal=base.clone().addScaledVector(f,.9);goal.y+=1.12;look=goal.clone().addScaledVector(f,40);look.y-=.1;targetFov=66;
    }else if(mode==='bumper'){
      goal=base.clone().addScaledVector(f,2.35);goal.y+=.58;look=goal.clone().addScaledVector(f,40);look.y+=.08;targetFov=65;
    }else if(mode==='high'){
      goal=base.clone().addScaledVector(f,-10.5);goal.y+=6.7;look=base.clone().addScaledVector(f,8);look.y+=.6;targetFov=57;
    }else{
      goal=base.clone().addScaledVector(f,-6.4-state.speed*.025);goal.y+=2.3+state.speed*.005;
      const target=sampleTrack(state.track.s+10+state.speed*.15);
      look=new THREE.Vector3(state.x*.65+target.x*.35,base.y+.85,state.z*.65+target.z*.35);targetFov=55+clamp(state.speed/43,0,1)*5;
    }
    if(!['cockpit','hood','bumper'].includes(active)){
      const anchor=base.clone();anchor.y+=.9;const direction=goal.clone().sub(anchor),distance=direction.length();
      direction.normalize();let nearest=distance;
      for(const box of obstacles){
        const c=Math.cos(box.rotation),s=Math.sin(box.rotation),dx=anchor.x-box.x,dz=anchor.z-box.z;
        this.ray.set(new THREE.Vector3(c*dx-s*dz,anchor.y,s*dx+c*dz),new THREE.Vector3(c*direction.x-s*direction.z,direction.y,s*direction.x+c*direction.z));
        if(this.ray.intersectBox(new THREE.Box3(new THREE.Vector3(-box.width/2,0,-box.depth/2),new THREE.Vector3(box.width/2,box.height,box.depth/2)),this.hit))nearest=Math.min(nearest,this.hit.distanceTo(this.ray.origin));
      }
      if(nearest<distance)goal.copy(anchor).addScaledVector(direction,Math.max(1.8,nearest-.45));
    }
    if(active!==this.mode){this.camera.position.copy(goal);this.look.copy(look);this.camera.fov=targetFov;this.mode=active;}
    else{const factor=cameraPositionFactor(active,dt);this.camera.position.lerp(goal,factor);this.look.lerp(look,factor);this.camera.fov+=(targetFov-this.camera.fov)*(1-Math.exp(-dt*3));}
    this.camera.near=mode==='cockpit'?.025:.08;this.camera.updateProjectionMatrix();this.camera.lookAt(this.look);
    return active;
  }
}
