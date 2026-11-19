import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createDistrictLayout,lotsOverlap} from '../src/game/city/districts.js';
import {roadSurfaceHeight,ROAD_Y} from '../shared/road-surface.js';
import {projectTrack,sampleTrack,trackLength} from '../shared/track.js';
import {createCar} from '../shared/physics.js';
import {vehiclePose,VEHICLE,cockpitForwardOffset} from '../src/game/vehicle/vehicle-pose.js';
import {CameraRig} from '../src/game/rendering/camera-rig.js';
import {RemoteCommands,ACTION} from '../shared/remote.js';
import {Vehicle} from '../src/game/vehicle/vehicle.js';
import {loadCarFixture} from './car-fixture.js';

test('street lots are deterministic, clear of the circuit, and do not overlap',()=>{
  const lots=createDistrictLayout();assert.deepEqual(lots,createDistrictLayout());assert.ok(lots.length>30);
  assert.equal(new Set(lots.map(l=>l.district)).size,3);
  for(let i=0;i<lots.length;i++){
    const a=lots[i];
    for(let j=i+1;j<lots.length;j++)assert.equal(lotsOverlap(a,lots[j]),false,`lots ${i} and ${j}`);
    for(const u of [-1,0,1])for(const v of [-1,0,1]){
      const x=a.x+Math.cos(a.rotation)*u*a.width/2+Math.sin(a.rotation)*v*a.depth/2;
      const z=a.z-Math.sin(a.rotation)*u*a.width/2+Math.cos(a.rotation)*v*a.depth/2;
      assert.ok(projectTrack(x,z).distance>=10.6,`lot ${i} intrudes into roadside`);
    }
  }
});

test('curb support is continuous and the vehicle remains grounded around the whole loop',()=>{
  assert.equal(roadSurfaceHeight(0),ROAD_Y);assert.equal(roadSurfaceHeight(8),ROAD_Y+.16);
  for(let offset=6.3;offset<6.8;offset+=.001)assert.ok(Math.abs(roadSurfaceHeight(offset+.001)-roadSurfaceHeight(offset))<.002);
  for(let distance=0;distance<trackLength;distance+=3){
    const car=createCar(distance),pose=vehiclePose(car,0,1/60);
    assert.ok(Math.abs(pose.height-ROAD_Y)<1e-7);
    assert.equal(pose.spin,0);
  }
  const car=createCar();car.speed=18;car.wheelAngle=.18;
  const pose=vehiclePose(car,17.9,1/60);
  assert.ok(pose.pitch<0);assert.ok(pose.roll>0&&pose.roll<=.055);
  assert.ok(Math.abs(pose.spin-18/60/VEHICLE.wheelRadius)<1e-8);
});

test('cockpit eye stays rigid to the interpolated car through turns and frame rates',()=>{
  for(const dt of [1/30,1/60,1/120])for(const seatHeight of [0,.10,.18]){
    const camera=new THREE.PerspectiveCamera(),rig=new CameraRig(camera),car=createCar();
    const vehicle={root:{position:new THREE.Vector3(car.x,.1,car.z)}};
    rig.update(car,{phase:'running',mode:'cockpit',dt,time:0,seatHeight},vehicle,[]);
    car.x+=4;car.z-=7;car.heading+=.6;vehicle.root.position.set(car.x,.1,car.z);
    rig.update(car,{phase:'running',mode:'cockpit',dt,time:1,seatHeight},vehicle,[]);
    const expected=new THREE.Vector3(car.x+Math.cos(car.heading)*VEHICLE.eyeX+Math.sin(car.heading)*cockpitForwardOffset(seatHeight),.1+VEHICLE.eyeY+seatHeight,car.z-Math.sin(car.heading)*VEHICLE.eyeX+Math.cos(car.heading)*cockpitForwardOffset(seatHeight));
    assert.ok(camera.position.distanceTo(expected)<1e-8);
  }
});

test('asset-not-ready window cannot acknowledge a remote start as successful',()=>{
  const commands=new RemoteCommands();let applied=false;
  const message={epoch:'e',clientId:'p',id:1,deadline:Date.now()+10000,action:ACTION.START};
  const result=commands.execute(message,{ready:true,phase:'ready',visible:false,apply(){applied=true;}});
  assert.equal(result,-1);assert.equal(applied,false);
});

test('actual imported cockpit leaves the central road visible at every seat height and aspect',async()=>{
  const model=await loadCarFixture(),vehicle=new Vehicle(model),state=createCar();
  assert.ok(vehicle.fittedInterior>=3,'visor and header components were found');
  vehicle.update(state,{phase:'paused',dt:0,brake:0,visualSteering:0});vehicle.setCamera('cockpit');vehicle.root.updateMatrixWorld(true);
  const surfaces=[];vehicle.root.traverseVisible(object=>{if(object.isMesh)surfaces.push(object);});
  const ray=new THREE.Raycaster();ray.near=.025;ray.far=6;
  for(const aspect of [648/864,1920/1080])for(const seatHeight of Array.from({length:19},(_,i)=>i/100)){
    const camera=new THREE.PerspectiveCamera(62,aspect),rig=new CameraRig(camera);
    rig.update(state,{phase:'paused',mode:'cockpit',dt:0,time:0,seatHeight},vehicle,[]);camera.updateMatrixWorld();
    for(const x of [-.18,0,.18])for(const y of [0,.08]){
      ray.setFromCamera(new THREE.Vector2(x,y),camera);
      const hit=ray.intersectObjects(surfaces,false)[0];
      assert.ok(!hit,`eye ${seatHeight}, aspect ${aspect}, ray ${x}/${y} blocked by ${hit?.object.name} at ${hit?vehicle.root.worldToLocal(hit.point.clone()).toArray().map(v=>v.toFixed(3)):''}`);
    }
  }
});
