import { clamp,projectTrack,sampleTrack,trackLength,TRACK,wrapAngle } from './track.js';
export const PHYSICS_DT=1/60;
export function maxSteerAngle(speed) { return (32/(1+(Math.abs(speed)/20)**1.3))*Math.PI/180; }
export function createCar(distance=0) {
  const t=sampleTrack(distance);
  return {x:t.x,z:t.z,heading:t.heading,speed:0,steering:0,wheelAngle:0,offroad:false,collision:false,collisionCooldown:0,track:t,odometer:0};
}
export function stepCar(car,input,dt=PHYSICS_DT) {
  if(!Number.isFinite(dt)||dt<=0||dt>0.1)return car;
  const steer=clamp(Number.isFinite(input.steer)?input.steer:0,-1,1);
  const throttle=clamp(Number.isFinite(input.throttle)?input.throttle:0,0,1);
  const brake=clamp(Number.isFinite(input.brake)?input.brake:0,0,1);
  car.collision=false;car.collisionCooldown=Math.max(0,car.collisionCooldown-dt);
  car.steering+=(steer-car.steering)*(1-Math.exp(-dt/0.055));
  car.track=projectTrack(car.x,car.z);
  car.offroad=Math.abs(car.track.offset)>TRACK.halfWidth-0.65;
  const resistance=0.42+0.0042*car.speed*car.speed+(car.offroad?3.0+0.16*car.speed:0);
  const acceleration=throttle*(brake>0.1?0:8.5)*(1-0.28*car.speed/43)-brake*15-resistance;
  car.speed=clamp(car.speed+acceleration*dt,0,43);
  car.wheelAngle=car.steering*maxSteerAngle(car.speed);
  const rawYaw=car.speed/2.7*Math.tan(car.wheelAngle), lateralLimit=(car.offroad?8:20)/Math.max(car.speed,1);
  const yaw=clamp(rawYaw,-lateralLimit,lateralLimit);
  car.heading=wrapAngle(car.heading+yaw*dt);
  car.x+=Math.sin(car.heading)*car.speed*dt;car.z+=Math.cos(car.heading)*car.speed*dt;
  car.odometer+=car.speed*dt;
  car.track=projectTrack(car.x,car.z);
  const wall=TRACK.halfWidth+TRACK.shoulder-1.1;
  if(Math.abs(car.track.offset)>wall) {
    const side=Math.sign(car.track.offset);
    car.x=car.track.x+car.track.nx*side*(wall-0.12);car.z=car.track.z+car.track.nz*side*(wall-0.12);
    const fx=Math.sin(car.heading),fz=Math.cos(car.heading),nx=car.track.nx*side,nz=car.track.nz*side,out=fx*nx+fz*nz;
    if(out>0) { car.heading=Math.atan2(fx-1.25*out*nx,fz-1.25*out*nz);car.speed*=0.48; }
    if(car.collisionCooldown===0 && car.speed>0.4) {car.collision=true;car.collisionCooldown=0.5;}
    car.track=projectTrack(car.x,car.z);
  }
  return car;
}

export class LapTracker {
  constructor(){this.reset();}
  reset(){this.completed=0;this.nextGate=1;this.previous=0;this.distance=0;this.invalid=false;this.elapsed=0;this.total=0;this.laps=[];this.lastLap=null;}
  teleport(progress){this.previous=progress;this.invalid=true;}
  update(progress,dt) {
    this.elapsed+=dt;this.total+=dt;
    let delta=progress-this.previous;
    if(delta>0.5)delta-=1;if(delta<-.5)delta+=1;
    const old=this.previous;this.previous=progress;
    if(Math.abs(delta)>0.08){this.invalid=true;return null;}
    // Backtracking subtracts from progress, so oscillating across a gate cannot finish a lap.
    this.distance=Math.max(0,this.distance+delta*trackLength);
    if(delta<=0)return null;
    if(this.nextGate<8) {
      const gate=this.nextGate/8;
      if(old<gate && progress>=gate)this.nextGate++;
    }
    if(old>0.85 && progress<0.15 && this.nextGate===8 && this.distance>trackLength*0.9) {
      const result={time:this.elapsed,valid:!this.invalid,number:++this.completed};
      this.lastLap=result;this.laps.push(result);this.nextGate=1;this.distance=0;this.elapsed=0;this.invalid=false;return result;
    }
    return null;
  }
}

export class Race {
  constructor(){this.reset();}
  reset(){this.car=createCar();this.lap=new LapTracker();this.phase='ready';this.countdown=3;this.pauseReason='';this.hits=0;this.resets=0;this.event=null;}
  start(){if(this.phase==='ready'||this.phase==='finished'){this.reset();this.phase='countdown';}}
  pause(reason='比赛已暂停'){if(['running','countdown'].includes(this.phase)){this.resumePhase=this.phase;this.phase='paused';this.pauseReason=reason;}}
  resume(){if(this.phase==='paused'){this.phase=this.resumePhase??'running';this.pauseReason='';}}
  respawn(){const s=this.car.track.s;this.car=createCar(s);this.lap.teleport(this.car.track.progress);this.resets++;}
  step(input,dt=PHYSICS_DT){
    this.event=null;
    if(this.phase==='countdown'){this.countdown-=dt;if(this.countdown<=0){this.phase='running';this.event='go';}return;}
    if(this.phase!=='running')return;
    stepCar(this.car,input,dt);if(this.car.collision){this.hits++;this.event='hit';}
    const result=this.lap.update(this.car.track.progress,dt);
    if(result){this.event='lap';if(this.lap.completed>=TRACK.laps){this.phase='finished';this.event='finish';}}
  }
}

// Used by the deterministic regression drive, not exposed as a fake user input source.
export function referenceDriver(car) {
  const target=sampleTrack(car.track.s+9+car.speed*0.48);
  const desired=Math.atan2(target.x-car.x,target.z-car.z),error=wrapAngle(desired-car.heading);
  const steer=clamp(Math.atan2(2*2.7*Math.sin(error),Math.hypot(target.x-car.x,target.z-car.z))/maxSteerAngle(car.speed),-1,1);
  const ahead=sampleTrack(car.track.s+18), curvature=Math.abs(wrapAngle(ahead.heading-car.track.heading))/18;
  const desiredSpeed=clamp(Math.sqrt(7/Math.max(curvature,0.0001)),10,29);
  return {steer,throttle:car.speed<desiredSpeed?1:0,brake:car.speed>desiredSpeed+1?0.6:0};
}
