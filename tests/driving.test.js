import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Race,createCar,stepCar,LapTracker,PHYSICS_DT,maxSteerAngle,referenceDriver} from '../shared/physics.js';
import {sampleTrack,projectTrack,trackLength,wrapAngle,TRACK} from '../shared/track.js';
import {InputGate} from '../shared/input.js';

test('closed track projects positions continuously and has sufficient width',()=>{
  assert.ok(trackLength>400);
  for(let i=0;i<80;i++){const p=sampleTrack(i*trackLength/80),q=projectTrack(p.x,p.z);assert.ok(q.distance<.01);assert.ok(Math.abs(q.progress-p.progress)<.01);}
});
test('throttle moves forward, braking stops, steering is speed-sensitive and state stays finite',()=>{
  const car=createCar();for(let i=0;i<80;i++)stepCar(car,{steer:0,throttle:1,brake:0});assert.ok(car.speed>8);
  for(let i=0;i<80;i++)stepCar(car,{steer:0,throttle:1,brake:1});assert.equal(car.speed,0);
  assert.ok(maxSteerAngle(40)<maxSteerAngle(5));
  for(let i=0;i<2000;i++){stepCar(car,{steer:Math.sin(i*.02),throttle:1,brake:i%500<50?1:0});assert.ok([car.x,car.z,car.heading,car.speed].every(Number.isFinite));assert.ok(Math.abs(car.track.offset)<TRACK.halfWidth+TRACK.shoulder);}
});
test('offroad resistance slows the same input and collision is contained',()=>{
  const a=createCar(40),b=createCar(40),t=sampleTrack(40);a.speed=b.speed=15;b.x+=t.nx*8;b.z+=t.nz*8;
  stepCar(a,{steer:0,throttle:0,brake:0});stepCar(b,{steer:0,throttle:0,brake:0});assert.ok(b.speed<a.speed);assert.equal(b.offroad,true);
  b.x=t.x+t.nx*12;b.z=t.z+t.nz*12;b.heading=t.heading+Math.PI/2;b.speed=20;stepCar(b,{steer:0,throttle:1,brake:0});assert.ok(b.speed<12);assert.ok(Math.abs(b.track.offset)<10);
});
test('lap tracker requires ordered gates; reverse crossing and teleports do not produce best laps',()=>{
  const l=new LapTracker();for(const p of [.99,.01,.99,.01])l.update(p,1);assert.equal(l.completed,0);
  l.reset();for(let i=1;i<=100;i++)l.update((i%100)/100,.1);assert.equal(l.completed,1);assert.equal(l.lastLap.valid,true);
  l.teleport(.1);for(let i=11;i<=200;i++)l.update((i%100)/100,.1);assert.ok(l.laps.some(lap=>!lap.valid));
});
test('pause freezes physics and timer; reset invalidates lap; countdown consumes no race time',()=>{
  const r=new Race();r.start();for(let i=0;i<181;i++)r.step({throttle:1,steer:0,brake:0});assert.equal(r.phase,'running');assert.equal(r.lap.total,0);
  for(let i=0;i<30;i++)r.step({throttle:1,steer:0,brake:0});r.pause('test');const before=JSON.stringify([r.car,r.lap]);for(let i=0;i<60;i++)r.step({throttle:1});assert.equal(JSON.stringify([r.car,r.lap]),before);
  r.resume();r.respawn();assert.equal(r.car.speed,0);assert.equal(r.lap.invalid,true);
});
test('phone input gate rejects simulator, stale snapshots, stopped sensors and unarmed control',()=>{
  const gate=new InputGate();gate.setMode('phone');const s={source:'iphone',connected:true,armed:true,calibrated:true,sampleAgeMs:10,steer:.5,throttle:1,brake:0};gate.receive(s,100);assert.equal(gate.phoneReady(110),true);assert.equal(gate.controls(110).throttle,1);assert.equal(gate.controls(110).steer,-.825);assert.equal(gate.phoneReady(350),false);assert.equal(gate.controls(350).throttle,0);
  for(const bad of [{source:'simulator'},{armed:false},{calibrated:false},{sampleAgeMs:251},{connected:false}]){gate.receive({...s,...bad},100);assert.equal(gate.phoneReady(110),false);}
});
test('phone sign correction changes vehicle yaw while keyboard right remains positive',()=>{
  const gate=new InputGate();gate.setMode('phone');gate.receive({source:'iphone',connected:true,armed:true,calibrated:true,sampleAgeMs:0,steer:-1,throttle:0,brake:0},0);
  const car=createCar(0),heading=car.heading;car.speed=5;stepCar(car,gate.controls(0));assert.ok(wrapAngle(car.heading-heading)>0);
  gate.setMode('keyboard');gate.keys.add('ArrowRight');assert.equal(gate.controls(0).steer,1);
});
test('phone sensitivity preserves center, scales small turns, and saturates full lock',()=>{
 const gate=new InputGate();gate.setMode('phone');const s={source:'iphone',connected:true,armed:true,calibrated:true,sampleAgeMs:0,steer:0,throttle:1,brake:0};
 gate.receive(s,0);assert.equal(Math.abs(gate.controls(0).steer),0);
 gate.receive({...s,steer:.2},0);assert.equal(gate.controls(0).steer,-.33);
 gate.receive({...s,steer:1},0);assert.equal(gate.controls(0).steer,-1);
 gate.sensitivity=.75;assert.equal(gate.controls(0).steer,-.75);
});
test('deterministic reference drive completes three valid laps without excessive collisions',()=>{
  const r=new Race();r.start();for(let i=0;i<60*240&&r.phase!=='finished';i++)r.step(referenceDriver(r.car),PHYSICS_DT);
  assert.equal(r.phase,'finished');assert.equal(r.lap.laps.length,3);assert.ok(r.lap.laps.every(l=>l.valid));assert.ok(r.hits<=8);
});
