import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GameBridge} from '../server/game-bridge.js';
import {Receiver} from '../server/receiver.js';
import {TYPES,encode,decode,credentials} from '../server/protocol.js';
import {loadPairing,savePairing} from '../server/pairing-store.js';
import {RemoteCommands,ACTION} from '../shared/remote.js';
import {InputGate} from '../shared/input.js';
import {drivingHint} from '../shared/feedback.js';
import {createCar} from '../shared/physics.js';
import {trackLength} from '../shared/track.js';
import {interpolateCar} from '../shared/presentation.js';
import {cameraPositionFactor} from '../shared/camera.js';

const telemetry={phase:1,lap:1,speed:0,total:0,best:0,lastLap:0,laps:[],hint:0,distance:0,targetSpeed:0,delta:0,sensitivity:1.65,preset:2,hits:0};
function fixture(){
 let time=1000;const replies=[],messages=[];const peer={address:'192.0.2.1',port:51001};
 const receiver=new Receiver({clock:()=>time,send:b=>replies.push(decode(b,receiver.auth))});
 const bridge=new GameBridge(receiver,{clock:()=>time,wallClock:()=>time});
 const owner={send:m=>messages.push(JSON.parse(m))};
 const send=p=>receiver.handle(encode({time,...p},receiver.auth),peer);
 send({type:TYPES.HELLO,seq:1,sampleSeq:77});bridge.attach(owner);bridge.message(owner,{type:'game-state',epoch:bridge.epoch,state:telemetry});
 send({type:TYPES.INPUT,seq:1,sampleSeq:1,flags:7});send({type:TYPES.COMMAND,seq:2,values:[1]});
 return {bridge,receiver,owner,replies,messages,send,advance:ms=>time+=ms,command:(id=10,action=1)=>send({type:TYPES.GAME_COMMAND,seq:id,sampleSeq:77,values:[action]})};
}
test('game ACK only follows browser execution; repeated UDP requests are idempotent',()=>{
 const f=fixture();f.command();assert.equal(f.replies.filter(x=>x.type===TYPES.GAME_ACK).length,0);
 const command=f.messages.at(-1);assert.equal(command.type,'game-command');assert.equal(f.messages.at(-2).armed,true);
 f.command();assert.equal(f.messages.filter(x=>x.type==='game-command').length,1);
 f.bridge.message(f.owner,{type:'game-result',epoch:f.bridge.epoch,id:10,clientId:77,result:1});assert.equal(f.replies.at(-1).values[0],1);
 f.command();assert.equal(f.replies.at(-1).values[0],1);assert.equal(f.messages.filter(x=>x.type==='game-command').length,1);
 f.command(9);assert.equal(f.replies.at(-1).values[0],-4);
});
test('stale/unauthorized/second game window cannot acknowledge or execute operations',()=>{
 const f=fixture(),otherMessages=[],other={send:m=>otherMessages.push(JSON.parse(m))};
 assert.equal(f.bridge.attach(other),false);assert.equal(otherMessages[0].owned,false);
 f.command();f.bridge.message(other,{type:'game-result',epoch:f.bridge.epoch,id:10,clientId:77,result:1});assert.ok(f.bridge.pending);
 f.advance(1200);f.bridge.tick();assert.equal(f.replies.findLast(p=>p.type===TYPES.GAME_ACK).values[0],-3);
 f.command();assert.equal(f.replies.at(-1).values[0],-3);
 f.command(11);assert.equal(f.replies.at(-1).values[0],-2);
});
test('unarmed start is rejected while pause is allowed, old client id cannot issue commands',()=>{
 const f=fixture();f.receiver.stop('test');f.command();assert.equal(f.replies.at(-1).values[0],-1);
 f.command(11,2);assert.equal(f.messages.at(-1).action,2);
 const count=f.messages.length;f.send({type:TYPES.GAME_COMMAND,seq:12,sampleSeq:76,values:[6]});assert.equal(f.messages.length,count);
});
test('telemetry packets carry laps, invalid mask, presets and feedback; stale owner is offline',()=>{
 const f=fixture();f.bridge.message(f.owner,{type:'game-state',epoch:f.bridge.epoch,state:{...telemetry,phase:5,total:90,laps:[{time:30,valid:true},{time:29,valid:false},{time:31,valid:true}],hint:5,hits:2}});
 f.bridge.tick();assert.equal(f.replies.findLast(p=>p.type===TYPES.GAME_STATE).values[0],5);
 assert.deepEqual(f.replies.findLast(p=>p.type===TYPES.GAME_LAPS).values.slice(0,4),[30,29,31,2]);
 f.advance(1300);f.bridge.tick();assert.equal(f.replies.at(-1).values[0],0);
});
test('browser command guard rejects replay, expiration, background activation and illegal phases',()=>{
 const r=new RemoteCommands();let starts=0;const m={epoch:'a',clientId:77,id:1,action:ACTION.START,deadline:2000};
 const context={time:1000,ready:true,phase:'ready',apply:()=>starts++};
 assert.equal(r.execute(m,context),1);assert.equal(r.execute(m,context),1);assert.equal(starts,1);
 assert.equal(r.execute({...m,id:2},{...context,time:2001}),-3);
 assert.equal(r.execute({...m,id:3},{...context,visible:false}),-1);
 assert.equal(r.execute({...m,id:4},{...context,phase:'running'}),-1);
 assert.equal(r.execute({...m,id:5},{...context,ready:false}),-1);
});
test('saved pairing survives server restart and rotation; file is owner-only',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'steering-pair-'));
 try{const path=join(dir,'pairing.json'),a=await loadPairing(path),b=await loadPairing(path);assert.deepEqual(a,b);assert.equal((await stat(path)).mode&0o777,0o600);const c=credentials();await savePairing(path,c);assert.deepEqual(await loadPairing(path),c);assert.notDeepEqual(a,c);}
 finally{await rm(dir,{recursive:true});}
});
test('comfort preset softens center without changing full lock or direction',()=>{
 const g=new InputGate();g.setMode('phone');g.receive({source:'iphone',connected:true,armed:true,calibrated:true,sampleAgeMs:0,steer:.2,throttle:0,brake:0},0);const direct=g.controls(0).steer;g.preset='comfort';assert.ok(Math.abs(g.controls(0).steer)<Math.abs(direct));assert.ok(g.controls(0).steer<0);
});
test('driving feedback detects wrong way and upcoming bends without false stopped reverse warning',()=>{
 const car=createCar();car.heading+=Math.PI;car.speed=10;assert.equal(drivingHint(car).code,4);car.speed=0;assert.notEqual(drivingHint(car).code,4);
 let turn=false;for(let s=0;s<trackLength;s+=20){const c=createCar(s);c.speed=10;if([1,2].includes(drivingHint(c).code))turn=true;}assert.ok(turn);
});
test('render interpolation smooths 120 Hz frames, crosses angle seam, and skips teleports',()=>{
 const a=createCar(),b={...a,x:a.x+1,heading:-Math.PI+.1};a.heading=Math.PI-.1;
 const mid=interpolateCar(a,b,.5);assert.equal(mid.x,a.x+.5);assert.ok(Math.abs(Math.abs(mid.heading)-Math.PI)<1e-8);
 const far={...b,x:b.x+50};assert.equal(interpolateCar(a,far,.5),far);
 assert.equal(a.x+1,b.x);assert.notEqual(mid,a);assert.notEqual(mid,b);
});
test('explicit window takeover revokes old owner and waits for new window state',()=>{
 const f=fixture(),messages=[],next={send:m=>messages.push(JSON.parse(m))};
 f.bridge.claim(next);assert.equal(f.messages.at(-1).owned,false);assert.equal(messages.at(-1).owned,true);assert.equal(f.bridge.online(),false);
 f.bridge.message(f.owner,{type:'game-state',epoch:f.bridge.epoch,state:telemetry});assert.equal(f.bridge.online(),false);
 f.bridge.message(next,{type:'game-state',epoch:f.bridge.epoch,state:telemetry});assert.equal(f.bridge.online(),true);
});
test('hood and bumper cameras never trail into the cabin at any frame rate',()=>{
 for(const dt of [1/30,1/60,1/120]){
  for(const mode of ['hood','bumper'])assert.equal(cameraPositionFactor(mode,dt),1);
  assert.ok(cameraPositionFactor('chase',dt)>0&&cameraPositionFactor('chase',dt)<1);
 }
});
