import './style.css';
import './urban.css';
import {World} from './world.js';
import {Race,PHYSICS_DT} from '../../shared/physics.js';
import {TRACK,points,sampleTrack,trackLength,wrapAngle} from '../../shared/track.js';
import {InputGate} from '../../shared/input.js';
import {EngineAudio} from './audio.js';
import {RemoteCommands,PHASE,ACTION} from '../../shared/remote.js';
import {drivingHint} from '../../shared/feedback.js';
import {interpolateCar} from '../../shared/presentation.js';
import {CAMERA_MODES,CAMERA_LABELS,cockpitVisualInput,SEAT_HEIGHT,normalizeSeatHeight} from '../../shared/camera.js';

const $=id=>document.getElementById(id),race=new Race(),input=new InputGate(),audio=new EngineAudio();
let previousCar={...race.car};
let seatHeight=SEAT_HEIGHT.default;
try{const saved=localStorage.getItem('greyport.seat-height');if(saved!==null)seatHeight=normalizeSeatHeight(Number(saved));}catch{}
let world,socket,config,toastTimer,cameraMode='chase',lastFrame=performance.now(),accumulator=0,lastHud=0,fpsFrames=0,fpsAt=performance.now(),fps=0,lastPhase='',sessionBest=null;
const remote=new RemoteCommands();let owner=false,epoch=null,lastTelemetry=0,hitUntil=0,lastDelta=0;
try{world=new World($('scene'));}catch(error){$('fatal-text').textContent=error.message;$('fatal').hidden=false;console.error(error);}
try{const sensitivity=Number(localStorage.getItem('coastline.sensitivity'));if(sensitivity>=.75&&sensitivity<=2.5)input.sensitivity=sensitivity;}catch{}
try{const preset=localStorage.getItem('coastline.preset');if(['comfort','responsive'].includes(preset))input.preset=preset;}catch{}
const formatTime=t=>Number.isFinite(t)?`${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(3).padStart(6,'0')}`:'—';
try{const saved=Number(localStorage.getItem('greyport.best.v1'));if(saved>0)sessionBest=saved;}catch{}
function toast(text,duration=3000){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,duration);}
function saveBest(time){if(!sessionBest||time<sessionBest){sessionBest=time;try{localStorage.setItem('greyport.best.v1',String(time));}catch{}}}
function setMode(mode){if(['running','countdown'].includes(race.phase))pause('切换控制方式，比赛已暂停');input.setMode(mode);$('keyboard-mode').classList.toggle('selected',mode==='keyboard');$('phone-mode').classList.toggle('selected',mode==='phone');$('keyboard-mode').setAttribute('aria-pressed',String(mode==='keyboard'));$('phone-mode').setAttribute('aria-pressed',String(mode==='phone'));updateHUD(performance.now());}
function phoneIssue(time){const s=input.snapshot;if(!s?.connected||time-input.receivedAt>250)return '手机连接中断，请检查 Wi-Fi 并重新开始控制';if(!s.armed)return '手机控制已暂停，请在 App 中点“开始控制”';if(!s.calibrated)return '手机尚未校准，请先校准中位';return '体感数据超时，车辆已暂停';}
function startRace(){
  if(!world||!owner){toast('游戏窗口尚未就绪，请刷新或关闭其他游戏窗口');return;}
  if(input.mode==='phone'&&!input.phoneReady(performance.now())){openPair();toast('先在手机校准并开始比赛');return;}
  input.clear();race.start();previousCar={...race.car};accumulator=0;lastFrame=performance.now();syncPhase();
}
function pause(reason){race.pause(reason);input.clear();syncPhase();}
function resume(){if(!owner)return;if(input.mode==='phone'&&!input.phoneReady(performance.now())){toast(phoneIssue(performance.now()));return;}input.clear();race.resume();lastFrame=performance.now();accumulator=0;syncPhase();}
function home(){race.reset();previousCar={...race.car};input.clear();accumulator=0;syncPhase();}
function restart(){race.reset();startRace();}
function respawn(){if(!['running','paused'].includes(race.phase))return;race.respawn();previousCar={...race.car};toast('车辆已回到赛道 · 本圈不计最佳成绩');}
function syncPhase(){
  const phase=race.phase;document.body.dataset.phase=phase;document.body.classList.toggle('racing',phase!=='ready');
  $('intro').hidden=phase!=='ready';$('racing-hud').hidden=phase==='ready';$('pause-overlay').hidden=phase!=='paused';$('finish-overlay').hidden=phase!=='finished';$('countdown').hidden=phase!=='countdown';
  $('pause-reason').textContent=race.pauseReason;
  if(phase==='finished'&&lastPhase!=='finished'){
    $('result-total').textContent=formatTime(race.lap.total);$('lap-results').replaceChildren(...race.lap.laps.map((lap,i)=>{const row=document.createElement('div');const name=document.createElement('span');name.textContent=`LAP 0${i+1}`;const value=document.createElement(lap.valid?'span':'small');value.textContent=`${formatTime(lap.time)}${lap.valid?'':' · 重置圈'}`;row.append(name,value);return row;}));
  }
  lastPhase=phase;
}
async function post(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
async function loadConfig(host){config=await(await fetch(`/api/config${host?`?host=${encodeURIComponent(host)}`:''}`)).json();$('qr').src=config.qr;$('host').replaceChildren(...config.hosts.map(h=>Object.assign(document.createElement('option'),{value:h.address,textContent:`${h.address} · ${h.name}`,selected:h.address===config.host})));if(!config.hasLAN)toast('尚未找到局域网地址，请让电脑连接 Wi-Fi');}
function openPair(){pause('连接手机，比赛已暂停');$('pair-overlay').hidden=false;loadConfig($('host').value).catch(e=>toast(e.message));}
function preset(name){
  input.preset=name;input.sensitivity=name==='comfort'?1.35:1.85;
  try{localStorage.setItem('coastline.preset',name);localStorage.setItem('coastline.sensitivity',String(input.sensitivity));}catch{}
  updateSensitivity();toast(name==='comfort'?'舒适手感 · 中心更稳定':'灵敏手感 · 入弯更直接');
}
function handleRemote(message){
  if(!owner||message.epoch!==epoch)return;
  const result=remote.execute(message,{ready:input.phoneReady(performance.now()),phase:race.phase,visible:!document.hidden&&!!world,apply:action=>{
    for(const id of ['pair-overlay','settings-overlay'])$(id).hidden=true;
    if([ACTION.START,ACTION.RESUME,ACTION.RESTART].includes(action))setMode('phone');
    if(action===ACTION.START)startRace();
    if(action===ACTION.PAUSE)pause('手机已暂停比赛');
    if(action===ACTION.RESUME)resume();
    if(action===ACTION.RESET)respawn();
    if(action===ACTION.RESTART)restart();
    if(action===ACTION.HOME)home();
    if(action===ACTION.COMFORT)preset('comfort');
    if(action===ACTION.SPORT)preset('responsive');
  }});
  socket.send(JSON.stringify({type:'game-result',epoch,id:message.id,clientId:message.clientId,result}));
  sendTelemetry(performance.now(),true);
}
function sendTelemetry(time,force=false){
  if(!owner||socket?.readyState!==1||(!force&&time-lastTelemetry<100)||socket.bufferedAmount>4096)return;
  lastTelemetry=time;const hint=drivingHint(race.car);
  socket.send(JSON.stringify({type:'game-state',epoch,state:{phase:PHASE[race.phase],lap:Math.min(3,race.lap.completed+1),speed:race.car.speed*3.6,total:race.lap.total,best:sessionBest??0,lastLap:race.lap.lastLap?.time??0,laps:race.lap.laps,hint:time<hitUntil?5:race.phase==='running'?hint.code:0,distance:hint.distance,targetSpeed:hint.targetSpeed,delta:lastDelta,sensitivity:input.sensitivity,preset:input.preset==='comfort'?1:2,hits:race.hits}}));
}
function connect(){
  socket=new WebSocket(`ws://${location.host}/game-live`);
  socket.onmessage=event=>{try{
    const message=JSON.parse(event.data);
    if(message.type==='game-owner'){owner=message.owned;epoch=message.epoch??null;$('claim-window').hidden=owner;if(!owner){pause('已有另一个游戏窗口，请关闭本页或关闭其他窗口后刷新');toast('另一个窗口正在接收手机命令',6000);}else sendTelemetry(performance.now(),true);return;}
    if(message.type==='game-command'){handleRemote(message);return;}
    input.receive(message,performance.now());
  }catch(error){console.error('游戏通信处理失败',error);}};
  socket.onclose=()=>{owner=false;epoch=null;input.snapshot=null;if(input.mode==='phone')pause('本地接收服务断开');setTimeout(connect,1500);};socket.onerror=()=>socket.close();
}
$('claim-window').onclick=()=>{if(socket?.readyState===1)socket.send(JSON.stringify({type:'claim-owner'}));};
$('keyboard-mode').onclick=()=>setMode('keyboard');$('phone-mode').onclick=()=>{setMode('phone');openPair();};$('start').onclick=startRace;
$('pair-button').onclick=openPair;$('close-pair').onclick=()=>$('pair-overlay').hidden=true;
$('host').onchange=()=>loadConfig($('host').value).catch(e=>toast(e.message));
$('use-phone').onclick=()=>{if(!input.phoneReady(performance.now())){toast('请先在手机校准中位并点“开始比赛”');return;}setMode('phone');$('pair-overlay').hidden=true;toast('手机方向盘已就绪');};
$('release').onclick=async()=>{try{await post('/api/reset',{});await loadConfig($('host').value);toast('已生成新的二维码，请重新扫码');}catch(e){toast(e.message);}};
$('pause').onclick=()=>pause();$('resume').onclick=resume;$('restart').onclick=restart;$('home').onclick=home;$('again').onclick=restart;$('finish-home').onclick=home;$('reset-car').onclick=respawn;
function sound(){audio.enable(!audio.enabled);$('sound').textContent=`音效 ${audio.enabled?'开':'关'}`;}
function camera(){cameraMode=CAMERA_MODES[(CAMERA_MODES.indexOf(cameraMode)+1)%CAMERA_MODES.length];$('camera').textContent=CAMERA_LABELS[cameraMode];document.body.dataset.camera=cameraMode;try{localStorage.setItem('greyport.camera',cameraMode);}catch{}}
try{const saved=localStorage.getItem('greyport.camera');if(CAMERA_MODES.includes(saved))cameraMode=saved;}catch{}
$('camera').textContent=CAMERA_LABELS[cameraMode];document.body.dataset.camera=cameraMode;
$('sound').onclick=sound;$('camera').onclick=camera;
$('comfort-preset').onclick=()=>preset('comfort');$('responsive-preset').onclick=()=>preset('responsive');
function updateSensitivity(){ $('comfort-preset').classList.toggle('selected',input.preset==='comfort');$('responsive-preset').classList.toggle('selected',input.preset==='responsive'); $('sensitivity').value=input.sensitivity;$('sensitivity-value').textContent=`${input.sensitivity.toFixed(2)}×`;$('sensitivity-hint').textContent=`约 ${Math.round(2+33/input.sensitivity)}° 手机转角达到满舵`; }
function updateSeatHeight(){ $('seat-height').value=String(Math.round(seatHeight*100));$('seat-height-value').textContent=`+${Math.round(seatHeight*100)} cm`;$('seat-height-hint').textContent=`座舱眼位比原来抬高 ${Math.round(seatHeight*100)} cm，仅影响座舱视角。`; }
function setSeatHeight(value){seatHeight=normalizeSeatHeight(value);updateSeatHeight();try{localStorage.setItem('greyport.seat-height',String(seatHeight));}catch{}}
$('seat-height').oninput=e=>setSeatHeight(Number(e.target.value)/100);
$('default-seat-height').onclick=()=>setSeatHeight(SEAT_HEIGHT.default);
$('settings-button').onclick=()=>{pause('调整驾驶设置，比赛已暂停');updateSensitivity();updateSeatHeight();$('settings-overlay').hidden=false;};
$('sensitivity').oninput=e=>{input.sensitivity=Number(e.target.value);updateSensitivity();try{localStorage.setItem('coastline.sensitivity',String(input.sensitivity));}catch{}};
$('default-sensitivity').onclick=()=>{input.sensitivity=1.65;updateSensitivity();try{localStorage.setItem('coastline.sensitivity','1.65');}catch{}};
$('close-settings').onclick=$('apply-settings').onclick=()=>{$('settings-overlay').hidden=true;};
const driveKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space']);
window.addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
  if(driveKeys.has(e.code)){e.preventDefault();if(input.mode==='keyboard'&&['running','countdown'].includes(race.phase)&&$('pair-overlay').hidden)input.keys.add(e.code);}
  if(e.repeat)return;
  if(e.code==='Escape'){if(!$('settings-overlay').hidden)$('settings-overlay').hidden=true;else if(!$('pair-overlay').hidden)$('pair-overlay').hidden=true;else race.phase==='paused'?resume():pause();}
  if(e.code==='KeyR')respawn();if(e.code==='KeyC')camera();if(e.code==='KeyM')sound();
  if(e.code==='Enter'&&race.phase==='ready')startRace();
});
window.addEventListener('keyup',e=>input.keys.delete(e.code));
window.addEventListener('blur',()=>{input.clear();if(input.mode==='keyboard')pause('窗口失去焦点，比赛已暂停');});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('页面进入后台，比赛已暂停');});
$('scene').addEventListener('webglcontextlost',e=>{e.preventDefault();pause('图形设备暂时不可用，请刷新页面');});

