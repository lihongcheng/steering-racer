// First-person cameras must follow the interpolated vehicle rigidly; positional
// easing would trail into the cabin as speed rises.
export function cameraPositionFactor(mode,dt){return ['cockpit','hood','bumper'].includes(mode)?1:1-Math.exp(-Math.max(0,dt)*9);}
export const CAMERA_MODES=['chase','cockpit','hood','bumper','high'];
export const CAMERA_LABELS={chase:'追逐视角',cockpit:'座舱视角',hood:'引擎盖视角',bumper:'保险杠视角',high:'高位视角'};
export const SEAT_HEIGHT={default:.10,min:0,max:.18};
export function normalizeSeatHeight(value){return typeof value==='number'&&Number.isFinite(value)?Math.max(SEAT_HEIGHT.min,Math.min(SEAT_HEIGHT.max,value)):SEAT_HEIGHT.default;}

export const COCKPIT={radius:.215,centerY:-.345,centerZ:-.97,tilt:-.17,maxAngle:Math.PI*.38};
export function cockpitVisualInput(vehicleSteering,phoneAngle){
 // Phone angle is the controller's calibrated visual rotation, before world-yaw
 // inversion. Never derive the handset animation from the inverted vehicle input.
 const value=Number.isFinite(phoneAngle)?phoneAngle/35:vehicleSteering;
 return Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
}
export function cockpitWheelAngle(steering){if(!Number.isFinite(steering)||steering===0)return 0;return -Math.max(-1,Math.min(1,steering))*COCKPIT.maxAngle;}
export function cockpitGrip(side,steering){
 return cockpitPoint(side*COCKPIT.radius,.01,.022,steering);
}
export function cockpitWrist(side,steering){return cockpitPoint(side*.237,-.043,.044,steering);}
function cockpitPoint(x,y,z,steering){
 const angle=cockpitWheelAngle(steering),tilt=COCKPIT.tilt;
 const rx=x*Math.cos(angle)-y*Math.sin(angle),ry=x*Math.sin(angle)+y*Math.cos(angle);
 return {x:rx,y:COCKPIT.centerY+ry*Math.cos(tilt)-z*Math.sin(tilt),z:COCKPIT.centerZ+ry*Math.sin(tilt)+z*Math.cos(tilt)};
}
