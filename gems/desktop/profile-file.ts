import fs from 'node:fs';
import path from 'node:path';
import {noLinks} from '../packages/core/security';

/** Bounded, stable file read before admitting an external profile document. */
export function readProfileFile(file:string,limit:number):string{
 if(!Number.isSafeInteger(limit)||limit<1||limit>1024*1024)throw new Error('方案读取上限无效');
 noLinks(path.parse(path.resolve(file)).root,file);
 const before=fs.lstatSync(file,{bigint:true});
 if(!before.isFile()||before.size>BigInt(limit))throw new Error('方案必须是普通 JSON 文件，且不超过 '+Math.round(limit/1024)+' KiB');
 const stamp=(s:fs.BigIntStats)=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.nlink].join(':');
 const fd=fs.openSync(file,'r');
 try{
  const check=()=>{noLinks(path.parse(path.resolve(file)).root,file);if(stamp(before)!==stamp(fs.fstatSync(fd,{bigint:true}))||stamp(before)!==stamp(fs.lstatSync(file,{bigint:true})))throw new Error('读取期间方案文件发生变化，请重新选择');};
  check();const bytes=Buffer.alloc(Number(before.size)+1);let offset=0;
  while(offset<bytes.length){const count=fs.readSync(fd,bytes,offset,bytes.length-offset,null);if(!count)break;offset+=count;}
  check();if(offset!==Number(before.size))throw new Error('读取期间方案文件长度发生变化');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,offset));
 }finally{fs.closeSync(fd);}
}
