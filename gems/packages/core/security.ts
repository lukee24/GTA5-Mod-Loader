import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const MAX_FILES=20000, MAX_BYTES=20*1024**3;
export function sameGamePath(a:string,b:string){return path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();}
export function relativeSafe(value:string):string {
  if(typeof value!=='string'||!value||value.includes('\0')||/^[\\/]|^[a-z]:/i.test(value))throw new Error('非法路径：不允许绝对路径');
  const parts=value.replaceAll('\\','/').split('/');
  if(parts.some(p=>p==='..'||p==='.'||!p||/[<>:"|?*\x00-\x1f]/.test(p)||/[ .]$/.test(p)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)))throw new Error('非法路径：目录穿越、设备名称或非法字符');
  return parts.join('/');
}
export function inside(root:string,relative:string):string {const file=path.resolve(root,relativeSafe(relative));if(!file.toLowerCase().startsWith(path.resolve(root).toLowerCase()+path.sep))throw new Error('目标超出允许目录');return file;}
export function noLinks(root:string,file:string):void {
  const absolute=path.resolve(file),base=path.resolve(root);
  const relative=path.relative(base,absolute);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('文件超出允许目录');
  const parsed=path.parse(absolute);let cursor=parsed.root;
  for(const segment of absolute.slice(parsed.root.length).split(path.sep)){cursor=path.join(cursor,segment);try{if(fs.lstatSync(cursor).isSymbolicLink())throw new Error('拒绝符号链接或目录连接：'+cursor);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
}
const hashStamp=(stat:fs.BigIntStats)=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.nlink].join(':');
function hashState(file:string){
  noLinks(path.parse(path.resolve(file)).root,file);
  const stat=fs.lstatSync(file,{bigint:true});
  if(!stat.isFile())throw new Error('哈希读取需要普通文件');
  if(stat.size<0n||stat.size>BigInt(MAX_BYTES))throw new Error('哈希读取文件超过20GiB上限，已停止核验');
  return stat;
}
export async function inspectFileHash(file:string,options?:{expectedBytes:number}):Promise<Readonly<{hash:string;bytes:number}>>{
  if(options!==undefined&&(!options||Object.keys(options).length!==1||!Number.isSafeInteger(options.expectedBytes)||options.expectedBytes<0||options.expectedBytes>MAX_BYTES))throw new Error('文件大小预期无效，已停止核验');
  // 仅最初缺失可由hashOrNull解释为null；核验开始后的消失是变化。
  const before=hashState(file),changed=(cause?:unknown)=>new Error('哈希读取期间文件或路径发生变化，已停止核验',{cause});
  if(options!==undefined&&before.size!==BigInt(options.expectedBytes))throw new Error('文件大小与扫描报告或安装计划不一致，请重新导入');
  let fd:number|undefined;
  try{
    try{fd=fs.openSync(file,'r');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw changed(error);throw error;}
    const check=()=>{
      try{if(hashStamp(fs.fstatSync(fd!,{bigint:true}))!==hashStamp(before)||hashStamp(hashState(file))!==hashStamp(before))throw changed();}
      catch(error){throw changed(error);}
    };
    check();const hash=crypto.createHash('sha256');let bytes=0;const buffer=Buffer.alloc(64*1024);
    // 固定首读长度、异步分块，持续追加不能无限延长核验；仅此函数拥有fd。
    while(bytes<Number(before.size)){
      const length=Math.min(buffer.length,Number(before.size)-bytes);
      const count=await new Promise<number>((resolve,reject)=>fs.read(fd!,buffer,0,length,bytes,(error,count)=>error?reject(error):resolve(count)));
      if(!Number.isSafeInteger(count)||count<0||count>length)throw new Error('哈希读取返回无效长度，已停止核验');
      if(!count)throw new Error('哈希读取不完整，文件可能发生变化，已停止核验');
      hash.update(buffer.subarray(0,count));bytes+=count;
    }
    if(bytes!==Number(before.size))throw new Error('哈希读取不完整，文件可能发生变化，已停止核验');
    check();return Object.freeze({hash:hash.digest('hex'),bytes});
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}
export async function hashFile(file:string):Promise<string>{return(await inspectFileHash(file)).hash;}
export async function hashOrNull(file:string):Promise<string|null>{try{return await hashFile(file);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
export {atomicWrite} from './atomic-write';
export function executable(file:string){return /\.(asi|dll|exe|cs|lua|ps1|bat|cmd|vbs|js)$/i.test(file);}
