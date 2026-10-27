import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {noLinks} from '../core/security';import {MAX_DATABASE_BYTES} from './validation';
export function bytesHash(bytes:Uint8Array){return crypto.createHash('sha256').update(bytes).digest('hex');}
export function noDatabaseJournals(root:string){
  for(const suffix of ['-wal','-journal','-shm']){
    const file=path.join(root,'gems.sqlite'+suffix);noLinks(root,file);
    if(fs.existsSync(file))throw new Error('数据库存在未确认的 SQLite 日志文件，已停止读写并保留文件；请关闭其他数据库工具并完成其恢复后重启');
  }
}
export function databaseFileHash(root:string):string|null{
  const file=path.join(root,'gems.sqlite');noLinks(root,file);let fd:number;
  try{fd=fs.openSync(file,'r');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  try{
    const before=fs.fstatSync(fd,{bigint:true}),size=Number(before.size);if(!before.isFile()||before.nlink!==1n)throw new Error('数据库不是独立普通文件，已停止读写');if(size>MAX_DATABASE_BYTES)throw new Error('数据库文件已被更改且超过容量上限，已停止保存');
    const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(64*1024);let length=0;
    while(true){const count=fs.readSync(fd,buffer,0,buffer.length,length);if(!count)break;length+=count;if(length>MAX_DATABASE_BYTES)throw new Error('数据库文件读取时被更改，已停止保存');hash.update(buffer.subarray(0,count));}
    const after=fs.fstatSync(fd,{bigint:true});let current:fs.BigIntStats;
    try{noLinks(root,file);current=fs.lstatSync(file,{bigint:true});}catch(error){throw new Error('数据库路径读取时被更改，已停止保存',{cause:error});}
    if(length!==size||after.dev!==before.dev||after.ino!==before.ino||after.nlink!==1n||current.nlink!==1n||after.size!==before.size||after.mtimeNs!==before.mtimeNs||after.ctimeNs!==before.ctimeNs||current.dev!==after.dev||current.ino!==after.ino||current.size!==after.size||current.mtimeNs!==after.mtimeNs||current.ctimeNs!==after.ctimeNs)throw new Error('数据库文件读取时被更改，已停止保存');
    return hash.digest('hex');
  }finally{fs.closeSync(fd);}
}
