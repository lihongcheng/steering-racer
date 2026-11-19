// A local, layered engine model: combustion harmonics, intake, tire noise and wind.
export class EngineAudio {
  constructor(){this.enabled=false;this.context=null;}
  enable(value){
    this.enabled=value;
    if(value&&!this.context)this.create();
    if(value)this.context.resume().catch(()=>{});
    else this.master?.gain.setTargetAtTime(0,this.context.currentTime,.08);
  }
  create(){
    const context=this.context=new AudioContext();
    this.master=context.createGain();this.master.gain.value=0;
    const compressor=context.createDynamicsCompressor();compressor.threshold.value=-18;compressor.ratio.value=4;
    this.master.connect(compressor).connect(context.destination);
    this.cabin=context.createBiquadFilter();this.cabin.type='lowpass';this.cabin.frequency.value=8000;this.cabin.connect(this.master);
    const real=new Float32Array(17),imag=new Float32Array(17);
    for(let i=1;i<17;i++)imag[i]=(i%2?.68:1)/Math.pow(i,1.24);
    const wave=context.createPeriodicWave(real,imag);
    this.engine=context.createOscillator();this.engine.setPeriodicWave(wave);
    this.engineGain=context.createGain();this.engineGain.gain.value=0;
    this.exhaust=context.createBiquadFilter();this.exhaust.type='lowpass';this.exhaust.Q.value=.7;
    this.engine.connect(this.exhaust).connect(this.engineGain).connect(this.cabin);this.engine.start();
    this.bass=context.createOscillator();this.bass.type='sine';this.bassGain=context.createGain();this.bassGain.gain.value=0;
    this.bass.connect(this.bassGain).connect(this.cabin);this.bass.start();
    const buffer=context.createBuffer(1,context.sampleRate*3,context.sampleRate),data=buffer.getChannelData(0);
    let seed=1209,low=0;
    for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=seed/4294967296*2-1;low=(low+.04*white)/1.04;data[i]=low*4;}
    this.noise=context.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;
    this.tires=context.createBiquadFilter();this.tires.type='bandpass';this.tires.frequency.value=850;this.tires.Q.value=.6;
    this.tireGain=context.createGain();this.tireGain.gain.value=0;this.noise.connect(this.tires).connect(this.tireGain).connect(this.cabin);
    this.wind=context.createBiquadFilter();this.wind.type='lowpass';this.wind.frequency.value=500;
    this.windGain=context.createGain();this.windGain.gain.value=0;this.noise.connect(this.wind).connect(this.windGain).connect(this.cabin);this.noise.start();
  }
  update(speed,throttle,running,{offroad=false,brake=0,camera='chase'}={}){
    if(!this.context)return;
    const t=this.context.currentTime,v=Math.max(0,Number.isFinite(speed)?speed:0),load=Math.max(0,Math.min(1,throttle));
    const rpm=v<.4?850+load*850:2200+(v%9)/9*4800;
    this.master.gain.setTargetAtTime(this.enabled&&running?.2:0,t,.09);
    this.engine.frequency.setTargetAtTime(rpm/60*2,t,.085);
    this.bass.frequency.setTargetAtTime(rpm/120,t,.08);
    this.exhaust.frequency.setTargetAtTime(480+rpm*.27+load*900,t,.12);
    this.engineGain.gain.setTargetAtTime(.10+load*.18,t,.08);
    this.bassGain.gain.setTargetAtTime(.055+load*.065,t,.09);
    this.tireGain.gain.setTargetAtTime(Math.min(.2,v*.0024)*(offroad?1.8:1)+brake*v*.0003,t,.12);
    this.windGain.gain.setTargetAtTime(Math.min(.18,v*v*.000065),t,.2);
    this.cabin.frequency.setTargetAtTime(camera==='cockpit'?2600:9000,t,.12);
  }
  dispose(){this.context?.close();}
}
