import fs from 'node:fs';import path from 'node:path';
export const fileIdentity=(stat:fs.BigIntStats)=>[stat.dev,stat.ino].join(':');
export const fileStamp=(stat:fs.BigIntStats)=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.nlink].join(':');
/** Ordinary directory identities; exclude timestamps changed by normal child creation. */
export function directoryIdentity(directory:string,allowMissing=false){
 const absolute=path.resolve(directory),volume=path.parse(absolute).root,parents=[volume];let cursor=volume;
 for(const segment of absolute.slice(volume.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,segment);parents.push(cursor);}
 return parents.map(parent=>{let stat:fs.BigIntStats;try{stat=fs.lstatSync(parent,{bigint:true});}catch(error){if(allowMissing&&parent!==volume&&(error as NodeJS.ErrnoException).code==='ENOENT')return 'missing';throw error;}if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('文件目录包含符号链接、目录连接或非目录，已停止写入');return fileIdentity(stat);}).join('/');
}
