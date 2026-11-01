export class EngineAudio {
  constructor(){this.enabled=false;this.context=null;}
  enable(value){
    this.enabled=value;
    if(value && !this.context){
      this.context=new AudioContext();this.osc=this.context.createOscillator();this.osc.type='sawtooth';
      this.filter=this.context.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=450;
      this.gain=this.context.createGain();this.gain.gain.value=0;this.osc.connect(this.filter).connect(this.gain).connect(this.context.destination);this.osc.start();
    }
    if(value)this.context.resume();else if(this.gain)this.gain.gain.setTargetAtTime(0,this.context.currentTime,.08);
  }
  update(speed,throttle,running){if(!this.context)return;const t=this.context.currentTime;this.osc.frequency.setTargetAtTime(36+speed*2.4+throttle*12,t,.09);this.filter.frequency.setTargetAtTime(200+speed*16,t,.12);this.gain.gain.setTargetAtTime(this.enabled && running ? .018 + throttle * .018 : 0,t,.1);}
}
