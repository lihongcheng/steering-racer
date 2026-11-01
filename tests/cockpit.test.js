import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cockpitGrip,cockpitWheelAngle,cameraPositionFactor,CAMERA_MODES,COCKPIT,cockpitVisualInput,normalizeSeatHeight} from '../shared/camera.js';

test('cockpit camera is rigid at 30/60/120 Hz to avoid body occlusion',()=>{
 assert.ok(CAMERA_MODES.includes('cockpit'));
 for(const dt of [1/30,1/60,1/120])assert.equal(cameraPositionFactor('cockpit',dt),1);
});
test('driver grips stay on opposite sides of the wheel through full steering range',()=>{
 for(let input=-1;input<=1;input+=.05){
  const left=cockpitGrip(-1,input),right=cockpitGrip(1,input);
  assert.ok(Math.abs(Math.hypot(right.x-left.x,right.y-left.y,right.z-left.z)-COCKPIT.radius*2)<1e-10);
  assert.ok([left,right].every(p=>Object.values(p).every(Number.isFinite)&&p.z<-.5&&p.y<-.05));
 }
 assert.ok(cockpitGrip(1,1).y<cockpitGrip(1,0).y);
 assert.ok(cockpitGrip(-1,1).y>cockpitGrip(-1,0).y);
});
test('wheel turns clockwise for right input, centers and clamps invalid/full input',()=>{
 assert.equal(cockpitWheelAngle(0),0);
 assert.ok(cockpitWheelAngle(1)<0);
 assert.equal(cockpitWheelAngle(2),cockpitWheelAngle(1));
 assert.equal(cockpitWheelAngle(NaN),0);
 assert.equal(cockpitWheelAngle(-1),-cockpitWheelAngle(1));
});

test('phone visual angle bypasses vehicle yaw inversion; keyboard animation is unchanged',()=>{
 assert.ok(cockpitWheelAngle(cockpitVisualInput(-1,20))<0);
 assert.ok(cockpitWheelAngle(cockpitVisualInput(1,-20))>0);
 assert.equal(cockpitVisualInput(1,undefined),1);
 assert.equal(cockpitVisualInput(-1,0),0);
 assert.equal(cockpitVisualInput(0,100),1);
});
test('seat height defaults to a modest lift and rejects invalid/out-of-range values',()=>{
 assert.equal(normalizeSeatHeight(undefined),.10);assert.equal(normalizeSeatHeight(NaN),.10);
 assert.equal(normalizeSeatHeight(0),0);assert.equal(normalizeSeatHeight(.12),.12);
 assert.equal(normalizeSeatHeight(-1),0);assert.equal(normalizeSeatHeight(1),.18);
});
