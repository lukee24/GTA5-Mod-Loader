import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const maximumBytes=8*1024**2;
const fingerprint=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.nlink].join(':');
const identity=stat=>[stat.dev,stat.ino].join(':');
function parentIdentity(directory){
 const absolute=path.resolve(directory),volume=path.parse(absolute).root;
 let cursor=volume;const parents=[volume];
 for(const segment of absolute.slice(volume.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,segment);parents.push(cursor);}
 return parents.map(parent=>{
  const stat=fs.lstatSync(parent,{bigint:true});
  if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('发行证据目录包含链接、连接或非目录，已停止写入。');
  return identity(stat);
 }).join('/');
}
function snapshot(file,parent){
 if(parentIdentity(path.dirname(file))!==parent)throw new Error('发行证据目录发生变化，已停止写入。');
 let before;
 try{before=fs.lstatSync(file,{bigint:true});}catch(error){if(error.code==='ENOENT')return null;throw error;}
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n)throw new Error('发行证据必须是独立普通文件，不能覆盖链接、连接或目录。');
 if(before.size>BigInt(maximumBytes))throw new Error('发行证据超过8MiB，原文件保留，已停止写入。');
 const fd=fs.openSync(file,'r');
 try{
  const check=()=>{
   if(parentIdentity(path.dirname(file))!==parent||fingerprint(fs.fstatSync(fd,{bigint:true}))!==fingerprint(before)||fingerprint(fs.lstatSync(file,{bigint:true}))!==fingerprint(before))throw new Error('发行证据读取时发生变化，已停止写入。');
  };
  check();
  const buffer=Buffer.alloc(64*1024);
  const digest=()=>{
   let offset=0;const hash=crypto.createHash('sha256');
   while(offset<Number(before.size)){
    const count=fs.readSync(fd,buffer,0,Math.min(buffer.length,Number(before.size)-offset),offset);
    if(!count)throw new Error('发行证据读取不完整，已停止写入。');
    hash.update(buffer.subarray(0,count));offset+=count;
   }
   return hash.digest('hex');
  };
  const sha256=digest();check();const confirmed=digest();check();
  if(confirmed!==sha256)throw new Error('发行证据内容读取时发生变化，已停止写入。');
  return {fingerprint:fingerprint(before),sha256};
 }finally{fs.closeSync(fd);}
}
function unchanged(file,parent,expected){
 if(JSON.stringify(snapshot(file,parent))!==JSON.stringify(expected))throw new Error('发行证据在写入前被其他操作改变，原文件保留，请重新核对。');
}

/** Prepare both outputs before replacing either. Each rename is atomic; the pair is not. */
export function writeReleaseOutputs(directory,manifestText,sumsText){
 const payloads=[manifestText,sumsText].map(value=>{
  if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>maximumBytes)throw new Error('发行证据输出必须是最多8MiB的文本。');
  return Buffer.from(value,'utf8');
 });
 if(typeof directory!=='string'||!path.isAbsolute(directory))throw new Error('发行证据需要明确的绝对目录。');
 const parent=parentIdentity(directory),files=['manifest.json','SHA256SUMS.txt'].map(name=>path.join(directory,name));
 // 整批预检：第二个非法目标也不得在第一个目标已写后才发现。
 const expected=files.map(file=>snapshot(file,parent)),staged=[],published=[];
 try{
  for(let index=0;index<files.length;index++){
   if(parentIdentity(directory)!==parent)throw new Error('发行证据目录发生变化，已停止写入。');
   const temporary=path.join(directory,'.gems-release-'+crypto.randomUUID()+'.tmp');
   const fd=fs.openSync(temporary,'wx');let owned;
   try{owned=identity(fs.fstatSync(fd,{bigint:true}));staged.push({temporary,owned});fs.writeFileSync(fd,payloads[index]);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   const current=fs.lstatSync(temporary,{bigint:true});
   if(identity(current)!==owned||current.size!==BigInt(payloads[index].length))throw new Error('发行证据暂存文件发生变化或写入不完整。');
   const saved=snapshot(temporary,parent),sha256=crypto.createHash('sha256').update(payloads[index]).digest('hex');
   if(!saved||saved.sha256!==sha256)throw new Error('发行证据暂存内容校验失败。');
   staged[index].snapshot=saved;
  }
  files.forEach((file,index)=>unchanged(file,parent,expected[index]));
  for(let index=0;index<files.length;index++){
   // 观察到的其他输出/目录变化会阻止继续写；不是原生文件锁。
   files.forEach((file,other)=>unchanged(file,parent,expected[other]));
   unchanged(staged[index].temporary,parent,staged[index].snapshot);
   fs.renameSync(staged[index].temporary,files[index]);published.push(path.basename(files[index]));
   expected[index]=snapshot(files[index],parent);
  }
  return {published};
 }catch(error){
  const message=published.length?'发行证据只完成部分提交；两个文件尚未成对，请保留现状并重新核对。':'发行证据未提交，原有输出保留，请检查路径、容量和写入权限。';
  throw Object.assign(new Error(message,{cause:error}),{published:[...published]});
 }finally{
  // 只清理本次拥有、仍在同一普通目录的临时文件；替换/外移的文件保留。
  for(const {temporary,owned} of staged){
   try{
    if(parentIdentity(directory)!==parent)continue;
    const stat=fs.lstatSync(temporary,{bigint:true});
    if(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1n&&identity(stat)===owned)fs.unlinkSync(temporary);
   }catch{/* 清理失败不覆盖原始错误，也不删除其他操作的文件。 */}
  }
 }
}
