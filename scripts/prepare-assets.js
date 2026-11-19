import {createHash} from 'node:crypto';
import {readFile,mkdir,mkdtemp,link,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await readFile(join(root,'assets/source-manifest.json'),'utf8'));
const asset=manifest.assets.find(item=>item.file==='runtime/ferrari.glb');
const target=join(root,'assets/runtime/ferrari.glb');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=promisify(execFile);

async function prepare(){
  if(!asset?.sha256||!asset.bytes||new URL(asset.source).protocol!=='https:')throw new Error('车模资源清单不完整。');
  let existing;
  try{existing=await readFile(target);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(existing){
    if(existing.length!==asset.bytes||digest(existing)!==asset.sha256)throw new Error('本地车模与资源清单不符，未覆盖现有文件。请先核对模型。');
    console.log('本地车模已就绪，校验通过。');return;
  }
  if(process.argv.includes('--check'))throw new Error('缺少本地车模。请先阅读 assets/ATTRIBUTIONS.md，再运行 npm run assets:prepare。');
  console.log('从 Three.js 上游准备本地开发车模；原始再分发许可尚待核实，资源不会加入 Git。');
  await mkdir(dirname(target),{recursive:true});
  const temporary=await mkdtemp(join(dirname(target),'.download-'));
  try{
    const file=join(temporary,'ferrari.glb');
    // curl is included with macOS and honors the user's configured HTTPS proxy.
    // Force HTTP/1.1 + IPv4 for networks where the native Node fetch stalls.
    try{
      await run('curl',['-4','--http1.1','--location','--fail','--silent','--show-error',
        '--connect-timeout','10','--max-time','120','--retry','1','--max-filesize',String(asset.bytes),
        '--output',file,'--',asset.source],{maxBuffer:1024*1024});
    }catch(error){
      if(error.code==='ENOENT')throw new Error('资源准备需要 curl（macOS 自带）。请先安装 curl。');
      throw new Error(`车模下载失败：${error.stderr?.trim()||error.message}`);
    }
    const bytes=await readFile(file);
    if(bytes.length!==asset.bytes||digest(bytes)!==asset.sha256)throw new Error('上游车模校验失败，未写入运行目录。');
    // Publish a fully verified file without replacing a concurrently created model.
    await link(file,target);
  }finally{await rm(temporary,{recursive:true,force:true});}
  console.log('车模下载完成，SHA-256 校验通过。');
}

prepare().catch(error=>{console.error(error.message);process.exitCode=1;});
