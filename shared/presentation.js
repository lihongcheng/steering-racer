import {clamp,wrapAngle} from './track.js';

// Interpolate only the presentation. Physics and input remain fixed at 60 Hz.
export function interpolateCar(previous,current,fraction){
  const t=clamp(fraction,0,1);
  if(!previous||Math.hypot(current.x-previous.x,current.z-previous.z)>5)return current;
  const value=k=>previous[k]+(current[k]-previous[k])*t;
  return {...current,x:value('x'),z:value('z'),speed:value('speed'),steering:value('steering'),wheelAngle:value('wheelAngle'),heading:wrapAngle(previous.heading+wrapAngle(current.heading-previous.heading)*t)};
}
