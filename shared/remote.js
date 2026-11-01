export const ACTION={START:1,PAUSE:2,RESUME:3,RESET:4,RESTART:5,HOME:6,COMFORT:7,SPORT:8};
export const PHASE={ready:1,countdown:2,running:3,paused:4,finished:5};
export class RemoteCommands {
  constructor(){this.cache=new Map();}
  execute(message,{time=Date.now(),ready,phase,visible=true,apply}){
    const key=`${message.epoch}:${message.clientId}:${message.id}`;
    if(this.cache.has(key))return this.cache.get(key);
    let result=-1;
    if(time>message.deadline)result=-3;
    else if(visible && (ready||[2,6,7,8].includes(message.action))){
      const allowed={1:['ready'],2:['running','countdown','paused'],3:['paused'],4:['running','paused'],5:['ready','finished','paused'],6:['ready','paused','finished'],7:['ready','paused','finished'],8:['ready','paused','finished']};
      if(allowed[message.action]?.includes(phase)){apply(message.action);result=1;}
    }
    this.cache.set(key,result);if(this.cache.size>128)this.cache.delete(this.cache.keys().next().value);return result;
  }
}
