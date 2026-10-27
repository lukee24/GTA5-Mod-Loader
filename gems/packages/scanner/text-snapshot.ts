import fs from 'node:fs';import crypto from 'node:crypto';import {noLinks} from '../core/security';
function fingerprint(stat:fs.BigIntStats){return [stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.nlink].join(':');}
/** Fixed caller-owned bounds; observed identity checks are not an OS lock. */
export function readTextSnapshot(root:string,file:string,limit:number,label:'GEMS 清单'|'XML'|'Steam 安装记录',expectedHash?:string){
 if(![1024**2,4*1024**2].includes(limit))throw new Error('文本读取容量无效');
 if(expectedHash!==undefined&&(typeof expectedHash!=='string'||expectedHash.length!==64||!/^[a-f0-9]{64}$/i.test(expectedHash)))throw new Error(label+'扫描摘要无效');
 noLinks(root,file);const fd=fs.openSync(file,'r');
 try{
  const before=fs.fstatSync(fd,{bigint:true});if(!before.isFile()||before.nlink!==1n||before.size>BigInt(limit))throw new Error(label+'不是独立普通文件或超过'+limit/(1024**2)+'MiB');
  const bytes=Buffer.alloc(Number(before.size));let offset=0;while(offset<bytes.length){const size=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(!size)throw new Error(label+'读取不完整');offset+=size;}
  noLinks(root,file);if(fingerprint(fs.fstatSync(fd,{bigint:true}))!==fingerprint(before)||fingerprint(fs.lstatSync(file,{bigint:true}))!==fingerprint(before))throw new Error('读取期间'+label+'发生变化，'+(label==='Steam 安装记录'?'请重新检查安装状态':'请重新导入'));
  if(expectedHash!==undefined&&crypto.createHash('sha256').update(bytes).digest('hex')!==expectedHash.toLowerCase())throw new Error(label+'与扫描摘要不一致，请重新导入');
  try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new Error(label+'不是有效UTF-8文本');}
 }finally{fs.closeSync(fd);}
}
