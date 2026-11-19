import * as THREE from 'three';

// Separate the actual mirror surface from the imported chrome mesh, preserving its frame.
export function extractRearMirror(model) {
  model.updateWorldMatrix(true,true);
  const source=model.getObjectByName('chrome');
  if(!source?.geometry.index)return null;
  const original=source.geometry,positions=original.getAttribute('position'),normals=original.getAttribute('normal'),index=original.index;
  const normalMatrix=new THREE.Matrix3().getNormalMatrix(source.matrixWorld),selected=[],keep=[],normalData=[];
  const p=new THREE.Vector3(),n=new THREE.Vector3(),center=new THREE.Vector3();
  for(let i=0;i<index.count;i+=3){
    const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)],points=ids.map(id=>new THREE.Vector3().fromBufferAttribute(positions,id).applyMatrix4(source.matrixWorld));
    center.copy(points[0]).add(points[1]).add(points[2]).multiplyScalar(1/3);
    n.fromBufferAttribute(normals,ids[0]).applyNormalMatrix(normalMatrix);
    const mirror=Math.abs(center.x)<.28&&center.y>1.0&&center.y<1.15&&center.z>-.1&&center.z<.8&&n.z<-.3;
    if(mirror){for(let j=0;j<3;j++){selected.push(...points[j].toArray());n.fromBufferAttribute(normals,ids[j]).applyNormalMatrix(normalMatrix);normalData.push(...n.toArray());}}
    else keep.push(...ids);
  }
  if(selected.length<18)return null;
  const surface=new THREE.BufferGeometry();surface.setAttribute('position',new THREE.Float32BufferAttribute(selected,3));surface.setAttribute('normal',new THREE.Float32BufferAttribute(normalData,3));surface.computeBoundingBox();
  const bounds=surface.boundingBox,size=bounds.getSize(p),uv=[];
  if(size.x<.12||size.x>.65||size.y>.23){surface.dispose();return null;}
  for(let i=0;i<selected.length;i+=3)uv.push(1-(selected[i]-bounds.min.x)/size.x,(selected[i+1]-bounds.min.y)/size.y);
  surface.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  source.geometry=original.clone();source.geometry.setIndex(keep);
  return surface;
}

export class RearMirror {
  constructor(renderer,scene,vehicle,enabled){
    this.renderer=renderer;this.scene=scene;this.vehicle=vehicle;this.enabled=enabled;this.last=-Infinity;
    if(!enabled)return;
    const geometry=extractRearMirror(vehicle.model);
    if(!geometry){this.enabled=false;return;}
    this.target=new THREE.WebGLRenderTarget(320,96,{type:THREE.HalfFloatType});
    this.camera=new THREE.PerspectiveCamera(24,320/96,.15,260);
    this.mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:this.target.texture}));
    this.mesh.visible=enabled;vehicle.body.add(this.mesh);
  }
  update(time,mode){
    if(!this.enabled||!this.mesh)return;
    this.mesh.visible=mode==='cockpit';
    if(mode!=='cockpit'||time-this.last<.2)return;
    const {renderer,scene,vehicle}=this,previousTarget=renderer.getRenderTarget(),shadowUpdate=renderer.shadowMap.autoUpdate,visible=vehicle.root.visible;
    vehicle.root.updateWorldMatrix(true,false);
    const eye=vehicle.root.localToWorld(new THREE.Vector3(.346,1.06,0)),behind=vehicle.root.localToWorld(new THREE.Vector3(.346,1.04,-20));
    this.camera.position.copy(eye);this.camera.lookAt(behind);
    try{vehicle.root.visible=false;renderer.shadowMap.autoUpdate=false;renderer.setRenderTarget(this.target);renderer.render(scene,this.camera);}
    finally{vehicle.root.visible=visible;renderer.shadowMap.autoUpdate=shadowUpdate;renderer.setRenderTarget(previousTarget);}
    this.last=time;
  }
  dispose(){this.target?.dispose();this.mesh?.geometry.dispose();this.mesh?.material.dispose();}
}
