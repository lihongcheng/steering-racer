import { test } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { WebSocket } from 'ws';
import { startServer } from '../server/index.js';
import { decode, encode, now, TYPES } from '../server/protocol.js';

function nextUDP(socket, auth, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', handler); reject(new Error(`UDP type ${type} timed out`)); }, 2000);
    const handler = bytes => { const packet = decode(bytes, auth); if (packet?.type === type) { clearTimeout(timer); socket.off('message', handler); resolve(packet); } };
    socket.on('message', handler);
  });
}
function nextWS(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', handler); reject(new Error('WebSocket state timed out')); }, 2000);
    const handler = bytes => { const data = JSON.parse(bytes); if (predicate(data)) { clearTimeout(timer); socket.off('message', handler); resolve(data); } };
    socket.on('message', handler);
  });
}

test('real UDP handshake → input → WebSocket output → watchdog → re-arm', async t => {
  const app = await startServer({ httpPort: 0, udpPort: 0 });
  const client = dgram.createSocket('udp4');
  const base = `http://127.0.0.1:${app.httpPort}`;
  const ws = new WebSocket(`ws://127.0.0.1:${app.httpPort}/live`, { origin: base });
  t.after(async () => { ws.terminate(); client.close(); await app.close(); });
  await new Promise(resolve => client.bind(0, '127.0.0.1', resolve));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const config = await (await fetch(`${base}/api/config`)).json();
  const url = new URL(config.pairingURL);
  const auth = { session: Buffer.from(url.searchParams.get('session'), 'hex'), key: Buffer.from(url.searchParams.get('key'), 'hex') };
  const send = packet => client.send(encode({ time: now(), ...packet }, auth), app.udpPort, '127.0.0.1');
  const welcome = nextUDP(client, auth, TYPES.WELCOME); send({ type: TYPES.HELLO, seq: 1 }); await welcome;
  send({ type: TYPES.INPUT, flags: 7, seq: 1, sampleSeq: 1, values: [-0.5, -18.5, 1, 0, 100, 2] });
  // UDP has no ordering guarantee; wait for the receiver before issuing an arm request.
  await nextWS(ws, state => state.calibrated);
  const ack = nextUDP(client, auth, TYPES.ACK); send({ type: TYPES.COMMAND, seq: 2, values: [1] });
  assert.equal((await ack).values[0], 1);
  const live = await nextWS(ws, state => state.armed);
  assert.equal(live.steer, -0.5); assert.equal(live.throttle, 1);
  const pingTime = now(); const pong = nextUDP(client, auth, TYPES.PONG);
  send({ type: TYPES.PING, seq: 3, time: pingTime }); assert.equal((await pong).time, pingTime);
  const paused = await nextWS(ws, state => !state.armed && state.reason.includes('超时'));
  assert.equal(paused.steer, 0); assert.equal(paused.throttle, 0);
  send({ type: TYPES.INPUT, flags: 7, seq: 2, sampleSeq: 2, values: [1, 35, 0, 0, 100, 2] });
  const newSample = await nextWS(ws, state => state.rawAngle === 35);
  assert.equal(newSample.armed, false);
});

test('local simulator is explicitly labelled, uses UDP, and can simulate packet silence', async t => {
  const app = await startServer({ httpPort: 0, udpPort: 0 }); t.after(() => app.close());
  const base = `http://127.0.0.1:${app.httpPort}`;
  const post = data => fetch(`${base}/api/simulator`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await post({ enabled: true, angle: 35 })).status, 200);
  await new Promise(resolve => setTimeout(resolve, 220));
  let state = app.receiver.snapshot(); assert.equal(state.source, 'simulator'); assert.equal(state.armed, true); assert.equal(state.steer, 1);
  await post({ drop: true }); await new Promise(resolve => setTimeout(resolve, 300));
  state = app.receiver.snapshot(); assert.equal(state.armed, false); assert.equal(state.steer, 0); assert.match(state.reason, /超时/);
});

test('HTTP rejects cross-origin mutations and does not publish pairing secrets in status', async t => {
  const app = await startServer({ httpPort: 0, udpPort: 0 }); t.after(() => app.close());
  const base = `http://127.0.0.1:${app.httpPort}`;
  const response = await fetch(`${base}/api/reset`, { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 403);
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal('key' in status, false); assert.equal('auth' in status, false);
  assert.equal((await fetch(`${base}/server/index.js`)).status, 404);
});

test('real UDP game command reaches exclusive browser and ACK returns after execution', async t => {
  const app = await startServer({httpPort:0,udpPort:0});
  const base=`http://127.0.0.1:${app.httpPort}`, client=dgram.createSocket('udp4');
  const ws=new WebSocket(`ws://127.0.0.1:${app.httpPort}/game-live`,{origin:base});
  t.after(async()=>{ws.terminate();client.close();await app.close();});
  const ownership=nextWS(ws,m=>m.type==='game-owner');
  await new Promise(r=>client.bind(0,'127.0.0.1',r));
  const owner=await ownership;
  ws.send(JSON.stringify({type:'game-state',epoch:owner.epoch,state:{phase:1,lap:1,speed:0,total:0,best:0,lastLap:0,laps:[],hint:0,distance:0,targetSpeed:0,delta:0,sensitivity:1.65,preset:2,hits:0}}));
  const config=await(await fetch(`${base}/api/config`)).json(),url=new URL(config.pairingURL);
  const auth={session:Buffer.from(url.searchParams.get('session'),'hex'),key:Buffer.from(url.searchParams.get('key'),'hex')};
  const send=p=>client.send(encode({time:now(),...p},auth),app.udpPort,'127.0.0.1');
  const welcome=nextUDP(client,auth,TYPES.WELCOME);send({type:TYPES.HELLO,seq:1,sampleSeq:42});await welcome;
  send({type:TYPES.INPUT,flags:7,seq:1,sampleSeq:1});await nextWS(ws,m=>m.calibrated);
  const ack=nextUDP(client,auth,TYPES.ACK);send({type:TYPES.COMMAND,seq:2,values:[1]});await ack;
  const command=nextWS(ws,m=>m.type==='game-command');send({type:TYPES.GAME_COMMAND,seq:3,sampleSeq:42,values:[1]});
  const c=await command;assert.equal(c.action,1);assert.equal(c.clientId,42);
  const result=nextUDP(client,auth,TYPES.GAME_ACK);
  ws.send(JSON.stringify({type:'game-result',epoch:owner.epoch,id:c.id,clientId:42,result:1}));
  assert.equal((await result).values[0],1);
  const duplicate=nextUDP(client,auth,TYPES.GAME_ACK);send({type:TYPES.GAME_COMMAND,seq:3,sampleSeq:42,values:[1]});assert.equal((await duplicate).values[0],1);
});
