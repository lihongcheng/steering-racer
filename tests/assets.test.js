import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {startServer} from '../server/index.js';
import {fetchAsset} from '../src/game/assets/fetch-asset.js';

test('packaged car has complete GLB data, independent wheels, and native interior nodes',async()=>{
  const bytes=await readFile(new URL('../assets/runtime/ferrari.glb',import.meta.url));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length)),names=new Set(json.nodes.map(n=>n.name));
  for(const name of ['body','glass','wheel_fl','wheel_fr','wheel_rl','wheel_rr','steering_wheel','interior_dark','leather'])assert.ok(names.has(name),name);
  assert.ok(json.buffers.every(buffer=>!buffer.uri));
  const binaryStart=20+length;assert.equal(bytes.readUInt32LE(binaryStart+4),0x004e4942);
  assert.equal(binaryStart+8+bytes.readUInt32LE(binaryStart),bytes.length);
});

test('all declared runtime asset URLs resolve to nonempty local files',async()=>{
  const source=await readFile(new URL('../src/game/assets/manifest.js',import.meta.url),'utf8');
  const files=[...source.matchAll(/runtime\/([^'?#]+)\?url/g)].map(match=>match[1]);assert.ok(files.length>=16);
  for(const file of files){const bytes=await readFile(new URL('../assets/runtime/'+file,import.meta.url));assert.ok(bytes.length>1000,file);}
});

test('production resources use correct MIME, local decoder CSP, and bounded asset routes',async t=>{
  const dir=new URL('../public/game/assets/',import.meta.url);
  let files;try{files=await readdir(dir);}catch{t.skip('Run npm run build before the production asset integration test');return;}
  const app=await startServer({httpPort:0,udpPort:0});t.after(()=>app.close());const base=`http://127.0.0.1:${app.httpPort}`;
  for(const [extension,mime] of [['.glb','model/gltf-binary'],['.webp','image/webp'],['.wasm','application/wasm']]){
    const name=files.find(file=>file.endsWith(extension));assert.ok(name,extension);
    const response=await fetch(`${base}/game/assets/${name}`);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),mime);
    assert.match(response.headers.get('cache-control'),/immutable/);await response.arrayBuffer();
  }
  const page=await fetch(base+'/game/');assert.match(page.headers.get('content-security-policy'),/worker-src 'self' blob:/);assert.match(page.headers.get('content-security-policy'),/'wasm-unsafe-eval'/);
  assert.ok(!page.headers.get('content-security-policy').includes("'unsafe-eval'"));
  for(const path of ['/game/assets/missing.glb','/game/assets/%2e%2e%2fserver%2findex.js','/game/assets/nested/file.glb'])assert.equal((await fetch(base+path)).status,404);
});

test('asset requests retry transient failures and stop immediately on cancellation',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;if(calls===1)throw new Error('transient');return new Response(new Uint8Array([1,2,3]));});
  assert.deepEqual([...new Uint8Array(await fetchAsset('/asset'))],[1,2,3]);assert.equal(calls,2);
  const controller=new AbortController();controller.abort(new Error('cancelled'));
  t.mock.method(globalThis,'fetch',async(_url,{signal})=>{calls++;throw signal.reason;});calls=0;
  await assert.rejects(fetchAsset('/asset',{signal:controller.signal}),/cancelled/);assert.equal(calls,1);
});
