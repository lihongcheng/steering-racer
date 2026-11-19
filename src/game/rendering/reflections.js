import * as THREE from 'three';
import {sampleTrack, trackLength} from '../../../shared/track.js';

export class StreetReflections {
  constructor(renderer,scene,vehicle,quality,lighting) {
    this.renderer=renderer;this.scene=scene;this.vehicle=vehicle;this.probes=[];this.quality=quality;
    const previousShadowUpdate=renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate=false;vehicle.root.visible=false;
    try {
      for(const progress of [0,.37,.73]) {
        const t=sampleTrack(trackLength*progress),target=new THREE.WebGLCubeRenderTarget(quality.reflectionSize,{type:THREE.HalfFloatType,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
        const camera=new THREE.CubeCamera(.3,190,target);camera.position.set(t.x,1.6,t.z);
        lighting.update(camera.position);renderer.shadowMap.needsUpdate=true;camera.update(renderer,scene);
        this.probes.push({position:camera.position.clone(),target,camera});
      }
    }finally{renderer.shadowMap.autoUpdate=previousShadowUpdate;vehicle.root.visible=true;}
    this.lastProbe=null;
  }
  update(position) {
    let nearest=this.probes[0],distance=Infinity;
    for(const probe of this.probes){const d=probe.position.distanceToSquared(position);if(d<distance){nearest=probe;distance=d;}}
    if(this.lastProbe && this.lastProbe.position.distanceToSquared(position)<distance*1.25)nearest=this.lastProbe;
    if(nearest!==this.lastProbe){this.vehicle.paint.envMap=nearest.target.texture;this.vehicle.glass.envMap=nearest.target.texture;this.vehicle.paint.needsUpdate=true;this.vehicle.glass.needsUpdate=true;this.lastProbe=nearest;}
  }
  dispose(){for(const probe of this.probes)probe.target.dispose();}
}
