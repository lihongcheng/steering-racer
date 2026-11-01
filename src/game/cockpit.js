import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {COCKPIT,cockpitWheelAngle,cockpitWrist} from '../../shared/camera.js';
import {createWindshield} from './windshield.js';
import {createRecessedInstruments} from './instruments.js';

const material=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.8,...options});
const vec=(x,y,z)=>new THREE.Vector3(x,y,z);
function add(parent,geometry,mat,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);parent.add(m);return m;}
function rounded(parent,mat,x,y,z,w,h,d,r=.02){return add(parent,new RoundedBoxGeometry(w,h,d,3,Math.min(r,w/3,h/3,d/3)),mat,x,y,z);}
function tube(parent,mat,points,r=.004,segments=24){return add(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,r,8,false),mat);}
function rod(parent,mat,top,bottom){return add(parent,new THREE.CylinderGeometry(top,bottom,1,20),mat);}
function connect(mesh,a,b){const d=new THREE.Vector3().subVectors(b,a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=d.length();mesh.quaternion.setFromUnitVectors(vec(0,1,0),d.normalize());}
function oval(parent,mat,x,y,z,sx,sy,sz){const m=add(parent,new THREE.SphereGeometry(1,28,20),mat,x,y,z);m.scale.set(sx,sy,sz);return m;}
let seed=9155;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function grain(kind){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#858585';ctx.fillRect(0,0,256,256);
 if(kind==='weave'){
  for(let y=0;y<256;y+=4)for(let x=0;x<256;x+=4){ctx.fillStyle=(x/4+y/4)%2?'#a2a2a2':'#646464';ctx.fillRect(x,y,3,2);ctx.fillStyle='#8a8a8a';ctx.fillRect(x+2,y+1,1,3);}
 }else{
  for(let i=0;i<15000;i++){const v=70+random()*100;ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(random()*256,random()*256,1+random()*2,1+random()*2);}
  for(let i=0;i<700;i++){ctx.strokeStyle='#41414135';const x=random()*256,y=random()*256;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+random()*4,y+random()*5);ctx.stroke();}
 }
 const texture=new THREE.CanvasTexture(c);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(kind==='weave'?3:2,kind==='weave'?6:3);texture.anisotropy=4;return texture;
}
function spoke(parent,points,mat){
 const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
 const g=new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.006,bevelThickness:.003,curveSegments:12});
 return add(parent,g,mat,0,0,-.003);
}
function glovePalm(side){
 // A connected tapered palm, narrower at wrist and metacarpals, with a flattened back.
 const rows=[[-.070,.018,.017],[-.045,.029,.023],[-.010,.035,.026],[.018,.034,.026],[.045,.025,.020],[.055,.012,.009]];
 const sections=40,ring=48,positions=[],indices=[];
 const profile=new THREE.CatmullRomCurve3(rows.map(([y,w,d])=>vec(w,y,d)),false,'catmullrom',.2);
 const cx=side*.015;
 for(let i=0;i<=sections;i++){
  const point=profile.getPoint(i/sections),y=point.y,w=point.x,d=point.z;
  for(let j=0;j<ring;j++){const a=j/ring*Math.PI*2;positions.push(cx+Math.cos(a)*w,y,.024+Math.sin(a)*d);}
 }
 for(let i=0;i<sections;i++)for(let j=0;j<ring;j++){const a=i*ring+j,b=i*ring+(j+1)%ring;indices.push(a,a+ring,b,b,a+ring,b+ring);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

// Isolated interior pass: no exterior glass/body is ever placed across the sightline.
export class Cockpit{
 constructor(environment=null){
  this.scene=new THREE.Scene();this.scene.environment=environment;this.scene.environmentIntensity=.8;
  this.camera=new THREE.PerspectiveCamera(66,1,.03,15);
  this.scene.add(new THREE.HemisphereLight('#dce5e6','#59616b',2.0));
  const key=new THREE.DirectionalLight('#fff1d8',2.7);key.position.set(-2,3,1);this.scene.add(key);
  const fill=new THREE.DirectionalLight('#b7d2ed',1.5);fill.position.set(2,1,2);this.scene.add(fill);
  const leather=grain('leather'),weave=grain('weave');
  const black=material('#202629',{roughness:.72,bumpMap:leather,bumpScale:.0009});
  const dash=material('#323b41',{roughness:.92,bumpMap:leather,bumpScale:.0014});
  const metal=material('#7d8992',{metalness:.7,roughness:.32}),gunmetal=material('#3b4650',{metalness:.6,roughness:.39});
  const stitch=material('#88908e',{roughness:1}),plastic=material('#111a20',{roughness:.61});
  this.root=new THREE.Group();this.scene.add(this.root);
  rounded(this.root,black,.1,-1.04,-.85,2.9,.58,2.0,.12);
  // Sculpted dashboard, thin trim and open windshield rather than stacked boxes.
  rounded(this.root,dash,.16,-.52,-1.48,2.45,.53,.63,.15);
  rounded(this.root,black,.16,-.258,-1.52,2.45,.075,.61,.034);
  tube(this.root,stitch,[[-1.03,-.243,-1.208],[-.6,-.249,-1.195],[0,-.26,-1.18],[.7,-.268,-1.18],[1.34,-.27,-1.2]],.0018);
  rounded(this.root,gunmetal,.16,-.385,-1.151,2.38,.022,.012,.004);
  this.windshield=createWindshield(this.root,black);
  for(const side of [-1,1]){
   rounded(this.root,black,side*1.15,-.58,-.64,.23,.51,.85,.07);
   rounded(this.root,gunmetal,side*1.04,-.56,-.51,.11,.029,.25,.01);
  }
  for(const x of [-.56,.53,.86]){
   rounded(this.root,plastic,x,-.373,-1.122,.23,.10,.027,.016);
   for(let i=-2;i<=2;i++)rounded(this.root,gunmetal,x,-.373+i*.016,-1.100,.187,.004,.013,.001);
   rounded(this.root,metal,x+.038,-.375,-1.089,.021,.018,.009,.002);
  }
  const console=rounded(this.root,plastic,.46,-.60,-1.18,.32,.37,.065,.028);console.rotation.x=-.10;
  const screen=material('#153b43',{emissive:'#145b65',emissiveIntensity:.12,roughness:.2});
  rounded(this.root,screen,.46,-.50,-1.132,.237,.09,.007,.005);
  for(const x of [.38,.53]){const dial=add(this.root,new THREE.CylinderGeometry(.027,.027,.021,28),gunmetal,x,-.632,-1.121);dial.rotation.x=Math.PI/2;const ring=add(this.root,new THREE.TorusGeometry(.022,.0015,6,28),metal,x,-.632,-1.108);}
  for(let i=0;i<4;i++)rounded(this.root,gunmetal,.373+i*.057,-.58,-1.112,.04,.015,.005,.002);
  // Instruments live in the dashboard face, leaving the road silhouette uninterrupted.
  this.canvas=document.createElement('canvas');this.canvas.width=1024;this.canvas.height=384;this.ctx=this.canvas.getContext('2d');this.texture=new THREE.CanvasTexture(this.canvas);this.texture.colorSpace=THREE.SRGBColorSpace;this.texture.anisotropy=4;
  this.instruments=createRecessedInstruments(this.root,plastic,this.texture);
  const column=rod(this.root,plastic,.043,.065);connect(column,vec(0,-.47,-1.23),vec(0,COCKPIT.centerY,COCKPIT.centerZ));
  this.wheelTilt=new THREE.Group();this.wheelTilt.position.set(0,COCKPIT.centerY,COCKPIT.centerZ);this.wheelTilt.rotation.x=COCKPIT.tilt;this.root.add(this.wheelTilt);
  this.wheel=new THREE.Group();this.wheelTilt.add(this.wheel);
  const radius=COCKPIT.radius;
  // Thick leather rim with finger rests, detailed stitching and a subtle center marker.
  const rim=add(this.wheel,new THREE.TorusGeometry(radius,.022,20,120),black);
  for(const side of [-1,1])oval(this.wheel,black,side*.198,.045,.001,.023,.050,.024);
  for(let i=0;i<96;i++){
   const a=i/96*Math.PI*2,x=Math.cos(a)*(radius-.012),y=Math.sin(a)*(radius-.012);
   const seam=rounded(this.wheel,stitch,x,y,.018,.0032,.0007,.0007,.0002);seam.rotation.z=a+.6;
  }
  for(let i=0;i<7;i++){const a=Math.PI/2+(i-3)*.011;const marker=rounded(this.wheel,material('#b6bfa2'),Math.cos(a)*radius,Math.sin(a)*radius,.022,.003,.031,.002,.0005);marker.rotation.z=a-Math.PI/2;}
  for(const side of [-1,1]){
   spoke(this.wheel,[[side*.064,.012],[side*.196,.021],[side*.200,-.011],[side*.082,-.048]],gunmetal);
   rounded(this.wheel,plastic,side*.139,-.006,.019,.064,.033,.012,.007);
   for(const dx of [-1,1]){const button=add(this.wheel,new THREE.CylinderGeometry(.006,.006,.004,16),metal,side*.139+dx*.016,-.006,.027);button.rotation.x=Math.PI/2;}
  }
  spoke(this.wheel,[[-.034,-.05],[-.030,-.184],[.030,-.184],[.034,-.05]],gunmetal);
  rounded(this.wheel,plastic,0,-.122,.018,.026,.091,.01,.004);
  const hubShape=new THREE.Shape();hubShape.moveTo(-.070,.044);hubShape.bezierCurveTo(-.076,.073,.076,.073,.070,.044);hubShape.lineTo(.055,-.043);hubShape.quadraticCurveTo(.040,-.079,0,-.072);hubShape.quadraticCurveTo(-.040,-.079,-.055,-.043);hubShape.closePath();
  add(this.wheel,new THREE.ExtrudeGeometry(hubShape,{depth:.040,bevelEnabled:true,bevelSize:.012,bevelThickness:.009,bevelSegments:6,curveSegments:24}),black,0,0,.002);
  const emblem=add(this.wheel,new THREE.CylinderGeometry(.026,.026,.004,36),metal,0,.015,.051);emblem.rotation.x=Math.PI/2;
  const center=add(this.wheel,new THREE.CircleGeometry(.021,36),material('#264d64',{metalness:.55,roughness:.28}),0,.015,.054);
  const badgeCanvas=document.createElement('canvas');badgeCanvas.width=256;badgeCanvas.height=128;const bc=badgeCanvas.getContext('2d');bc.fillStyle='#232c32';bc.fillRect(0,0,256,128);bc.fillStyle='#919c9e';bc.font='26px sans-serif';bc.textAlign='center';bc.fillText('AIRBAG',128,76);
  const badgeTexture=new THREE.CanvasTexture(badgeCanvas);badgeTexture.colorSpace=THREE.SRGBColorSpace;
  add(this.wheel,new THREE.PlaneGeometry(.060,.03),new THREE.MeshBasicMaterial({map:badgeTexture}),0,-.039,.049);
  // Anatomical palm silhouettes and curled segmented fingers, in understated black gloves.
  const glove=material('#303d49',{roughness:.89,bumpMap:weave,bumpScale:.00045,side:THREE.DoubleSide});
  const grip=material('#202b34',{roughness:.82,bumpMap:leather,bumpScale:.00065});
  const sleeve=material('#283540',{roughness:.97,bumpMap:weave,bumpScale:.0007});
  const seamMat=material('#819397',{roughness:1});
  this.arms=[];this.visualSteering=0;
  for(const side of [-1,1]){
   const hand=new THREE.Group();hand.position.set(side*radius,.01,.022);this.wheel.add(hand);
   add(hand,glovePalm(side),glove);
   // Subtle panels conform to the palm instead of a large cartoon patch.
   const back=oval(hand,grip,side*.018,.003,.049,.024,.034,.0023);back.rotation.z=-side*.1;
   for(let i=0;i<4;i++)tube(hand,seamMat,[[side*.032,-.024+i*.012,.045],[side*.033,-.019+i*.012,.046]],.0005,4);
   for(let i=0;i<4;i++){
    const y=.031-i*.020,rad=.0082-(i===3?.001:0);
    tube(hand,glove,[[side*.022,y,.030],[-side*.006,y+.002,.035],[-side*.028,y,.022],[-side*.031,y-.003,-.002],[-side*.012,y-.005,-.025]],rad,24);
    oval(hand,grip,-side*.010,y+.002,.041,.010,.006,.002);
    tube(hand,seamMat,[[-side*.006,y-.006,.042],[-side*.018,y-.006,.033],[-side*.026,y-.006,.021]],.00065,8);
   }
   tube(hand,glove,[[side*.020,-.036,.045],[-side*.005,-.028,.060],[-side*.025,-.012,.053],[-side*.036,.003,.027]],.012,24);
   oval(hand,grip,-side*.013,-.018,.064,.009,.018,.0018);
   const forearm=rod(this.root,sleeve,.027,.048),upper=rod(this.root,sleeve,.048,.068),elbow=oval(this.root,sleeve,0,0,0,.049,.053,.049),cuff=rod(this.root,grip,.03,.032);
   this.arms.push({side,forearm,upper,elbow,cuff});
  }
  this.lastGauge=-Infinity;this.update({steering:0,speed:0},0,0);
 }
 resize(aspect){this.camera.aspect=aspect;this.camera.updateProjectionMatrix();}
 setEyeHeight(height){this.camera.position.y=height;}
 update(car,time,visualSteering=car.steering){
  // A short visual-only filter smooths sensor samples without altering vehicle control.
  const dt=Math.max(0,Math.min(.05,time-(this.lastTime??time)));this.lastTime=time;
  this.visualSteering+=(visualSteering-this.visualSteering)*(1-Math.exp(-dt/0.045));
  this.wheel.rotation.z=cockpitWheelAngle(this.visualSteering);
  for(const arm of this.arms){
   const p=cockpitWrist(arm.side,this.visualSteering),wrist=vec(p.x,p.y,p.z);
   const shoulder=vec(arm.side*.29,-.84,.03),elbow=vec(arm.side*.31+p.x*.16,-.63+Math.min(0,p.y+.3)*.22,-.44);
   connect(arm.forearm,elbow,wrist);connect(arm.upper,shoulder,elbow);arm.elbow.position.copy(elbow);
   connect(arm.cuff,wrist.clone().addScaledVector(elbow.clone().sub(wrist).normalize(),.043),wrist);
  }
  if(time-this.lastGauge<.07)return;this.lastGauge=time;
  const c=this.ctx;c.clearRect(0,0,1024,384);c.save();c.beginPath();c.roundRect(0,0,1024,384,95);c.clip();c.fillStyle='#0c151c';c.fillRect(0,0,1024,384);
  const speed=car.speed*3.6,gear=speed<1?0:Math.min(5,1+Math.floor(car.speed/9)),rpm=speed<1?900:2400+(car.speed%9)/9*4600;
  for(const[x,value,max,label]of [[209,rpm,8000,'RPM × 1000'],[815,speed,180,'km/h']]){
   const g=c.createRadialGradient(x,190,10,x,190,160);g.addColorStop(0,'#17222b');g.addColorStop(1,'#080c10');c.fillStyle=g;c.beginPath();c.arc(x,190,152,0,Math.PI*2);c.fill();c.strokeStyle='#657880';c.lineWidth=3;c.stroke();
   for(let i=0;i<=40;i++){
    const a=(-220+i*6.5)*Math.PI/180;c.beginPath();c.moveTo(x+Math.cos(a)*(i%5?136:126),190+Math.sin(a)*(i%5?136:126));c.lineTo(x+Math.cos(a)*143,190+Math.sin(a)*143);c.strokeStyle=i>32?'#d25e49':'#d8e2d6';c.lineWidth=i%5?1.5:4;c.stroke();
    if(i%5===0){c.fillStyle='#d2dcdb';c.textAlign='center';c.font='22px sans-serif';c.fillText(String(Math.round(i/40*(max===8000?8:180))),x+Math.cos(a)*108,198+Math.sin(a)*108);}
   }
   const a=(-220+Math.min(1,value/max)*260)*Math.PI/180;c.beginPath();c.moveTo(x,190);c.lineTo(x+Math.cos(a)*125,190+Math.sin(a)*125);c.strokeStyle='#f57b4e';c.lineWidth=4;c.stroke();c.beginPath();c.arc(x,190,10,0,Math.PI*2);c.fillStyle='#657277';c.fill();
   c.fillStyle='#8ba2a7';c.font='18px sans-serif';c.textAlign='center';c.fillText(label,x,289);
  }
  c.fillStyle='#162631';c.fillRect(390,18,244,150);c.strokeStyle='#344b55';c.lineWidth=2;c.strokeRect(390,18,244,150);
  c.fillStyle='#dbe8e7';c.textAlign='center';c.font='bold 64px monospace';c.fillText(String(Math.round(speed)).padStart(3,'0'),512,88);c.font='20px sans-serif';c.fillText('km/h',456,130);c.fillStyle='#9dbfc3';c.font='27px monospace';c.fillText(gear?`D ${gear}`:'N',565,131);c.restore();this.texture.needsUpdate=true;
 }
 dispose(){this.scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});}
}
