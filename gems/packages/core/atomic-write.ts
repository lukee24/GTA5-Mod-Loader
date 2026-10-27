import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {captureCommitTarget,assertCommitTarget,type CommitTarget} from './commit-target';
import {directoryIdentity,fileIdentity,fileStamp} from './path-identity';
const maximumBytes=20*1024**3;
function prepareTarget(file:string):CommitTarget{
 const before=captureCommitTarget(file);fs.mkdirSync(path.dirname(file),{recursive:true});const after=captureCommitTarget(file);
 const old=before.directory.split('/'),current=after.directory.split('/');
 if(before.stamp!==after.stamp||old.length!==current.length||old.some((identity,index)=>identity!=='missing'&&identity!==current[index]))throw new Error('文件目标或原目录在准备期间发生变化，未覆盖原文件');
 return after;
}
function temporarySeal(file:string,parent:string,owned:string,bytes:number){
 if(directoryIdentity(path.dirname(file))!==parent)throw new Error('文件暂存目录发生变化，未继续提交');
 const stat=fs.lstatSync(file,{bigint:true});
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||fileIdentity(stat)!==owned||stat.size!==BigInt(bytes))throw new Error('文件暂存身份或大小校验失败');
 return fileStamp(stat);
}
export function verifyOwnedFile(file:string,parent:string,owned:string,bytes:number,hash:string){
 const stamp=temporarySeal(file,parent,owned,bytes),fd=fs.openSync(file,'r');
 try{
  const check=()=>{if(fileStamp(fs.fstatSync(fd,{bigint:true}))!==stamp||temporarySeal(file,parent,owned,bytes)!==stamp)throw new Error('文件暂存读取期间发生变化');};
  const buffer=Buffer.alloc(64*1024);
  const digest=()=>{let offset=0;const actual=crypto.createHash('sha256');while(offset<bytes){const request=Math.min(buffer.length,bytes-offset),count=fs.readSync(fd,buffer,0,request,offset);if(!Number.isSafeInteger(count)||count<=0||count>request)throw new Error('文件暂存读取不完整');actual.update(buffer.subarray(0,count));offset+=count;}return actual.digest('hex');};
  check();if(digest()!==hash)throw new Error('文件暂存内容校验失败');check();if(digest()!==hash)throw new Error('文件暂存内容校验失败');check();
 }finally{fs.closeSync(fd);}
 if(temporarySeal(file,parent,owned,bytes)!==stamp)throw new Error('文件暂存核验结束时发生变化');return stamp;
}
/** Synchronous single-file publication; validates staged bytes and preserves unknown replacements. */
export function atomicWrite(file:string,data:Uint8Array|string,beforeCommit?:()=>void):void{
 if(typeof file!=='string'||!file||/[\x00-\x1f]/u.test(file))throw new Error('文件写入路径无效');file=path.resolve(file);
 if(beforeCommit!==undefined&&typeof beforeCommit!=='function')throw new Error('文件提交检查无效，未开始写入');
 if(typeof data!=='string'&&!(data instanceof Uint8Array))throw new Error('文件写入内容类型无效');
 const payload=typeof data==='string'?Buffer.from(data,'utf8'):data,bytes=payload.byteLength;
 if(!Number.isSafeInteger(bytes)||bytes>maximumBytes)throw new Error('文件写入内容超过20GiB上限');
 const hash=crypto.createHash('sha256').update(payload).digest('hex'),target=prepareTarget(file),parent=target.directory,temporary=file+'.gems-'+crypto.randomUUID();let owned:string|undefined;
 try{
  const fd=fs.openSync(temporary,'wx');
  try{const stat=fs.fstatSync(fd,{bigint:true});if(!stat.isFile()||stat.nlink!==1n)throw new Error('文件暂存身份无法确认');owned=fileIdentity(stat);fs.writeFileSync(fd,payload);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  const stamp=verifyOwnedFile(temporary,parent,owned,bytes,hash);assertCommitTarget(target);const condition:unknown=beforeCommit?.();
  if(condition&&typeof(condition as {then?:unknown}).then==='function'){void Promise.resolve(condition).catch(()=>{});throw new Error('文件提交检查必须同步完成，未覆盖原文件');}
  if(temporarySeal(temporary,parent,owned,bytes)!==stamp)throw new Error('文件暂存在提交检查后发生变化');assertCommitTarget(target);fs.renameSync(temporary,file);
  try{verifyOwnedFile(file,parent,owned,bytes,hash);}catch(error){throw Object.assign(new Error('文件已提交但校验失败，保留现状待核对',{cause:error}),{published:true});}
 }finally{
  if(owned)try{if(directoryIdentity(path.dirname(temporary))===parent){const stat=fs.lstatSync(temporary,{bigint:true});if(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1n&&fileIdentity(stat)===owned)fs.unlinkSync(temporary);}}catch{/* Unknown replacements and moved files remain untouched. */}
 }
}
