import * as THREE from 'three';

// A continuous inner roof/side frame, not separate tubes floating in the view.
// Only the aperture perimeter has geometry: the central sightline stays empty.
export function createWindshield(parent,liningMaterial){
  const group=new THREE.Group();group.name='integrated-windshield';parent.add(group);
  const outline=new THREE.Shape();
  outline.moveTo(-3,-.58);outline.lineTo(3,-.58);outline.lineTo(3,1.65);outline.lineTo(-3,1.65);outline.closePath();
  const opening=new THREE.Path();
  opening.moveTo(-1.41,-.265);
  opening.bezierCurveTo(-1.49,-.26,-1.53,-.21,-1.48,-.11);
  opening.lineTo(-1.16,.69);
  opening.bezierCurveTo(-1.12,.79,-1.04,.83,-.93,.84);
  opening.quadraticCurveTo(0,.925,.93,.84);
  opening.bezierCurveTo(1.04,.83,1.12,.79,1.16,.69);
  opening.lineTo(1.48,-.11);
  opening.bezierCurveTo(1.53,-.21,1.49,-.26,1.41,-.265);
  opening.quadraticCurveTo(0,-.19,-1.41,-.265);opening.closePath();
  outline.holes.push(opening);
  const geometry=new THREE.ExtrudeGeometry(outline,{depth:.055,steps:1,curveSegments:32,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:4});
  const frame=new THREE.Mesh(geometry,liningMaterial);frame.position.z=-1.46;frame.name='roof-side-liner';group.add(frame);

  // Inset rubber seal follows the whole curved opening and terminates in the dash.
  const edgePoints=opening.getPoints(160).map(p=>new THREE.Vector3(p.x,p.y,-1.388));
  const seal=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePoints,true,'centripetal'),200,.004,6,true),new THREE.MeshStandardMaterial({color:'#10181d',roughness:.94}));
  seal.name='windshield-rubber-seal';group.add(seal);
  // Small defroster slots below the glass tie the lower frame into the dashboard.
  const slotMaterial=new THREE.MeshStandardMaterial({color:'#0c1419',roughness:.9});
  const slots=new THREE.InstancedMesh(new THREE.BoxGeometry(.095,.006,.006),slotMaterial,18);
  const dummy=new THREE.Object3D();
  for(let i=0;i<18;i++){const x=-1.02+i*.12;dummy.position.set(x,-.247-.02*Math.abs(x),-1.38);dummy.rotation.z=-x*.035;dummy.updateMatrix();slots.setMatrixAt(i,dummy.matrix);}
  slots.name='defroster-vents';group.add(slots);
  return group;
}
