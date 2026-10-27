import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const maximumBytes=64*1024;
const stamp=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.nlink].join(':');
export function parseSourceOptions(args){
 if(!Array.isArray(args)||args.length>16||args.some(arg=>typeof arg!=='string'||!arg||arg.length>32768||/[\x00-\x1f\x7f]/u.test(arg)))throw new Error('源码工具参数无效：需要有限、完整的参数');
 if(args.length===1&&args[0]==='--help')return Object.freeze({help:true});
 if(args.length)throw new Error('源码工具参数无效：只支持无参数或独立 --help；未开始读取或写入');
 return Object.freeze({help:false});
}
export const sourceArchiveHelp='用法：node scripts/source-archive.mjs [--help]\n无参数：安全生成当前工程源码ZIP；--help：显示帮助，不读项目或写文件。';
export const sourceVerifyHelp='用法：node scripts/verify-source.mjs [--help]\n无参数：核验当前源码ZIP的结构、CRC和源SHA；--help：显示帮助，不读项目或写文件。';
function regularPackage(file){
 const absolute=path.resolve(file),volume=path.parse(absolute).root;let cursor=volume;
 for(const segment of absolute.slice(volume.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,segment);const current=fs.lstatSync(cursor);if(current.isSymbolicLink())throw new Error('源码版本文件路径包含链接或目录连接');}
 const stat=fs.lstatSync(file,{bigint:true});if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||stat.size<0n||stat.size>BigInt(maximumBytes))throw new Error('源码版本文件需要64KiB以内的独立普通文件');return stat;
}
/** Bounded independent package snapshot; values cannot become paths before admission. */
export function readSourceVersion(root){
 try{
  if(typeof root!=='string'||!path.isAbsolute(root))throw new Error('工程目录需要绝对路径');
  const file=path.join(root,'package.json'),before=regularPackage(file),fd=fs.openSync(file,'r');let bytes;
  try{
   const check=()=>{if(stamp(fs.fstatSync(fd,{bigint:true}))!==stamp(before)||stamp(regularPackage(file))!==stamp(before))throw new Error('版本文件读取期间发生变化');};
   const read=()=>{const value=Buffer.alloc(Number(before.size));let offset=0;while(offset<value.length){const count=fs.readSync(fd,value,offset,value.length-offset,offset);if(!Number.isSafeInteger(count)||count<=0||count>value.length-offset)throw new Error('版本文件读取不完整');offset+=count;}return value;};
   check();bytes=read();check();const confirmed=read();check();if(!crypto.createHash('sha256').update(bytes).digest().equals(crypto.createHash('sha256').update(confirmed).digest()))throw new Error('版本文件内容发生变化');
  }finally{fs.closeSync(fd);}
  // Recheck after close as well; this is observation, not a filesystem lock.
  if(stamp(regularPackage(file))!==stamp(before))throw new Error('版本文件读取结束时发生变化');
  let pkg;try{pkg=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('源码版本JSON或UTF8无法解析，原文件保留');}
  if(!pkg||typeof pkg!=='object'||Array.isArray(pkg)||typeof pkg.version!=='string'||pkg.version.length>80||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/iu.test(pkg.version))throw new Error('版本不是受支持的安全发行标识');
  return pkg.version;
 }catch(error){throw new Error('源码版本记录无效、超限或读取发生变化，未开始归档或核验',{cause:error});}
}
