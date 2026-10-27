import fs from 'node:fs';import {noLinks} from '../core/security';
export const DIAGNOSTIC_LOG_BYTES=1024**2;
function fingerprint(stat:fs.BigIntStats){return [stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.nlink].join(':');}
/** Read a bounded tail and one preceding byte to locate an actual line boundary.
 * Observed identity checks are not a native file lock or a cross-log snapshot.
 */
export function diagnosticLogSnapshot(root:string,file:string){
 noLinks(root,file);let fd:number;try{fd=fs.openSync(file,'r');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
 try{
  const before=fs.fstatSync(fd,{bigint:true});if(!before.isFile()||before.nlink!==1n||before.size>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('文件不是独立普通日志，已保留原文件');
  const size=Number(before.size),start=Math.max(0,size-DIAGNOSTIC_LOG_BYTES),readStart=Math.max(0,start-1),bytes=Buffer.alloc(size-readStart);let offset=0;
  while(offset<bytes.length){const count=fs.readSync(fd,bytes,offset,bytes.length-offset,readStart+offset);if(!count)throw new Error('日志读取不完整，请重新诊断');offset+=count;}
  noLinks(root,file);let current:fs.BigIntStats;try{current=fs.lstatSync(file,{bigint:true});}catch(error){throw new Error('日志读取期间路径发生变化，请重新诊断',{cause:error});}
  if(fingerprint(fs.fstatSync(fd,{bigint:true}))!==fingerprint(before)||fingerprint(current)!==fingerprint(before))throw new Error('日志读取期间内容或路径发生变化，请重新诊断');
  const prefix=start-readStart;
  return{buffer:bytes.subarray(prefix),size,start,bytes:bytes.length-prefix,ioBytes:bytes.length,truncated:start>0,startsOnLine:start===0||bytes[prefix-1]===10,checked:new Date().toISOString()};
 }finally{fs.closeSync(fd);}
}
