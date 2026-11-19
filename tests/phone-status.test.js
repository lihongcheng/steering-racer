import {test} from 'node:test';
import assert from 'node:assert/strict';
import {InputGate} from '../shared/input.js';
import {phonePairingState} from '../shared/phone-status.js';

const context={serverConnected:true,owner:true,worldReady:true};
const sample={source:'iphone',connected:true,armed:false,calibrated:true,sampleAgeMs:10,steer:.5,throttle:1,brake:0};

test('phone selection is available before arming while driving remains gated',()=>{
  const input=new InputGate();input.receive(sample,100);
  const status=phonePairingState(input,110,context);
  assert.equal(status.code,'arm');assert.equal(status.canChoosePhone,true);assert.equal(status.ready,false);
  input.setMode('phone');assert.deepEqual(input.controls(110),{steer:0,throttle:0,brake:0});
  input.receive({...sample,armed:true},120);
  assert.equal(phonePairingState(input,130,context).ready,true);assert.equal(input.controls(130).throttle,1);
});

test('connection steps distinguish server failure, pairing, calibration and stale sensors',()=>{
  const input=new InputGate();input.receive(sample,100);
  assert.equal(phonePairingState(input,110,{...context,serverConnected:false}).code,'server-offline');
  assert.equal(phonePairingState(input,110,{...context,owner:false}).code,'other-window');
  assert.equal(phonePairingState(input,110,{...context,worldReady:false}).canChoosePhone,false);
  for(const [change,code] of [[{connected:false},'unpaired'],[{source:'simulator'},'unpaired'],[{calibrated:false},'calibrate'],[{sampleAgeMs:251},'stale']]){
    input.receive({...sample,...change},100);const state=phonePairingState(input,110,context);
    assert.equal(state.code,code);assert.equal(state.canChoosePhone,true);assert.equal(state.ready,false);
  }
  input.receive({...sample,armed:true},100);
  assert.equal(phonePairingState(input,351,context).code,'stale');
  assert.equal(phonePairingState(input,1500,context).code,'syncing');
});

test('reconnecting the service restores status without treating an unarmed phone as ready',()=>{
  const input=new InputGate();
  assert.equal(phonePairingState(input,0,{...context,serverConnected:false}).code,'server-offline');
  input.receive({...sample,connected:false},10);
  assert.equal(phonePairingState(input,20,context).code,'unpaired');
  input.receive(sample,30);
  const state=phonePairingState(input,40,{...context,phase:'paused'});
  assert.equal(state.code,'arm');assert.match(state.hint,/继续比赛/);assert.equal(input.phoneReady(40),false);
});

test('a packet received after the animation-frame timestamp does not flicker to syncing',()=>{
  const input=new InputGate();input.receive(sample,120);
  assert.equal(phonePairingState(input,110,context).code,'arm');
  assert.equal(phonePairingState(input,110,context).phoneConnected,true);
});
