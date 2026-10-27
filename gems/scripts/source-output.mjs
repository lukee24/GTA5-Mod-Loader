import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const maximumBytes=200*1024**2;
const identity=stat=>[stat.dev,stat.ino].join(':');
const stamp=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.nlink].join(':');
function parentIdentity(directory){
 const absolute=path.resolve(directory),volume=path.parse(absolute).root,parents=[volume];let cursor=volume;
 for(const segment of absolute.slice(volume.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,segment);parents.push(cursor);}
 return parents.map(file=>{const stat=fs.lstatSync(file,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('源码归档目录包含链接、连接或非目录，已停止写入');return identity(stat);}).join('/');
}
function snapshot(file,parent){
 if(parentIdentity(path.dirname(file))!==parent)throw new Error('源码归档目录身份发生变化');
 let stat;try{stat=fs.lstatSync(file,{bigint:true});}catch(error){if(error.code==='ENOENT')return null;throw error;}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||stat.size<0n||stat.size>BigInt(maximumBytes))throw new Error('源码归档必须是200MiB以内的独立普通文件，不能覆盖链接或目录');
 const fd=fs.openSync(file,'r');
 try{
  const check=()=>{if(parentIdentity(path.dirname(file))!==parent||stamp(fs.fstatSync(fd,{bigint:true}))!==stamp(stat)||stamp(fs.lstatSync(file,{bigint:true}))!==stamp(stat))throw new Error('源码归档读取期间发生变化');};
  check();const buffer=Buffer.alloc(64*1024);
  const digest=()=>{const hash=crypto.createHash('sha256');let bytes=0;while(bytes<Number(stat.size)){const count=fs.readSync(fd,buffer,0,Math.min(buffer.length,Number(stat.size)-bytes),bytes);if(!Number.isSafeInteger(count)||count<=0||count>Math.min(buffer.length,Number(stat.size)-bytes))throw new Error('源码归档读取不完整');hash.update(buffer.subarray(0,count));bytes+=count;}return hash.digest('hex');};
  const sha256=digest();check();const confirmed=digest();check();if(confirmed!==sha256)throw new Error('源码归档内容发生变化');return{identity:identity(stat),stamp:stamp(stat),bytes:Number(stat.size),sha256};
 }finally{fs.closeSync(fd);}
}
function seal(file,parent,expected){
 if(parentIdentity(path.dirname(file))!==parent)throw new Error('源码归档目录身份发生变化');
 let current=null;try{const stat=fs.lstatSync(file,{bigint:true});if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n)throw new Error('源码归档目标身份发生变化');current=stamp(stat);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(current!==(expected?.stamp??null))throw new Error('源码归档提交点目标发生变化，原文件保留');
}
function unchanged(file,parent,expected){if(JSON.stringify(snapshot(file,parent))!==JSON.stringify(expected))throw new Error('源码归档目标或暂存发生变化，原文件保留');}

/** Stream to an owned file before replacing an unchanged ordinary output. No pair/OS-lock claim. */
export async function publishSourceArchive(output,readable){
 let temporary,owned,parent,published=false;
 try{
  if(typeof output!=='string'||!path.isAbsolute(output))throw new Error('源码归档需要明确的绝对路径');
  parent=parentIdentity(path.dirname(output));const expected=snapshot(output,parent);
  temporary=path.join(path.dirname(output),'.gems-source-'+crypto.randomUUID()+'.tmp');
  const sink=fs.createWriteStream(temporary,{flags:'wx'});
  sink.once('open',fd=>{try{const stat=fs.fstatSync(fd,{bigint:true});if(!stat.isFile()||stat.nlink!==1n||parentIdentity(path.dirname(output))!==parent)throw new Error('源码归档暂存身份无法确认');owned=identity(stat);}catch(error){sink.destroy(error);}});
  const hash=crypto.createHash('sha256');let bytes=0;
  const meter=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;if(bytes>maximumBytes){callback(new Error('源码归档输出超过200MiB，已停止写入'));return;}hash.update(chunk);callback(null,chunk);}});
  await pipeline(readable,meter,sink);
  const saved=snapshot(temporary,parent),expectedHash=hash.digest('hex');
  if(!saved||saved.identity!==owned||saved.bytes!==bytes||saved.sha256!==expectedHash)throw new Error('源码归档暂存内容校验失败');
  const fd=fs.openSync(temporary,'r+');try{if(identity(fs.fstatSync(fd,{bigint:true}))!==owned)throw new Error('源码归档刷新前身份发生变化');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  unchanged(temporary,parent,saved);unchanged(output,parent,expected);
  // All asynchronous stream work is complete; synchronously recheck seals before rename.
  seal(temporary,parent,saved);seal(output,parent,expected);
  fs.renameSync(temporary,output);published=true;
  const actual=snapshot(output,parent);if(!actual||actual.identity!==owned||actual.bytes!==bytes||actual.sha256!==expectedHash)throw new Error('源码归档提交后校验失败，保留现状待核对');
  seal(output,parent,actual);return{bytes,sha256:actual.sha256};
 }catch(error){readable?.destroy?.();throw Object.assign(new Error(published?'源码归档已提交但核验失败，保留现状待核对':'源码归档未提交，原有文件保留',{cause:error}),{published});}
 finally{
  if(temporary&&owned)try{if(parentIdentity(path.dirname(output))===parent){const stat=fs.lstatSync(temporary,{bigint:true});if(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1n&&identity(stat)===owned)fs.unlinkSync(temporary);}}catch{/* Unknown replacement or moved staging remains untouched. */}
 }
}
