import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';
import {TRACK,segments,sampleTrack,trackLength,projectTrack,clamp} from '../../shared/track.js';
import {cameraPositionFactor,normalizeSeatHeight} from '../../shared/camera.js';
import {Cockpit} from './cockpit.js';
import {mat,mesh,box,range,rand,canvasTexture,facade,asphalt,signTexture,batch,cylinderBetween,createSportsCar} from './urban-assets.js';

function ribbon(low,high,y,material){
 const v=[],uv=[],idx=[];
 for(let i=0;i<=segments.length;i++){
  const a=segments[i%segments.length];for(const o of [low,high]){v.push(a.a.x+a.nx*o,y,a.a.z+a.nz*o);uv.push(o/9,(i===segments.length?trackLength:a.start)/9);}
  if(i<segments.length){const j=2*i;idx.push(j,j+2,j+1,j+1,j+2,j+3);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return new THREE.Mesh(g,material);
}
const grade={uniforms:{tDiffuse:{value:null},strength:{value:1}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`uniform sampler2D tDiffuse; varying vec2 vUv;
 void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,.79);c*=vec3(1.045,1.01,.91);c=(c-.5)*1.08+.5;float v=smoothstep(.85,.18,distance(vUv,vec2(.5)));c*=.88+.12*v;gl_FragColor=vec4(c,1.);}`};
export class World{
 constructor(canvas){
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
  this.scene=new THREE.Scene();this.scene.fog=new THREE.Fog('#a29d81',105,440);
  const sky=canvasTexture(1024,(c,s)=>{const g=c.createLinearGradient(0,0,0,s);g.addColorStop(0,'#555e64');g.addColorStop(.42,'#898f83');g.addColorStop(.65,'#c4b687');g.addColorStop(1,'#7b7767');c.fillStyle=g;c.fillRect(0,0,s,s);for(let i=0;i<170;i++){const x=rand()*s,y=range(90,550),r=range(30,180),cloud=c.createRadialGradient(x,y,2,x,y,r);cloud.addColorStop(0,'rgba(227,222,194,.14)');cloud.addColorStop(1,'rgba(227,222,194,0)');c.fillStyle=cloud;c.fillRect(x-r,y-r,r*2,r*2);}});sky.mapping=THREE.EquirectangularReflectionMapping;
  this.scene.background=sky;const pmrem=new THREE.PMREMGenerator(this.renderer);this.environment=pmrem.fromEquirectangular(sky);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.85;pmrem.dispose();
  this.camera=new THREE.PerspectiveCamera(59,1,.08,750);const st=sampleTrack(0);this.camera.position.set(st.x+8,3.2,st.z-8);this.lookAt=new THREE.Vector3(st.x,1,st.z);this.lastCamera=null;this.spin=0;
  this.scene.add(new THREE.HemisphereLight('#dbd1a4','#393c36',1.8));
  this.sun=new THREE.DirectionalLight('#ffe0a6',2.4);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-100,right:100,top:100,bottom:-100,near:5,far:280});this.sun.shadow.bias=-.00035;this.sun.shadow.normalBias=.06;this.scene.add(this.sun,this.sun.target);
  this.createGround();this.createRoad();this.createCity();
  const car=createSportsCar(this.scene);this.car=car.root;this.wheels=car.wheels;this.brakeMaterial=car.brakeMaterial;
  this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));this.cockpit=new Cockpit(this.environment.texture);this.cockpitPass=new RenderPass(this.cockpit.scene,this.cockpit.camera);this.cockpitPass.clear=false;this.cockpitPass.clearDepth=true;this.cockpitPass.enabled=false;this.composer.addPass(this.cockpitPass);this.bloom=new UnrealBloomPass(new THREE.Vector2(100,100),.09,.4,.93);this.composer.addPass(this.bloom);this.composer.addPass(new SMAAPass());this.composer.addPass(new OutputPass());this.composer.addPass(new ShaderPass(grade));
  this.resize();this.resizeHandler=()=>this.resize();window.addEventListener('resize',this.resizeHandler);
 }
 resize(){const c=this.renderer.domElement,w=c.clientWidth,h=c.clientHeight;this.renderer.setSize(w,h,false);this.composer?.setSize(w,h);this.camera.aspect=w/Math.max(1,h);this.camera.updateProjectionMatrix();this.cockpit?.resize(this.camera.aspect);}
 createGround(){
  const tex=canvasTexture(256,(c,s)=>{c.fillStyle='#777366';c.fillRect(0,0,s,s);for(let i=0;i<15000;i++){c.fillStyle=rand()>.5?'#4f524125':'#b4aa8825';c.fillRect(rand()*s,rand()*s,2,2);}});tex.repeat.set(85,85);
  const ground=mesh(new THREE.PlaneGeometry(1200,1200),mat('#aaa996',{map:tex}),this.scene,0,-.10,0);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;
  const cross=mat('#57584f');for(const z of [-175,0,175]){const p=mesh(new THREE.PlaneGeometry(900,15),cross,this.scene,0,-.07,z);p.rotation.x=-Math.PI/2;}
  const distant=[];for(let i=0;i<65;i++){const a=i/65*Math.PI*2,r=range(260,390),h=range(25,95);distant.push({p:[Math.cos(a)*r,h/2,Math.sin(a)*r],s:[range(15,30),h,range(12,24)],color:['#747972','#85877a','#626a66'][i%3]});}batch(new THREE.BoxGeometry(1,1,1),mat('#ffffff'),distant,this.scene);
 }
 createRoad(){
  const roadTex=asphalt();roadTex.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
  const road=ribbon(-TRACK.halfWidth,TRACK.halfWidth,.10,mat('#ffffff',{map:roadTex,roughness:.86}));road.receiveShadow=true;this.scene.add(road);
  const sidewalk=mat('#989386'),curb=mat('#b2aea0'),white=mat('#c2bda7'),yellow=mat('#bbaa57'),black=mat('#33372f');
  for(const side of [-1,1]){
   const offsets=side<0?[-10,-6.5]:[6.5,10];const shoulder=ribbon(...offsets,.11,sidewalk);shoulder.receiveShadow=true;this.scene.add(shoulder);this.scene.add(ribbon(side*6.55-.13,side*6.55+.13,.15,curb));this.scene.add(ribbon(side*5.95-.045,side*5.95+.045,.12,white));this.scene.add(ribbon(side*.13-.035,side*.13+.035,.121,yellow));
  }
  const rails=[],posts=[],markings=[],drains=[],skids=[];
  for(let s=0;s<trackLength;s+=4){const p=sampleTrack(s);for(const side of [-1,1]){
   rails.push({p:[p.x+p.nx*side*10,.62,p.z+p.nz*side*10],s:[.43,1.15,3.92],r:[0,p.heading,0],color:Math.floor(s/16)%2?'#b1ab95':'#535649'});
   if(Math.floor(s/4)%3===0)drains.push({p:[p.x+p.nx*side*6,.135,p.z+p.nz*side*6],s:[.36,.018,.65],r:[0,p.heading,0]});
  }if(s%12===0)for(const side of [-1,1])markings.push({p:[p.x+p.nx*side*3.2,.13,p.z+p.nz*side*3.2],s:[.10,.015,3.5],r:[0,p.heading,0]});}
  batch(new THREE.BoxGeometry(1,1,1),mat('#ffffff'),rails,this.scene);batch(new THREE.BoxGeometry(1,1,1),white,markings,this.scene);batch(new THREE.BoxGeometry(1,1,1),black,drains,this.scene);
  for(let s=50;s<trackLength;s+=1.2){const p=sampleTrack(s),a=sampleTrack(s+10);if(Math.abs(a.heading-p.heading)<.15)continue;for(const side of [-1,1])skids.push({p:[p.x+p.nx*side*.8,.116,p.z+p.nz*side*.8],s:[.23,.005,1.25],r:[0,p.heading,0]});}batch(new THREE.BoxGeometry(1,1,1),mat('#333730',{transparent:true,opacity:.36,depthWrite:false}),skids,this.scene);
  // Overhead start structure and urban direction boards.
  const p=sampleTrack(0),start=new THREE.Group();start.position.set(p.x,0,p.z);start.rotation.y=p.heading;this.scene.add(start);
  for(const x of [-9,9]){box(start,mat('#55564c'),x,3.8,0,.30,7.6,.30);for(let y=1;y<7;y++)box(start,black,x,y,0,.45,.05,.4);}
  box(start,black,0,7.2,0,18,.35,.45);
  const sign=mesh(new THREE.PlaneGeometry(13,2.2),new THREE.MeshBasicMaterial({map:signTexture('GREYPORT',' #28372e','#e1dabe','INDUSTRIAL LOOP / 07')}),start,0,6.75,-.28);sign.rotation.y=Math.PI;
  const check=canvasTexture(128,(c,s)=>{for(let x=0;x<16;x++)for(let y=0;y<4;y++){c.fillStyle=(x+y)%2?'#a9a68c':'#363b31';c.fillRect(x*8,y*32,8,32);}});
  const line=mesh(new THREE.PlaneGeometry(13,1.8),new THREE.MeshBasicMaterial({map:check}),start,0,.14,0);line.rotation.x=-Math.PI/2;
  for(let j=1;j<=3;j++)for(const side of [-1,1])box(start,white,side*2.4,.137,-j*5.3,2,.01,.08);
  // Roadside infrastructure uses batching where practical.
  const poles=[],arms=[],lights=[];
  for(let s=8;s<trackLength;s+=23){const p=sampleTrack(s),side=Math.floor(s/23)%2?1:-1;const x=p.x+p.nx*side*11,z=p.z+p.nz*side*11;
    poles.push({p:[x,4,z],s:[.15,8,.15]});arms.push({p:[x-p.nx*side*1.5,7.8,z-p.nz*side*1.5],s:[3,.12,.12],r:[0,p.heading,0]});lights.push({p:[x-p.nx*side*3,7.78,z-p.nz*side*3],s:[.8,.15,.40],r:[0,p.heading,0]});}
  batch(new THREE.BoxGeometry(1,1,1),mat('#494f49'),poles,this.scene);batch(new THREE.BoxGeometry(1,1,1),mat('#494f49'),arms,this.scene);batch(new THREE.BoxGeometry(1,1,1),mat('#cac39c',{emissive:'#e9bd66',emissiveIntensity:.5}),lights,this.scene);
  for(let s=20;s<trackLength;s+=38){const p=sampleTrack(s),q=sampleTrack(s+15),turn=Math.atan2(Math.sin(q.heading-p.heading),Math.cos(q.heading-p.heading));if(Math.abs(turn)<.15)continue;const side=turn>0?-1:1;
   const board=mesh(new THREE.PlaneGeometry(5,1.7),new THREE.MeshBasicMaterial({map:signTexture(turn>0?'› › ›':'‹ ‹ ‹','#30362d','#d6c576'),side:THREE.DoubleSide}),this.scene,p.x+p.nx*side*10.7,2.2,p.z+p.nz*side*10.7);board.rotation.y=p.heading+Math.PI;}
 }
 createCity(){
  const textures=[facade('#77766a'),facade('#949080'),facade('#756c5c',true),facade('#575d56',true),facade('#8b8271')];for(const t of textures)t.anisotropy=4;
  const roof=mat('#484c44'),concrete=mat('#8c8979'),metal=mat('#575d57');let count=0;
  const building=(x,z,w,d,h,rotation=0)=>{
   const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;this.scene.add(g);
   const material=mat('#c2bba5',{map:textures[count++%textures.length]});const geo=new THREE.BoxGeometry(w,h,d);const uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.max(w,d)/13,uv.getY(i)*h/15);
   const b=mesh(geo,material,g,0,h/2,0);b.castShadow=true;b.receiveShadow=true;
   box(g,roof,0,h+.23,0,w+.5,.46,d+.5);box(g,concrete,0,.5,0,w+.3,1,d+.3);
   const unit=box(g,metal,w*.22,h+.9,d*.12,w*.3,1.2,d*.26);unit.castShadow=true;
   if(h>22){box(g,concrete,0,h*.52,0,w+.1,.25,d+.1);box(g,metal,-w*.3,h+2,-d*.3,.10,4,.10);}
   if(h<18){const front=mesh(new THREE.PlaneGeometry(w*.82,2.1),new THREE.MeshBasicMaterial({map:signTexture(['EASTSIDE AUTO','IRONWORKS','NORTH FREIGHT','DISTRICT 07','WAREHOUSE'][count%5],'#3c3a30','#c9c2a5')}),g,0,3,d/2+.03);for(const dx of [-.28,.28])box(g,metal,w*dx,1.4,d/2+.035,w*.27,2.4,.08);}
   return g;
  };
  // Buildings flank both sides of the closed road; footprint clearance keeps the lane readable.
  for(let s=8;s<trackLength;s+=25){const p=sampleTrack(s);for(const side of [-1,1]){
   const w=range(14,21),d=range(11,17),offset=side*(18+d/2),x=p.x+p.nx*offset,z=p.z+p.nz*offset;
   if(projectTrack(x,z).distance<Math.hypot(w,d)/2+11)continue;
   building(x,z,w,d,side>0?range(12,42):range(9,24),p.heading+Math.PI/2);
  }}
  for(let x=-200;x<=200;x+=31)for(let z=-185;z<=185;z+=34){if(rand()>.68)continue;const w=range(15,23),d=range(16,25);if(projectTrack(x,z).distance<32)continue;building(x,z,w,d,range(15,65));}
  // Industrial tanks and chimneys form distinct districts instead of a uniform city wall.
  for(const [x,z]of[[55,0],[34,20],[-180,105],[180,-90]]){
    const tank=mesh(new THREE.CylinderGeometry(7,7,13,24),mat('#9c9a84',{metalness:.32,roughness:.6}),this.scene,x,6.5,z);tank.castShadow=true;
    for(const y of [1,5,9,13]){const ring=mesh(new THREE.TorusGeometry(7.03,.10,5,32),metal,this.scene,x,y,z);ring.rotation.x=Math.PI/2;}
  }
  for(const [x,z]of[[58,28],[70,28],[183,105]]){
   mesh(new THREE.CylinderGeometry(1.2,1.8,42,14),mat('#777461'),this.scene,x,21,z).castShadow=true;
   for(let y=22;y<40;y+=7)mesh(new THREE.CylinderGeometry(1.42,1.48,2.5,14),mat('#a7a48c'),this.scene,x,y,z);
  }
  // Steel pipe gantry above one straight. Clearance is well above the car.
  const t=sampleTrack(trackLength*.48),bridge=new THREE.Group();bridge.position.set(t.x,0,t.z);bridge.rotation.y=t.heading;this.scene.add(bridge);
  for(const x of [-12,12])box(bridge,metal,x,5,0,.48,10,.5);
  for(const z of [-.8,.8]){cylinderBetween(bridge,new THREE.Vector3(-13,9,z),new THREE.Vector3(13,9,z),.38,mat('#77745e'),12);for(let x=-12;x<12;x+=3)cylinderBetween(bridge,new THREE.Vector3(x,8,z),new THREE.Vector3(x+3,9.8,z),.07,metal);}
  // Autumn foliage: irregular clusters, not triangular low-poly trees.
  const trunks=[],foliage=[];
  for(let s=10;s<trackLength;s+=29){const p=sampleTrack(s),side=s%2?1:-1,x=p.x+p.nx*side*13,z=p.z+p.nz*side*13;
   trunks.push({p:[x,2.5,z],s:[.23,5,.23]});for(let j=0;j<14;j++)foliage.push({p:[x+range(-1.6,1.6),4.7+range(-.5,2),z+range(-1.5,1.5)],s:[range(.55,1.15),range(.65,1.35),range(.55,1.1)],color:['#7d804c','#7b7344','#aaa05c','#73784a'][j%4]});}
  batch(new THREE.CylinderGeometry(1,1.2,1,7),mat('#544e3c'),trunks,this.scene);batch(new THREE.IcosahedronGeometry(1,1),mat('#ffffff',{roughness:1}),foliage,this.scene);
  const banners=[['GREYPORT','INDUSTRIAL / EXIT 07'],['NO LIMIT','PRECISION MOTORWORKS'],['SHIFT / DRIVE','THE STREETS ARE WAITING']];
  for(let i=0;i<3;i++){const p=sampleTrack(trackLength*(.12+i*.29)),g=new THREE.Group();g.position.set(p.x+p.nx*20,0,p.z+p.nz*20);g.rotation.y=p.heading+Math.PI;this.scene.add(g);box(g,metal,0,5,0,.4,10,.4);box(g,roof,0,10,0,13,4,.4);mesh(new THREE.PlaneGeometry(12.6,3.65),new THREE.MeshBasicMaterial({map:signTexture(...[banners[i][0],'#302f28','#d7d0af',banners[i][1]])}),g,0,10,.22);}
 }
 render(state,{phase,brake=0,dt=1/60,time=0,camera='chase',visualSteering=state.steering,seatHeight}={}){
  const eyeLift=normalizeSeatHeight(seatHeight);
  this.car.position.set(state.x,.10,state.z);this.car.rotation.y=state.heading;this.car.rotation.z+=(-state.steering*state.speed*.00035-this.car.rotation.z)*(1-Math.exp(-dt*8));
  if(phase==='running')this.spin+=state.speed*dt/.415;
  for(const w of this.wheels){w.pivot.rotation.y=w.front?state.wheelAngle:0;w.roll.rotation.x=this.spin;}
  this.brakeMaterial.emissiveIntensity=brake>0?3.4:.45;
  this.sun.position.set(state.x-70,95,state.z+45);this.sun.target.position.set(state.x,0,state.z);this.sun.target.updateMatrixWorld();
  const f=new THREE.Vector3(Math.sin(state.heading),0,Math.cos(state.heading)),right=new THREE.Vector3(f.z,0,-f.x);let goal,look;
  if(phase==='ready'){
   const a=.63+Math.sin(time*.06)*.14;goal=new THREE.Vector3(state.x,2.15,state.z).addScaledVector(f,-6.5).addScaledVector(right,4.8+a);look=new THREE.Vector3(state.x,1.0,state.z).addScaledVector(f,.25).addScaledVector(right,-1.2);
  }else if(camera==='cockpit'){
   goal=new THREE.Vector3(state.x,1.38+eyeLift,state.z).addScaledVector(f,.04).addScaledVector(right,-.36);look=new THREE.Vector3(state.x,1.38+eyeLift,state.z).addScaledVector(f,40).addScaledVector(right,-.36);
  }else if(camera==='hood'){
   goal=new THREE.Vector3(state.x,1.39,state.z).addScaledVector(f,1.05);look=new THREE.Vector3(state.x,1.45,state.z).addScaledVector(f,40);
  }else if(camera==='bumper'){
   goal=new THREE.Vector3(state.x,.75,state.z).addScaledVector(f,2.4);look=new THREE.Vector3(state.x,.92,state.z).addScaledVector(f,40);
  }else if(camera==='high'){
   goal=new THREE.Vector3(state.x,7.5,state.z).addScaledVector(f,-11);look=new THREE.Vector3(state.x,1,state.z).addScaledVector(f,10);
  }else {
   goal=new THREE.Vector3(state.x,2.7+state.speed*.007,state.z).addScaledVector(f,-7.5-state.speed*.028);look=new THREE.Vector3(state.x,1.15,state.z).addScaledVector(f,10);
  }
  const mode=phase==='ready'?'showcase':camera;
  this.car.visible=mode!=='bumper'&&mode!=='cockpit';
  this.cockpitPass.enabled=mode==='cockpit';
  if(this.cockpitPass.enabled){this.cockpit.setEyeHeight(eyeLift);this.cockpit.update(state,time,visualSteering);}
  if(this.lastCamera!==mode){this.camera.position.copy(goal);this.lookAt.copy(look);this.lastCamera=mode;}
  else{const factor=cameraPositionFactor(mode,dt);this.camera.position.lerp(goal,factor);this.lookAt.lerp(look,factor);}
  const targetFov=phase==='ready'?47:camera==='cockpit'?66:camera==='hood'?66:59+clamp(state.speed/43,0,1)*10;
  this.camera.fov+=(targetFov-this.camera.fov)*(1-Math.exp(-dt*3));this.camera.updateProjectionMatrix();this.camera.lookAt(this.lookAt);
  this.composer.render();
 }
 dispose(){window.removeEventListener('resize',this.resizeHandler);this.composer.dispose();this.cockpit.dispose();this.environment.dispose();this.renderer.dispose();}
}
