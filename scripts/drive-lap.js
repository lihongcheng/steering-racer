import {Race,referenceDriver,PHYSICS_DT} from '../shared/physics.js';
const race=new Race();race.start();
for(let i=0;i<60*240&&race.phase!=='finished';i++)race.step(referenceDriver(race.car),PHYSICS_DT);
console.log(JSON.stringify({phase:race.phase,hits:race.hits,laps:race.lap.laps,total:race.lap.total,car:{x:race.car.x,z:race.car.z,speed:race.car.speed,progress:race.car.track.progress}},null,2));
if(race.phase!=='finished'||race.lap.laps.some(lap=>!lap.valid)||race.hits>8)process.exitCode=1;