const map=$('minimap'),ctx=map.getContext('2d'),bounds={minX:-145,maxX:155,minZ:-120,maxZ:128};
const mapPoint=p=>({x:16+(p.x-bounds.minX)/(bounds.maxX-bounds.minX)*(map.width-32),y:map.height-16-(p.z-bounds.minZ)/(bounds.maxZ-bounds.minZ)*(map.height-32)});
function drawMap(){
  ctx.clearRect(0,0,map.width,map.height);ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();points.forEach((p,i)=>{const v=mapPoint(p);i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y);});ctx.closePath();ctx.strokeStyle='#476662';ctx.lineWidth=13;ctx.stroke();ctx.strokeStyle='#a6bdb0';ctx.lineWidth=2;ctx.stroke();
  for(let i=1;i<8;i++){const p=mapPoint(sampleTrack(trackLength*i/8));ctx.beginPath();ctx.arc(p.x,p.y,2.4,0,Math.PI*2);ctx.fillStyle=i<race.lap.nextGate?'#d8f378':'#8ca99d';ctx.fill();}
  const st=mapPoint(sampleTrack(0));ctx.fillStyle='#fff6d9';ctx.fillRect(st.x-3,st.y-4,6,8);
  const p=mapPoint(race.car);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(race.car.heading);ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(-4.5,5);ctx.lineTo(4.5,5);ctx.closePath();ctx.fillStyle='#ddf980';ctx.shadowColor='#d8f378';ctx.shadowBlur=9;ctx.fill();ctx.restore();
}
function updateHUD(time){
  const s=input.snapshot,ready=input.phoneReady(time),car=race.car,controls=input.controls(time);
  $('connection-dot').classList.toggle('ready',ready);$('pair-status').textContent=ready?'手机方向盘已就绪':s?.connected?(s.calibrated?'请在手机点“开始比赛”':'已连接，请在手机校准中位'):'等待手机连接';
  $('mode-label').textContent=input.mode==='phone'?'iPhone 体感驾驶':'键盘驾驶';
  $('network-status').textContent=input.mode==='phone'?(ready?`${Math.round(s.sensorHz)} Hz / ${s.rttMs>=0?Math.round(s.rttMs)+' ms RTT':'RTT —'}`:'等待手机就绪'):'本地运行';
  $('start').disabled=!owner||(input.mode==='phone'&&!ready);$('start-hint').textContent=input.mode==='keyboard'?'W / ↑ 加速，S / ↓ 刹车，A D / ← → 转向':ready?'方向盘已就绪 · 左右旋转，按住油门起步':'点右上角“连接手机”，扫码、校准并开始比赛';
  $('resume').disabled=input.mode==='phone'&&!ready;$('use-phone').disabled=!ready;
  $('saved-best').textContent=sessionBest?formatTime(sessionBest):'尚无记录';
  $('lap-count').textContent=String(Math.min(3,race.lap.completed+1)).padStart(2,'0');$('lap-progress').style.width=`${car.track.progress*100}%`;$('sector').textContent=`SECTOR ${String(race.lap.nextGate).padStart(2,'0')} / 08`;
  $('lap-time').textContent=formatTime(race.lap.elapsed);$('total-time').textContent=formatTime(race.lap.total);$('best-lap').textContent=sessionBest?formatTime(sessionBest):'—';
  $('lap-valid').textContent=race.lap.invalid?'重置圈 · 不计最佳成绩':'有效计时圈';$('lap-valid').classList.toggle('invalid',race.lap.invalid);
  const gear=Math.min(5,1+Math.floor(car.speed/9)),rpm=car.speed<.4?900:2400+(car.speed%9)/9*4600;$('rpm-needle').setAttribute('transform',`rotate(${-130+rpm/8000*260} 120 120)`);
  $('speed').textContent=String(Math.round(car.speed*3.6)).padStart(3,'0');$('gear').textContent=car.speed<.4?'N':String(Math.min(5,1+Math.floor(car.speed/9)));
  $('revs').style.width=`${Math.min(100,car.speed/43*100)}%`;$('throttle-bar').style.width=`${controls.throttle*100}%`;$('brake-bar').style.width=`${controls.brake*100}%`;$('steering-position').style.left=`${50+car.steering*50}%`;
  const hint=drivingHint(car);$('driving-hint').textContent=hint.text;$('driving-hint').hidden=!hint.code||race.phase!=='running';$('driving-hint').classList.toggle('urgent',[3,4].includes(hint.code));
  $('surface').hidden=!car.offroad||race.phase!=='running';$('fps').textContent=`${Math.round(fps)} FPS`;
  if(race.phase==='countdown')$('countdown').querySelector('strong').textContent=Math.max(1,Math.ceil(race.countdown));
  drawMap();
}
function frame(time){
  const elapsed=Math.max(0,(time-lastFrame)/1000);lastFrame=time;
  if(elapsed>.3&&['running','countdown'].includes(race.phase))pause('画面暂停过久，请确认后继续');
  if(input.mode==='phone'&&!input.phoneReady(time))pause(phoneIssue(time));
  accumulator+=Math.min(elapsed,.1);
  const controls=input.controls(time);
  while(accumulator>=PHYSICS_DT){
    previousCar={...race.car};
    race.step(controls,PHYSICS_DT);accumulator-=PHYSICS_DT;
    if(race.event==='hit'){hitUntil=time+900;toast('擦碰护栏 · 速度降低',1200);}
    if(race.event==='go')toast('GO · 油门交给你',1600);
    if(['lap','finish'].includes(race.event)){const lap=race.lap.lastLap;lastDelta=sessionBest?lap.time-sessionBest:0;if(lap.valid)saveBest(lap.time);toast(`第 ${lap.number} 圈 ${formatTime(lap.time)}${lap.valid?(lastDelta?` · 比最佳${lastDelta<0?'快':'慢'} ${Math.abs(lastDelta).toFixed(2)} 秒`:''):' · 重置圈'}`,3500);}
  }
  if(lastPhase!==race.phase)syncPhase();
  audio.update(race.car.speed,controls.throttle,race.phase==='running');
  const renderCar=race.phase==='running'?interpolateCar(previousCar,race.car,accumulator/PHYSICS_DT):race.car;
  const visualSteering=cockpitVisualInput(renderCar.steering,input.mode==='phone'&&input.phoneReady(time)?input.snapshot.angle:input.mode==='phone'?0:undefined);
  world?.render(renderCar,{visualSteering,seatHeight,phase:race.phase,brake:controls.brake,dt:Math.min(elapsed,.06),time:time/1000,camera:cameraMode});
  fpsFrames++;if(time-fpsAt>1000){fps=fpsFrames*1000/(time-fpsAt);fpsFrames=0;fpsAt=time;}
  if(time-lastHud>80){updateHUD(time);lastHud=time;}
  sendTelemetry(time);
  requestAnimationFrame(frame);
}
const svgNS='http://www.w3.org/2000/svg';
for(let i=0;i<=40;i++){const angle=(-130+i*6.5)*Math.PI/180,r=i%5===0?85:91;const line=document.createElementNS(svgNS,'line');for(const [k,v]of Object.entries({x1:120+Math.sin(angle)*r,y1:120-Math.cos(angle)*r,x2:120+Math.sin(angle)*98,y2:120-Math.cos(angle)*98,stroke:i>32?'#cc5a3c':'#c0c8ac','stroke-width':i%5===0?2:1}))line.setAttribute(k,v);$('dial-ticks').append(line);if(i%5===0){const text=document.createElementNS(svgNS,'text');text.setAttribute('x',120+Math.sin(angle)*75);text.setAttribute('y',124-Math.cos(angle)*75);text.setAttribute('fill','#bdc5ad');text.setAttribute('font-size','12');text.setAttribute('font-family','monospace');text.setAttribute('text-anchor','middle');text.textContent=String(i/5);$('dial-ticks').append(text);}}
$('track-length').textContent=`${Math.round(trackLength)} M`;
connect();loadConfig().catch(e=>toast(`连接服务失败：${e.message}`));syncPhase();updateHUD(performance.now());requestAnimationFrame(frame);
