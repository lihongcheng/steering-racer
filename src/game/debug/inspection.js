import {createCar} from '../../../shared/physics.js';
import {trackLength,sampleTrack,wrapAngle} from '../../../shared/track.js';

// Explicit local visual inspection mode. It has no race timer or network connection.
export class Inspection {
  constructor(onReset) {
    this.distance=0;this.running=false;this.camera='chase';this.onReset=onReset;
    const panel=document.createElement('section');panel.id='inspection';
    panel.innerHTML='<strong>画面巡检</strong><label>路段 <input id="inspect-distance" aria-label="巡检路段" type="range" min="0" max="'+Math.floor(trackLength)+'" step="1" value="0"></label><select id="inspect-camera" aria-label="巡检视角"><option value="chase">追逐</option><option value="cockpit">座舱</option><option value="hood">引擎盖</option><option value="bumper">保险杠</option><option value="high">高位</option><option value="showcase">车辆展示</option></select><label>转向 <input id="inspect-steer" aria-label="巡检转向" type="range" min="-1" max="1" step=".1" value="0"></label><button id="inspect-run">开始巡检</button><a href="/game/">返回驾驶</a><output id="inspect-readout"></output>';
    document.body.append(panel);document.body.classList.add('racing');document.querySelector('header').hidden=true;document.querySelector('.session-info').hidden=true;
    for(const id of ['intro','racing-hud','minimap-card','session-info']){const node=document.getElementById(id);if(node)node.hidden=true;}
    this.slider=panel.querySelector('#inspect-distance');this.steering=panel.querySelector('#inspect-steer');
    this.slider.oninput=()=>{this.distance=Number(this.slider.value);this.onReset();};
    panel.querySelector('#inspect-camera').onchange=e=>{this.camera=e.target.value;this.onReset();};
    panel.querySelector('#inspect-run').onclick=e=>{this.running=!this.running;e.target.textContent=this.running?'暂停巡检':'开始巡检';this.onReset();};
    this.output=panel.querySelector('output');
  }
  frame(dt,world,time,seatHeight){
    if(this.running){this.distance=(this.distance+Math.min(dt,.05)*18)%trackLength;this.slider.value=String(this.distance);}
    const state=createCar(this.distance),a=sampleTrack(this.distance+2);
    state.speed=this.running?18:0;state.wheelAngle=Math.atan(wrapAngle(a.heading-state.heading)/2*2.65);state.steering=Number(this.steering.value);
    world.render(state,{phase:this.camera==='showcase'?'ready':this.running?'running':'paused',camera:this.camera,dt:Math.min(dt,.05),time,seatHeight,visualSteering:state.steering});
    if(!this.last || time-this.last>.4){
      this.output.textContent=JSON.stringify({distance:Math.round(this.distance),camera:this.camera,running:this.running,...world.lastStats,
        width:world.renderer.domElement.width,height:world.renderer.domElement.height,quality:world.qualityName,mirror:!!world.rearMirror.mesh});this.last=time;
    }
  }
}
