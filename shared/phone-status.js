// Choosing an input mode is separate from accepting live throttle/steering.
// InputGate.phoneReady continues to guard actual driving and race commands.
export function phonePairingState(input,time,{serverConnected=false,owner=false,worldReady=false,phase='ready'}={}) {
  // A WebSocket message may arrive after the timestamp assigned to the current
  // animation frame. Treat that just-arrived status as age zero, not disconnected.
  const snapshot=input.snapshot,elapsed=Math.max(0,time-input.receivedAt);
  const freshStatus=Number.isFinite(elapsed)&&elapsed<1200;
  const phoneConnected=serverConnected&&freshStatus&&snapshot?.source==='iphone'&&snapshot.connected;
  const result=(code,text,hint)=>({code,text,hint,ready:code==='ready',canChoosePhone:worldReady,phoneConnected:!!phoneConnected});
  const action=['paused','running','countdown'].includes(phase)?'继续比赛':phase==='finished'?'再来一局':'开始比赛';
  if(!serverConnected)return result('server-offline','电脑接收服务未连接','请启动电脑上的游戏接收服务；页面会自动重连。');
  if(!worldReady)return result('loading','场景正在准备','等待场景加载完成后即可使用手机驾驶。');
  if(!owner)return result('other-window','当前窗口尚未接管游戏','点击“使用手机驾驶”，将游戏控制切换到当前窗口。');
  if(!freshStatus)return result('syncing','正在等待连接状态','正在同步方向盘状态，请稍候。');
  if(!phoneConnected)return result('unpaired','等待手机连接','打开手机上的 Steering Lab，保持同一 Wi-Fi，并用 App 扫描上方二维码。');
  if(!snapshot.calibrated)return result('calibrate','手机已连接，请先校准中位','在手机上横握方向盘，点“校准中位”；完成后点“'+action+'”。');
  if(!Number.isFinite(snapshot.sampleAgeMs)||snapshot.sampleAgeMs+elapsed>=250||elapsed>=250)
    return result('stale','手机体感数据已中断','请保持手机 App 在前台，重新校准后点“'+action+'”。');
  if(!snapshot.armed)return result('arm','手机已校准，等待开始控制','已可选择手机驾驶；请在手机上点“'+action+'”，电脑会自动响应。');
  if(input.phoneReady(time))return result('ready','手机方向盘已就绪','在手机上点“'+action+'”，按住油门即可驾驶。');
  return result('stale','手机尚未就绪','请保持手机 App 在前台，重新校准后点“'+action+'”。');
}
