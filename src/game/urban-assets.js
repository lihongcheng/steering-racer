import * as THREE from 'three';
export const mat=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.84,...options});
export function mesh(g,m,parent,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;}
export function box(parent,m,x,y,z,w,h,d){return mesh(new THREE.BoxGeometry(w,h,d),m,parent,x,y,z);}
export function cylinderBetween(parent,a,b,r,m,sides=8){const v=new THREE.Vector3().subVectors(b,a);const o=mesh(new THREE.CylinderGeometry(r,r,v.length(),sides),m,parent);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;}
let seed=8502;export const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};export const range=(a,b)=>a+(b-a)*rand();
export function canvasTexture(size,draw){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
export function asphalt(){return canvasTexture(512,(c,s)=>{c.fillStyle='#51514a';c.fillRect(0,0,s,s);for(let i=0;i<65000;i++){const k=40+rand()*70;c.fillStyle=`rgba(${k},${k},${k*.92},.32)`;c.fillRect(rand()*s,rand()*s,rand()*2+1,1);}for(let i=0;i<8;i++){let x=rand()*s,y=rand()*s;c.strokeStyle='#30322c70';c.lineWidth=.7;c.beginPath();c.moveTo(x,y);for(let j=0;j<7;j++){x+=range(-20,20);y+=range(7,22);c.lineTo(x,y);}c.stroke();}for(let i=0;i<5;i++){c.fillStyle='#32342f20';c.fillRect(rand()*s,rand()*s,range(25,80),range(30,100));}});}
export function facade(color,industrial=false){return canvasTexture(256,(c,s)=>{
 c.fillStyle=color;c.fillRect(0,0,s,s);
 if(industrial){for(let y=0;y<s;y+=12){c.strokeStyle='#17181530';c.beginPath();c.moveTo(0,y);c.lineTo(s,y);c.stroke();for(let x=(y/12%2)*25;x<s;x+=50){c.beginPath();c.moveTo(x,y);c.lineTo(x,y+12);c.stroke();}}}
 else {for(let x=0;x<s;x+=64){c.fillStyle='#1b1b1830';c.fillRect(x,0,3,s);}}
 for(let y=24;y<240;y+=64)for(let x=12;x<240;x+=62){c.fillStyle='#252d2d';c.fillRect(x,y,36,38);const g=c.createLinearGradient(x,y,x+36,y+38);g.addColorStop(0,rand()>.85?'#a39460':'#7b8280');g.addColorStop(.45,'#3c4c51');g.addColorStop(1,'#1d292c');c.fillStyle=g;c.fillRect(x+3,y+3,30,30);c.fillStyle='#151e20';c.fillRect(x+17,y+3,2,31);c.fillRect(x+3,y+16,30,2);c.fillStyle='#c2ba9d80';c.fillRect(x-2,y+37,40,4);}
 for(let i=0;i<800;i++){c.fillStyle=rand()>.5?'#0000000a':'#ffffff0a';c.fillRect(rand()*s,rand()*s,3,range(2,30));}
 });}
export function signTexture(text,bg='#232824',fg='#efe2b5',subtitle=''){const c=document.createElement('canvas');c.width=1024;c.height=256;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,1024,256);x.strokeStyle=fg;x.lineWidth=5;x.strokeRect(12,12,1000,232);x.textAlign='center';x.fillStyle=fg;x.font='italic 900 98px Arial';x.fillText(text,512,subtitle?135:165);if(subtitle){x.font='25px monospace';x.fillText(subtitle,512,200);}for(let i=0;i<1000;i++){x.fillStyle='#1a1c1818';x.fillRect(rand()*1024,rand()*256,range(1,12),1);}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
export function batch(g,m,transforms,parent){const o=new THREE.InstancedMesh(g,m,transforms.length),dummy=new THREE.Object3D();transforms.forEach((t,i)=>{dummy.position.set(...t.p);dummy.rotation.set(...(t.r??[0,0,0]));dummy.scale.set(...(t.s??[1,1,1]));dummy.updateMatrix();o.setMatrixAt(i,dummy.matrix);if(t.color)o.setColorAt(i,new THREE.Color(t.color));});o.receiveShadow=true;parent.add(o);return o;}
function bodyGeometry(){
 // Longitudinal sections with rounded shoulders and a low hood/trunk silhouette.
 const sections=[[-2.28,.88,.49,.82],[-2.05,1.0,.42,.98],[-1.45,1.05,.39,1.01],[-.7,.94,.38,.98],[.65,.95,.37,.94],[1.45,1.02,.4,.86],[2.0,.95,.42,.78],[2.25,.85,.46,.69]];
 const vertices=[],indices=[];
 const contour=[[-.93,0],[-1,.25],[-1,.65],[-.88,.94],[-.55,1],[0,1.015],[.55,1],[.88,.94],[1,.65],[1,.25],[.93,0],[0,0]];
 const rails=contour.map(([x,y])=>new THREE.CatmullRomCurve3(sections.map(([z,w,b,t])=>new THREE.Vector3(x*w,b+(t-b)*y,z)),false,'catmullrom',.15));
 const slices=56,n=48;
 for(let i=0;i<=slices;i++){
  const ring=new THREE.CatmullRomCurve3(rails.map(rail=>rail.getPoint(i/slices)),true,'catmullrom',.12);
  for(let j=0;j<n;j++){const p=ring.getPoint(j/n);vertices.push(p.x,p.y,p.z);}
 }
 for(let i=0;i<slices;i++)for(let j=0;j<n;j++){const a=i*n+j,b=i*n+(j+1)%n;indices.push(a,a+n,b,b,a+n,b+n);}
 for(const end of [0,slices]){const base=end*n;for(let j=1;j<n-1;j++)if(end)indices.push(base,base+j+1,base+j);else indices.push(base,base+j,base+j+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function quad(parent,vertices,m){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex([0,2,1,0,3,2]);g.computeVertexNormals();return mesh(g,m,parent);}
export function createSportsCar(scene){
 const root=new THREE.Group();scene.add(root);const paint=new THREE.MeshPhysicalMaterial({color:'#d4d9db',metalness:.7,roughness:.25,clearcoat:1,clearcoatRoughness:.14}),blue=mat('#214e93',{metalness:.38,roughness:.27,side:THREE.DoubleSide}),black=mat('#121619',{roughness:.55}),chrome=mat('#a7adb0',{metalness:.9,roughness:.18}),glass=new THREE.MeshPhysicalMaterial({color:'#17292e',metalness:.55,roughness:.1,clearcoat:1,side:THREE.DoubleSide});
 const body=mesh(bodyGeometry(),paint,root);body.castShadow=true;
 const cabinBase=[-.82,.96,-1.10,.82,.96,-1.10,.80,.94,1.00,-.80,.94,1.00,-.63,1.40,-.67,.63,1.40,-.67,.63,1.40,.2,-.63,1.40,.2];
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(cabinBase,3));g.setIndex([0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7,4,5,6,4,6,7]);g.computeVertexNormals();mesh(g,glass,root).castShadow=true;
 box(root,paint,0,1.43,-.24,1.29,.07,.94).castShadow=true;
 // Pillars, side windows, sill, racing trim and original blue livery.
 for(const side of [-1,1]){
   cylinderBetween(root,new THREE.Vector3(side*.8,.95,1),new THREE.Vector3(side*.64,1.42,.2),.035,paint);
   cylinderBetween(root,new THREE.Vector3(side*.82,.98,-1.1),new THREE.Vector3(side*.64,1.42,-.68),.045,paint);
   cylinderBetween(root,new THREE.Vector3(side*.8,.96,-.4),new THREE.Vector3(side*.64,1.42,-.36),.032,black);
   box(root,blue,side*.976,.63,-.14,.025,.23,2.4);box(root,black,side*.98,.4,0,.17,.13,3.8);
   box(root,black,side*1.055,.99,.68,.23,.12,.27);box(root,paint,side*1.07,1.02,.70,.24,.13,.29);
   box(root,chrome,side*.958,.92,-.29,.015,.035,.22);
   // Wheel arch surrounds follow the circular tire silhouette.
   for(const z of [-1.44,1.4]){const arch=mesh(new THREE.TorusGeometry(.49,.045,5,24,Math.PI),paint,root,side*1.03,.45,z);arch.rotation.y=Math.PI/2;arch.rotation.z=0;}
   for(const z of [1.62,1.78,1.94])box(root,black,side*.64,.872,z,.28,.018,.055);
   const emblem=mesh(new THREE.PlaneGeometry(.55,.27),new THREE.MeshBasicMaterial({map:signTexture('07','#d4d9db','#153960'),side:THREE.DoubleSide}),root,side*.958,.82,-.25);emblem.rotation.y=side*Math.PI/2;
 }
 // Bold asymmetrical blue hood and roof stripes, defined in code rather than copied assets.
 quad(root,[-.12,.967,.87,.3,.965,.87,.67,.795,2.03,.1,.809,2.03],blue);
 box(root,blue,.16,1.471,-.24,.35,.009,.94);
 quad(root,[-.55,1.021,-1.08,.05,1.021,-1.08,.39,.994,-2.03,-.33,.994,-2.03],blue);
 // Front bumper and twin headlights.
 box(root,black,0,.50,2.27,1.74,.13,.1);box(root,black,0,.565,2.25,.72,.15,.06);
 for(const side of [-1,1]){box(root,black,side*.69,.625,2.24,.51,.13,.04);for(let i=0;i<2;i++){const lens=mesh(new THREE.CylinderGeometry(.075,.075,.04,16),mat('#ede6ce',{emissive:'#fff4c8',emissiveIntensity:.45}),root,side*(.53+i*.2),.637,2.274);lens.rotation.x=Math.PI/2;}box(root,black,side*.64,.50,2.26,.34,.14,.04);}
 // Rear lamps, diffuser, dual exhaust and a large aero wing.
 const brakeMaterial=mat('#ad1914',{emissive:'#ff1508',emissiveIntensity:.4});
 for(const side of [-1,1]){box(root,black,side*.64,.81,-2.22,.65,.23,.065);box(root,brakeMaterial,side*.64,.83,-2.257,.57,.125,.012);box(root,mat('#b7ab97'),side*.62,.737,-2.258,.3,.022,.012);for(const z of [-.03,.13]){const pipe=mesh(new THREE.CylinderGeometry(.07,.07,.22,12),chrome,root,side*.71+z,.43,-2.3);pipe.rotation.x=Math.PI/2;const end=mesh(new THREE.CircleGeometry(.054,12),black,root,side*.71+z,.43,-2.415);end.rotation.y=Math.PI;}}
 box(root,black,0,.40,-2.2,1.9,.15,.36);for(let i=-3;i<=3;i++)box(root,black,i*.21,.34,-2.26,.04,.21,.39);
 const plate=mesh(new THREE.PlaneGeometry(.51,.14),new THREE.MeshBasicMaterial({map:signTexture('S / L','#b2b5a6','#171a18')}),root,0,.68,-2.285);plate.rotation.y=Math.PI;
 for(const x of [-.7,.7]){box(root,black,x,1.19,-1.87,.07,.48,.15);box(root,black,x,1.43,-1.88,.21,.035,.51);}
 box(root,blue,0,1.43,-1.89,2.3,.07,.40);for(const x of [-1.16,1.16])box(root,black,x,1.47,-1.89,.035,.22,.57);
 const wheels=[];
 for(const z of [-1.44,1.4])for(const side of [-1,1]){
  const pivot=new THREE.Group();pivot.position.set(side*.99,.45,z);root.add(pivot);const roll=new THREE.Group();pivot.add(roll);
  const tire=mesh(new THREE.CylinderGeometry(.415,.415,.30,28),mat('#16191b',{roughness:.97}),roll);tire.rotation.z=Math.PI/2;tire.castShadow=true;
  const lip=mesh(new THREE.TorusGeometry(.305,.028,8,32),chrome,roll,side*.16,0,0);lip.rotation.y=Math.PI/2;
  const disc=mesh(new THREE.CylinderGeometry(.268,.268,.018,24),mat('#737774',{metalness:.8}),roll,side*.135,0,0);disc.rotation.z=Math.PI/2;
  for(let i=0;i<10;i++){const angle=i*Math.PI/5,spoke=box(roll,chrome,side*.167,Math.cos(angle)*.17,Math.sin(angle)*.17,.028,.038,.265);spoke.rotation.x=angle+Math.PI/2;}
  const hub=mesh(new THREE.CylinderGeometry(.072,.072,.035,12),black,roll,side*.19,0,0);hub.rotation.z=Math.PI/2;
  box(pivot,mat('#b44220'),side*.15,.15,-.16,.08,.16,.12);wheels.push({pivot,roll,front:z>0});
 }
 const shadowTex=canvasTexture(128,(c,s)=>{const g=c.createRadialGradient(s/2,s/2,14,s/2,s/2,s/2);g.addColorStop(0,'rgba(0,0,0,.7)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,s,s);});
 const shadow=mesh(new THREE.PlaneGeometry(3.3,5.9),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}),root,0,.035,0);shadow.rotation.x=-Math.PI/2;
 return {root,wheels,brakeMaterial};
}
