import {sampleTrack,wrapAngle} from './track.js';
export function drivingHint(car){
  if(car.speed>2&&Math.abs(wrapAngle(car.heading-car.track.heading))>Math.PI*.62)return {code:4,text:'逆向行驶 · 请掉头或重置',distance:0,targetSpeed:0};
  let strongest=0,at=0,curve=0;
  for(let distance=12;distance<=75;distance+=9){
    const a=sampleTrack(car.track.s+distance),b=sampleTrack(car.track.s+distance+12);
    const signed=wrapAngle(b.heading-a.heading),intensity=Math.abs(signed);
    if(intensity>strongest){strongest=intensity;at=distance;curve=signed;}
  }
  if(strongest<.21)return {code:0,text:'',distance:0,targetSpeed:0};
  const target=Math.max(35,Math.min(105,Math.sqrt(11/Math.max(strongest/12,.001))*3.6));
  const urgent=car.speed*3.6>target+8&&at<car.speed*2+15;
  const direction=curve>0?'右':'左';
  return {code:urgent?3:curve>0?2:1,text:urgent?`${direction}弯减速 · 建议 ${Math.round(target)} km/h`:`前方${direction}弯 · ${Math.round(at)} m`,distance:at,targetSpeed:target};
}
