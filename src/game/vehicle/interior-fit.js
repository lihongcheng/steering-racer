import * as THREE from 'three';

// Stow the source model's separate visor assemblies, keeping its connected
// pillars and windshield frame intact.
export function fitInterior(model) {
  model.updateWorldMatrix(true,true);
  let fitted=0;
  for(const name of ['interior_light','interior_dark','metal','plastic_gray']) {
    const mesh=model.getObjectByName(name);
    if(!mesh?.geometry.index)continue;
    const geometry=mesh.geometry.clone(),attribute=geometry.getAttribute('position'),index=geometry.index;
    const points=Array.from({length:attribute.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld));
    const parents=Int32Array.from(points.map((_,i)=>i));
    const find=i=>parents[i]===i?i:(parents[i]=find(parents[i]));
    const union=(a,b)=>{parents[find(a)]=find(b);};
    const welded=new Map();
    points.forEach((p,i)=>{const key=p.toArray().map(v=>Math.round(v*10000)).join(',');if(welded.has(key))union(i,welded.get(key));else welded.set(key,i);});
    for(let i=0;i<index.count;i+=3){union(index.getX(i),index.getX(i+1));union(index.getX(i+1),index.getX(i+2));}
    const components=new Map();
    points.forEach((p,i)=>{const root=find(i);if(!components.has(root))components.set(root,{bounds:new THREE.Box3(),vertices:[]});const component=components.get(root);component.bounds.expandByPoint(p);component.vertices.push(i);});
    const inverse=mesh.matrixWorld.clone().invert(),posed=new Set();
    for(const {bounds,vertices} of components.values()) {
      const center=bounds.getCenter(new THREE.Vector3());
      const visor=Math.abs(center.x)>.11&&Math.abs(center.x)<.48&&bounds.min.y>1.12&&bounds.max.y<1.23&&bounds.min.z>.08&&bounds.max.z<.28;
      if(!visor)continue;
      for(const i of vertices) {
        const p=points[i].clone(),y=(p.y-1.16)*.34,z=p.z-.25;
        p.y=1.196+y*Math.cos(.25)-z*Math.sin(.25);
        p.z=.25+y*Math.sin(.25)+z*Math.cos(.25);
        p.applyMatrix4(inverse);attribute.setXYZ(i,p.x,p.y,p.z);posed.add(i);
      }
      fitted++;
    }
    attribute.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;
  }
  // Dark windshield surround: retain the original body silhouette and thickness.
  const body=model.getObjectByName('body');
  if(body){
    body.geometry=body.geometry.clone();const position=body.geometry.getAttribute('position'),colors=new Float32Array(position.count*3),point=new THREE.Vector3();
    for(let i=0;i<position.count;i++){
      point.fromBufferAttribute(position,i).applyMatrix4(body.matrixWorld);
      const frame=Math.abs(point.x)<.76&&point.y>1.10&&point.z>-.08&&point.z<.43;
      colors.fill(frame?.055:1,i*3,i*3+3);
    }
    body.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  }
  return fitted;
}
