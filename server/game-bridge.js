import {randomUUID} from 'node:crypto';
import {TYPES,isNewer,now} from './protocol.js';

// One browser owns the race. UDP ACK means the browser actually handled the command.
export class GameBridge {
  constructor(receiver,{clock=now,wallClock=Date.now}={}){
    this.receiver=receiver;this.clock=clock;this.wallClock=wallClock;this.owner=null;this.updatedAt=-Infinity;this.state=null;this.serial=0;
    this.history=[];this.resetCommands();receiver.onGameCommand=p=>this.command(p);receiver.onReset=()=>this.resetCommands();
  }
  resetCommands(){this.pending=null;this.lastRequest=null;this.cached=null;}
  attach(ws){
    if(this.owner){ws.send(JSON.stringify({type:'game-owner',owned:false}));return false;}
    this.owner=ws;this.epoch=randomUUID();this.state=null;this.updatedAt=-Infinity;
    ws.send(JSON.stringify({type:'game-owner',owned:true,epoch:this.epoch}));return true;
  }
  claim(ws){
    if(this.owner===ws)return;
    if(this.owner){this.owner.send(JSON.stringify({type:"game-owner",owned:false}));this.detach(this.owner);}
    this.attach(ws);
  }
  detach(ws){if(this.owner!==ws)return;this.owner=null;this.state=null;this.updatedAt=-Infinity;if(this.pending)this.finish(-2);}
  online(){return !!this.owner&&this.clock()-this.updatedAt<1200;}
  reply(packet,result){this.receiver.reply(TYPES.GAME_ACK,packet,[result,packet.values[0]]);}
  command(packet){
    if(!Number.isInteger(packet.values[0])||packet.values[0]<1||packet.values[0]>8)return this.reply(packet,-1);
    if(this.lastRequest===packet.seq){if(this.cached!==null)this.reply(packet,this.cached);return;}
    if(this.lastRequest!==null&&!isNewer(packet.seq,this.lastRequest))return this.reply(packet,-4);
    if(this.pending)return this.reply(packet,-5);
    this.lastRequest=packet.seq;this.cached=null;
    if(!this.online()){this.cached=-2;return this.reply(packet,-2);}
    const snapshot=this.receiver.snapshot();
    if([1,3,4,5].includes(packet.values[0])&&(!snapshot.armed||!snapshot.calibrated||snapshot.sampleAgeMs>=250)){this.cached=-1;return this.reply(packet,-1);}
    const age=this.clock()-(packet.time+this.receiver.offset);
    if(age>1000||age< -1000){this.cached=-3;return this.reply(packet,-3);}
    this.pending={packet,started:this.clock()};
    this.owner.send(JSON.stringify(snapshot));
    this.owner.send(JSON.stringify({type:'game-command',epoch:this.epoch,id:packet.seq,clientId:this.receiver.clientId,action:packet.values[0],deadline:this.wallClock()+900}));
  }
  finish(result){if(!this.pending)return;this.cached=result;this.history.push({action:this.pending.packet.values[0],result,time:this.wallClock()});if(this.history.length>30)this.history.shift();this.reply(this.pending.packet,result);this.pending=null;}
  message(ws,data){
    if(ws!==this.owner||data?.epoch!==this.epoch)return;
    if(data.type==='game-result'){
      if(this.pending&&data.id===this.pending.packet.seq&&data.clientId===this.receiver.clientId&&[1,-1,-3].includes(data.result))this.finish(data.result);
      return;
    }
    if(data.type!=='game-state')return;
    const s=data.state;
    if(!s||![1,2,3,4,5].includes(s.phase))return;
    const fields=['lap','speed','total','best','lastLap','hint','distance','targetSpeed','delta','sensitivity','preset','hits'];
    if(!fields.every(k=>Number.isFinite(s[k]))||!Array.isArray(s.laps)||s.laps.length>3||!s.laps.every(l=>Number.isFinite(l.time)&&l.time>=0&&typeof l.valid==='boolean'))return;
    if(s.lap<1||s.lap>3||s.speed<0||s.speed>300||s.total<0||s.sensitivity<.75||s.sensitivity>2.5||![0,1,2,3,4,5].includes(s.hint))return;
    this.state=s;this.updatedAt=this.clock();
  }
  tick(){
    if(this.pending&&this.clock()-this.pending.started>1100)this.finish(-3);
    if(!this.receiver.peer||this.receiver.clientId===0)return;
    const online=this.online(),s=online?this.state:null,seq=this.serial++>>>0,request={seq,time:this.clock()};
    this.receiver.reply(TYPES.GAME_STATE,request,s?[s.phase,s.lap,s.speed,s.total,s.best,s.lastLap]:[0,1,0,0,0,0]);
    if(s){
      this.receiver.reply(TYPES.GAME_LAPS,request,[...Array.from({length:3},(_,i)=>s.laps[i]?.time??0),s.laps.reduce((mask,l,i)=>mask|(!l.valid?1<<i:0),0),s.sensitivity,s.preset]);
      this.receiver.reply(TYPES.GAME_FEEDBACK,request,[s.hint,s.distance,s.targetSpeed,s.delta,s.hits,0]);
    }
  }
  snapshot(){return {online:this.online(),state:this.online()?this.state:null,commands:[...this.history]};}
}
