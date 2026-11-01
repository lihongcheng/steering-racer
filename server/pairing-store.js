import {mkdir,readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {dirname} from 'node:path';
import {credentials} from './protocol.js';

export async function savePairing(path,auth){
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const temp=path+'.tmp';
  await writeFile(temp,JSON.stringify({version:1,session:auth.session.toString('hex'),key:auth.key.toString('hex')}),{mode:0o600});
  await chmod(temp,0o600);await rename(temp,path);
}
export async function loadPairing(path){
  if(!path)return credentials();
  try{
    const saved=JSON.parse(await readFile(path,'utf8'));
    if(saved.version!==1||!/^[a-f0-9]{32}$/.test(saved.session)||!/^[a-f0-9]{64}$/.test(saved.key))throw new Error('Invalid pairing data');
    await chmod(path,0o600);return {session:Buffer.from(saved.session,'hex'),key:Buffer.from(saved.key,'hex')};
  }catch(error){if(error.code!=='ENOENT')throw new Error('配对文件无法读取，请保留文件后排查：'+error.message);}
  const auth=credentials();await savePairing(path,auth);return auth;
}
