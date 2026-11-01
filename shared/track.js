export const TRACK = { name: '灰港工业环线', subtitle: 'GREYPORT INDUSTRIAL', halfWidth: 6.5, shoulder: 3.5, segments: 640, laps: 3 };
const controls = [[-78,-30],[-82,35],[-52,69],[14,76],[67,53],[92,3],[74,-43],[34,-70],[2,-48],[-25,-69],[-64,-61]];
const mod = (a,n) => ((a % n) + n) % n;
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const wrapAngle = a => Math.atan2(Math.sin(a),Math.cos(a));
function spline(t) {
  const p=t*controls.length, i=Math.floor(p), u=p-i;
  const a=controls[mod(i-1,controls.length)], b=controls[mod(i,controls.length)], c=controls[mod(i+1,controls.length)], d=controls[mod(i+2,controls.length)];
  const axis=k=>0.5*((2*b[k])+(-a[k]+c[k])*u+(2*a[k]-5*b[k]+4*c[k]-d[k])*u*u+(-a[k]+3*b[k]-3*c[k]+d[k])*u*u*u);
  return { x:axis(0)*1.4, z:axis(1)*1.4 };
}
export const points=Array.from({length:TRACK.segments},(_,i)=>spline(i/TRACK.segments));
export const segments=[];
let length=0;
for(let i=0;i<points.length;i++) {
  const a=points[i], b=points[(i+1)%points.length], dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
  segments.push({a,b,dx,dz,len,start:length,tx:dx/len,tz:dz/len,nx:dz/len,nz:-dx/len}); length+=len;
}
export const trackLength=length;
export function sampleTrack(distance) {
  const s=mod(distance,trackLength);
  let lo=0,hi=segments.length-1;
  while(lo<hi) { const m=Math.floor((lo+hi+1)/2); if(segments[m].start<=s)lo=m;else hi=m-1; }
  const seg=segments[lo], t=(s-seg.start)/seg.len;
  return {x:seg.a.x+seg.dx*t,z:seg.a.z+seg.dz*t,tx:seg.tx,tz:seg.tz,nx:seg.nx,nz:seg.nz,heading:Math.atan2(seg.tx,seg.tz),s,progress:s/trackLength,index:lo};
}
export function projectTrack(x,z) {
  let best=Infinity,result;
  for(let i=0;i<segments.length;i++) {
    const a=segments[i], u=clamp(((x-a.a.x)*a.dx+(z-a.a.z)*a.dz)/(a.len*a.len),0,1);
    const px=a.a.x+a.dx*u,pz=a.a.z+a.dz*u,d=(x-px)**2+(z-pz)**2;
    if(d<best) { best=d;result={x:px,z:pz,tx:a.tx,tz:a.tz,nx:a.nx,nz:a.nz,heading:Math.atan2(a.tx,a.tz),s:a.start+a.len*u,index:i,offset:(x-px)*a.nx+(z-pz)*a.nz}; }
  }
  return {...result,distance:Math.sqrt(best),progress:result.s/trackLength};
}
export const start=sampleTrack(0);
