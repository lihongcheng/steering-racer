export class InputGate {
  constructor(){this.mode='keyboard';this.snapshot=null;this.receivedAt=-Infinity;this.keys=new Set();this.sensitivity=1.65;this.preset='responsive';}
  setMode(mode){this.mode=mode;this.keys.clear();}
  receive(snapshot,time){this.snapshot=snapshot;this.receivedAt=time;}
  phoneReady(time){const s=this.snapshot;return !!(s?.source==='iphone' && s.connected && s.armed && s.calibrated && Number.isFinite(s.sampleAgeMs) && s.sampleAgeMs+(time-this.receivedAt)<250 && time-this.receivedAt<250);}
  controls(time){
    // Build 2's screen-normal quaternion twist uses the opposite sign to world yaw.
    // Correct at the game boundary; leave the diagnostic wheel and keyboard unchanged.
    if(this.mode==='phone') {
      if(!this.phoneReady(time))return {steer:0,throttle:0,brake:0};
      const s=this.snapshot,raw=Math.max(-1,Math.min(1,-s.steer*this.sensitivity));
      const steer=this.preset==='comfort'?Math.sign(raw)*Math.pow(Math.abs(raw),1.25):raw;
      return {steer,throttle:s.throttle,brake:s.brake};
    }
    return {steer:(this.keys.has('ArrowRight')||this.keys.has('KeyD')?1:0)-(this.keys.has('ArrowLeft')||this.keys.has('KeyA')?1:0),throttle:this.keys.has('ArrowUp')||this.keys.has('KeyW')?1:0,brake:this.keys.has('ArrowDown')||this.keys.has('KeyS')||this.keys.has('Space')?1:0};
  }
  clear(){this.keys.clear();}
}
