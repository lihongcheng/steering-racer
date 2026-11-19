import * as THREE from 'three';

export class Dashboard {
  constructor(parent) {
    this.canvas = document.createElement('canvas'); this.canvas.width = 512; this.canvas.height = 512;
    this.context = this.canvas.getContext('2d'); this.texture = new THREE.CanvasTexture(this.canvas); this.texture.colorSpace = THREE.SRGBColorSpace;
    this.screen = new THREE.Mesh(new THREE.CircleGeometry(.073,48),new THREE.MeshBasicMaterial({map:this.texture,toneMapped:false}));
    this.screen.position.set(.346,.855,.594); this.screen.rotation.y = Math.PI; this.screen.rotation.x = -.20; parent.add(this.screen);
    this.last = -1;
  }
  update(state,time) {
    if (time-this.last<.08) return; this.last=time;
    const c=this.context,speed=state.speed*3.6,gear=speed<1?'N':Math.min(5,1+Math.floor(state.speed/9));
    c.fillStyle='#13191d';c.fillRect(0,0,512,512);
    c.fillStyle='#eee8d9';c.font='500 112px monospace';c.textAlign='center';c.fillText(String(Math.round(speed)).padStart(3,'0'),256,285);
    c.fillStyle='#aebac1';c.font='31px monospace';c.fillText('km/h',256,332);
    c.fillStyle='#ddb35e';c.font='55px monospace';c.fillText(String(gear),256,409);
    const rpm=speed<1?900:2400+(state.speed%9)/9*4600;
    for(let i=0;i<32;i++){const a=(-220+i*8.5)*Math.PI/180;c.strokeStyle=i<rpm/8000*32?(i>25?'#db5536':'#d4cbb4'):'#56606a';c.lineWidth=4;c.beginPath();c.moveTo(256+Math.cos(a)*202,256+Math.sin(a)*202);c.lineTo(256+Math.cos(a)*227,256+Math.sin(a)*227);c.stroke();}
    c.fillStyle='#95a5a8';c.font='28px monospace';c.fillText('V8  /  RPM',256,172);
    this.texture.needsUpdate=true;
  }
  dispose(){this.texture.dispose();}
}
