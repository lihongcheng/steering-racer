import http from 'node:http';
import dgram from 'node:dgram';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { Receiver } from './receiver.js';
import { Simulator } from './simulator.js';
import { GameBridge } from './game-bridge.js';
import {loadPairing,savePairing} from './pairing-store.js';

export async function startServer({ httpPort = 8850, udpPort = 41235, pairingPath = null } = {}) {
  const udp = dgram.createSocket('udp4');
  const receiver = new Receiver({ send: (bytes, peer) => udp.send(bytes, peer.port, peer.address, () => {}) });
  receiver.auth = await loadPairing(pairingPath);
  const game = new GameBridge(receiver);
  let simulator = null;
  const publicState = () => ({ ...receiver.snapshot(), simulatorRunning: Boolean(simulator?.running) });
  udp.on('message', (bytes, peer) => receiver.handle(bytes, peer,
    simulator?.running && peer.address === '127.0.0.1' && peer.port === simulator.socket.address().port ? 'simulator' : 'iphone'));
  udp.on('error', error => { receiver.stop('UDP 服务异常'); console.error('UDP:', error.message); });
  await new Promise((resolve, reject) => { udp.once('error', reject); udp.bind(udpPort, '0.0.0.0', resolve); });
  const actualUdpPort = udp.address().port;
  const interfaces = () => Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
    list.filter(i => i.family === 'IPv4' && !i.internal).map(i => ({ name, address: i.address })))
    .sort((a, b) => (a.name === 'en0' ? -1 : 0) - (b.name === 'en0' ? -1 : 0));
  const publicFiles = new Map([['/controller', ['control/index.html', 'text/html']], ['/control/app.js', ['control/app.js', 'text/javascript']], ['/control/style.css', ['control/style.css', 'text/css']]]);
  let actualHttpPort;
  const allowedHosts = () => [`127.0.0.1:${actualHttpPort}`, `localhost:${actualHttpPort}`];
  const allowedOrigins = () => allowedHosts().map(host => `http://${host}`);
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  const stopSimulator = () => { if (simulator) { simulator.stop(); simulator = null; receiver.reset(); } };

  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; frame-ancestors 'none'");
    if (!allowedHosts().includes(req.headers.host)) return json(res, 403, { error: '仅允许本机访问' });
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (req.method === 'GET' && ['/', '/game'].includes(url.pathname)) { res.writeHead(302, { Location: '/game/' }); return res.end(); }
      if (req.method === 'GET' && (url.pathname === '/game/' || /^\/game\/assets\/[a-zA-Z0-9._-]+$/.test(url.pathname))) {
        const asset = url.pathname === '/game/' ? 'index.html' : url.pathname.slice(6);
        const type = asset.endsWith('.html') ? 'text/html' : asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : asset.endsWith('.map') ? 'application/json' : 'application/octet-stream';
        try { const bytes = await readFile(new URL('../public/game/' + asset, import.meta.url)); res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' }); return res.end(bytes); }
        catch { return json(res, 404, { error: '游戏资源未生成，请先运行 npm run build' }); }
      }
      if (req.method === 'GET' && url.pathname === '/api/config') {
        const hosts = interfaces();
        const requested = url.searchParams.get('host');
        const host = hosts.some(i => i.address === requested) ? requested : hosts[0]?.address ?? '127.0.0.1';
        const pairingURL = `steeringlab://pair?host=${host}&port=${actualUdpPort}&session=${receiver.auth.session.toString('hex')}&key=${receiver.auth.key.toString('hex')}`;
        const qr = await QRCode.toDataURL(pairingURL, { width: 260, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#101c1c', light: '#ffffff' } });
        return json(res, 200, { hosts, host, udpPort: actualUdpPort, pairingURL, qr, hasLAN: hosts.length > 0 });
      }
      if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, publicState());
      if (req.method === 'GET' && url.pathname === '/api/game-status') return json(res,200,game.snapshot());
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        if (!allowedOrigins().includes(req.headers.origin) || req.headers['content-type'] !== 'application/json') return json(res, 403, { error: '无效本机请求来源' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 2048) return json(res, 413, { error: '请求过大' }); }
        let data; try { data = JSON.parse(body || '{}'); } catch { return json(res, 400, { error: '无效 JSON' }); }
        if (url.pathname === '/api/reset') { stopSimulator(); receiver.rotate(); if(pairingPath)await savePairing(pairingPath,receiver.auth); return json(res, 200, { ok: true }); }
        if (url.pathname === '/api/simulator') {
          if (data.drop === true && simulator) {
            simulator.stop(); simulator = null;
            return json(res, 200, { ok: true, simulated: false });
          }
          if (data.enabled === true && !simulator) {
            if (receiver.peer) return json(res, 409, { error: '请先释放已配对控制器，再启动模拟' });
            simulator = new Simulator(receiver.auth, actualUdpPort);
            await simulator.start();
          } else if (data.enabled === false) stopSimulator();
          if (simulator) {
            if (typeof data.angle === 'number' && Number.isFinite(data.angle)) simulator.angle = Math.max(-35, Math.min(35, data.angle));
            if (typeof data.throttle === 'number') simulator.throttle = Math.max(0, Math.min(1, data.throttle));
            if (typeof data.brake === 'number') simulator.brake = Math.max(0, Math.min(1, data.brake));
          }
          return json(res, 200, { ok: true, simulated: Boolean(simulator) });
        }
        return json(res, 404, { error: '接口不存在' });
      }
      if (req.method === 'GET' && publicFiles.has(url.pathname)) {
        const [name, type] = publicFiles.get(url.pathname);
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        return res.end(await readFile(new URL(`../public/${name}`, import.meta.url)));
      }
      json(res, 404, { error: '页面不存在' });
    } catch (error) { console.error(error.message); if (!res.headersSent) json(res, 500, { error: '本地服务出错' }); else res.end(); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  wss.on('connection',(ws)=>{
    if(!ws.isGame)return;
    game.attach(ws);
    ws.on('message',bytes=>{try{const message=JSON.parse(bytes);if(message.type==='claim-owner'){game.claim(ws);return;}game.message(ws,message);}catch{}});
    ws.on('close',()=>game.detach(ws));
  });
  server.on('upgrade', (req, socket, head) => {
    if (!['/live','/game-live'].includes(req.url) || !allowedHosts().includes(req.headers.host) || !allowedOrigins().includes(req.headers.origin)) return socket.destroy();
    wss.handleUpgrade(req, socket, head, ws => {ws.isGame=req.url==='/game-live';wss.emit('connection', ws);});
  });
  const broadcast = setInterval(() => {
    const data = JSON.stringify(publicState());
    for (const ws of wss.clients) if (ws.readyState === 1 && ws.bufferedAmount < 8192) ws.send(data);
  }, 1000 / 30);
  const watchdog = setInterval(() => receiver.tick(), 20);
  const status = setInterval(() => receiver.statusPacket(), 500);
  const gameStatus = setInterval(() => game.tick(), 100);
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(httpPort, '127.0.0.1', resolve); });
  } catch (error) { clearInterval(broadcast); clearInterval(watchdog); clearInterval(status); clearInterval(gameStatus); udp.close(); throw error; }
  actualHttpPort = server.address().port;
  return { receiver, game, httpPort: actualHttpPort, udpPort: actualUdpPort,
    async close() {
      stopSimulator(); clearInterval(broadcast); clearInterval(watchdog); clearInterval(status); clearInterval(gameStatus);
      for (const ws of wss.clients) ws.terminate();
      wss.close(); udp.close();
      await new Promise(resolve => server.close(resolve));
    }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const app = await startServer({ httpPort: Number(process.env.STEERING_HTTP_PORT ?? 8850), udpPort: Number(process.env.STEERING_UDP_PORT ?? 41235), pairingPath: fileURLToPath(new URL("../.local/pairing.json",import.meta.url)) });
    console.log(`Steering Racer 已启动\n游戏页面：http://127.0.0.1:${app.httpPort}/game/\n控制台：http://127.0.0.1:${app.httpPort}/controller\nUDP 端口：${app.udpPort}\n请用 iPhone App 扫描页面二维码；手机无需访问这个本机网址。`);
    const shutdown = async () => { await app.close(); process.exit(0); };
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  } catch (error) { console.error(`启动失败：${error.message}`); process.exitCode = 1; }
}
