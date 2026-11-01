const $ = id => document.getElementById(id);
let config, socket, status = null, sim = false, currentAngle = 0, lastMessage = 0;
const history = [];
let lastHistory = 0;
const notice = text => { $('notice').textContent = text; $('notice').hidden = !text; };
async function post(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
async function loadConfig(host) {
  config = await (await fetch(`/api/config${host ? `?host=${encodeURIComponent(host)}` : ''}`)).json();
  $('qr').src = config.qr;
  $('endpoint').textContent = `:${config.udpPort}`;
  $('host').replaceChildren(...(config.hosts.length ? config.hosts : [{ address: '127.0.0.1', name: '没有局域网地址' }]).map(item => {
    const option = document.createElement('option'); option.value = item.address; option.textContent = `${item.address} · ${item.name}`; option.selected = item.address === config.host; return option;
  }));
  if (!config.hasLAN) notice('没有找到局域网地址。请先让 Mac 连接 Wi-Fi；电脑模拟仍可使用。');
}
$('host').onchange = () => loadConfig($('host').value).catch(error => notice(error.message));
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(config.pairingURL); $('copy').textContent = '已复制'; setTimeout(() => $('copy').textContent = '复制连接串', 1600); }
  catch { notice('复制失败。请使用 App 扫码连接。'); }
};
function simulationControls(enabled) { sim = enabled; $('simulate').checked = enabled; for (const id of ['sim-angle', 'center', 'drop']) $(id).disabled = !enabled; }
$('reset').onclick = async () => {
  try { await post('/api/reset', {}); simulationControls(false); history.length = 0; await loadConfig($('host').value); notice('已释放控制器。请在 App 中扫描新二维码重新配对。'); }
  catch (error) { notice(error.message); }
};
$('simulate').onchange = async event => {
  const wanted = event.target.checked;
  try { await post('/api/simulator', { enabled: wanted, angle: Number($('sim-angle').value) }); simulationControls(wanted); notice(wanted ? '当前是电脑模拟：输入通过本机 UDP 回环传输，尚未验证 iPhone 体感或 Wi-Fi 链路。' : ''); }
  catch (error) { simulationControls(!wanted); notice(error.message); }
};
let pendingAngle = null, sending = false;
async function updateAngle(angle) {
  $('sim-angle').value = angle; $('sim-value').textContent = `${angle}°`; pendingAngle = angle;
  if (sending || !sim) return;
  sending = true;
  try { while (pendingAngle !== null && sim) { const value = pendingAngle; pendingAngle = null; await post('/api/simulator', { angle: value }); } }
  catch (error) { notice(error.message); }
  finally { sending = false; }
}
$('sim-angle').oninput = event => updateAngle(Number(event.target.value));
$('center').onclick = () => updateAngle(0);
$('drop').onclick = async () => {
  try { await post('/api/simulator', { drop: true }); simulationControls(false); notice('模拟发包已停止：观察方向盘是否在 250 ms 后归零并显示超时。恢复前请先释放控制器。'); }
  catch (error) { notice(error.message); }
};
function connect() {
  socket = new WebSocket(`ws://${location.host}/live`);
  socket.onopen = () => { $('bridge').textContent = '本地服务在线'; $('bridge').className = 'pill online'; };
  socket.onmessage = event => { status = JSON.parse(event.data); lastMessage = performance.now(); renderStatus(); };
  socket.onclose = () => { $('bridge').textContent = '本地服务离线'; $('bridge').className = 'pill'; status = null; renderStatus(); setTimeout(connect, 1500); };
  socket.onerror = () => socket.close();
}
const metric = (id, value, unit) => { $(id).replaceChildren(document.createTextNode(value), Object.assign(document.createElement('small'), { textContent: unit })); };
function renderStatus() {
  const s = status;
  if (s && sim !== s.simulatorRunning) simulationControls(s.simulatorRunning);
  const live = s?.armed;
  const simulated = s?.source === 'simulator';
  $('source').textContent = simulated ? '电脑模拟 · 非手机' : s?.connected ? 'iPhone · UDP 已连接' : '未连接手机';
  $('source').className = `pill ${simulated ? 'simulated' : s?.connected ? 'online' : 'muted'}`;
  $('reason').textContent = s?.reason ?? '电脑页面与本地服务断开，输出已归零';
  $('status-dot').className = `status-dot ${live ? simulated ? 'sim' : 'live' : ''}`;
  const steer = live ? s.steer : 0;
  $('steer-value').textContent = `STEER ${steer.toFixed(3)}`;
  $('steer-marker').style.left = `${50 + steer * 50}%`;
  const angle = live ? s.angle : 0;
  $('angle').innerHTML = `${angle.toFixed(1)}<span>°</span>`;
  $('direction').textContent = live ? Math.abs(steer) < 0.001 ? '中位 · 死区内' : steer < 0 ? '向左转动' : '向右转动' : '中位 · 等待体感输入';
  metric('sensor-hz', s?.connected && s.sampleAgeMs < 250 ? Math.round(s.sensorHz) : '—', 'Hz');
  metric('receive-hz', s?.receiveHz ?? 0, 'Hz');
  metric('gap', (s?.gapPercent ?? 0).toFixed(1), '%');
  metric('rtt', s?.connected && s.rttMs >= 0 ? s.rttMs.toFixed(1) : '—', 'ms');
  $('packet-stats').textContent = `有效包 ${s?.stats.accepted ?? 0} · 旧包 ${s?.stats.old ?? 0} · 拒绝 ${s?.stats.rejected ?? 0}`;
}
const ns = 'http://www.w3.org/2000/svg';
for (let angle = -65; angle <= 65; angle += 5) {
  const rad = (angle - 90) * Math.PI / 180;
  const line = document.createElementNS(ns, 'line');
  for (const [key, value] of Object.entries({ x1: 260 + 180 * Math.cos(rad), y1: 213 + 180 * Math.sin(rad), x2: 260 + (angle % 15 ? 185 : 190) * Math.cos(rad), y2: 213 + (angle % 15 ? 185 : 190) * Math.sin(rad), stroke: angle === 0 ? '#d2f866' : '#52616a', 'stroke-width': 1 })) line.setAttribute(key, value);
  $('ticks').append(line);
}
const canvas = $('trace'), ctx = canvas.getContext('2d');
let lastFrame = performance.now();
function animate(t) {
  if (lastMessage && t - lastMessage > 500 && status) { status = null; renderStatus(); }
  const target = status?.armed ? status.angle : 0;
  currentAngle += (target - currentAngle) * (1 - Math.exp(-(t - lastFrame) / 35));
  lastFrame = t;
  $('wheel').setAttribute('transform', `rotate(${currentAngle} 260 213)`);
  if (t - lastHistory > 33) {
    history.push({ t, value: status?.armed ? status.steer : 0 }); lastHistory = t;
    while (history.length && history[0].t < t - 8000) history.shift();
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2);
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#29363f'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i <= 8; i++) { const x = i * rect.width / 8; ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); }
    for (const y of [7, rect.height / 2, rect.height - 7]) { ctx.moveTo(0, y); ctx.lineTo(rect.width, y); } ctx.stroke();
    ctx.strokeStyle = status?.source === 'simulator' ? '#ffb174' : '#d2f866'; ctx.lineWidth = 1.6; ctx.beginPath();
    history.forEach((point, i) => { const x = (point.t - t + 8000) / 8000 * rect.width, y = rect.height / 2 - point.value * (rect.height / 2 - 7); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  }
  requestAnimationFrame(animate);
}
loadConfig().catch(error => notice(`无法获取配对信息：${error.message}`)); connect(); requestAnimationFrame(animate);
