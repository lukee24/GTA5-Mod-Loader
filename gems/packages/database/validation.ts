import fs from 'node:fs';import type {Database} from 'sql.js';
import path from 'node:path';import {noLinks} from '../core/security';
export const MAX_DATABASE_BYTES=256*1024**2;
function fingerprint(stat:fs.BigIntStats){return [stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.nlink].join(':');}
export function readDatabase(file:string):Uint8Array{
  const volume=path.parse(path.resolve(file)).root;noLinks(volume,file);
  const fd=fs.openSync(file,'r');try{
    const before=fs.fstatSync(fd,{bigint:true});if(!before.isFile()||before.nlink!==1n)throw new Error('数据库不是独立普通文件，已保留原文件');const size=Number(before.size);
    if(size>MAX_DATABASE_BYTES)throw new Error('数据库超过 256 MiB 安全上限，请保留文件并联系维护者处理');
    if(size<100)throw new Error('已有数据库为空或文件头不完整；已保留原文件，不自动初始化');
    const bytes=Buffer.alloc(size);let offset=0;
    while(offset<size){const count=fs.readSync(fd,bytes,offset,size-offset,offset);if(!count)throw new Error('读取数据库时文件被截断，已停止打开');offset+=count;}
    const checkSnapshot=()=>{
      noLinks(volume,file);let current:fs.BigIntStats;try{current=fs.lstatSync(file,{bigint:true});}catch(error){throw new Error('读取数据库时文件路径变化，已停止打开',{cause:error});}
      if(fingerprint(fs.fstatSync(fd,{bigint:true}))!==fingerprint(before)||fingerprint(current)!==fingerprint(before))throw new Error('读取数据库时文件内容或路径变化，已停止打开');
    };
    checkSnapshot();
    // Equal-length writes can retain timestamps; compare the actual bytes too.
    const chunk=Buffer.alloc(Math.min(size,64*1024));offset=0;
    while(offset<size){
      const count=fs.readSync(fd,chunk,0,Math.min(chunk.length,size-offset),offset);
      if(!count||!chunk.subarray(0,count).equals(bytes.subarray(offset,offset+count)))throw new Error('读取数据库时文件内容或路径变化，已停止打开');
      offset+=count;
    }
    checkSnapshot();
    return bytes;
  }finally{fs.closeSync(fd);}
}
export function validateDatabase(db:Database){
  const invalid=()=>new Error('数据库版本或结构不受支持；已保留原文件，请使用匹配版本的 GEMS');
  try{
    const tables=db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('documents','schema_version')");
    if(!tables.length||tables[0].values.length!==2)throw invalid();
    const versions=db.exec('SELECT version FROM schema_version');
    if(versions.length!==1||versions[0].values.length!==1||versions[0].values[0].length!==1||versions[0].values[0][0]!==1)throw invalid();
    const matches=(table:string,expected:unknown[][])=>{
      const columns=db.exec('PRAGMA table_info('+table+')');
      return columns.length===1&&JSON.stringify(columns[0].values.map(row=>row.slice(1)))===JSON.stringify(expected);
    };
    if(!matches('documents',[['kind','TEXT',1,null,1],['id','TEXT',1,null,2],['json','TEXT',1,null,0]])||!matches('schema_version',[['version','INTEGER',1,null,0]]))throw invalid();
    const check=db.exec('PRAGMA quick_check');
    if(check.length!==1||check[0].values.length!==1||check[0].values[0][0]!=='ok')throw new Error('数据库结构校验失败，已保留原文件');
  }catch(error){
    if(error instanceof Error&&error.message.startsWith('数据库'))throw error;
    throw new Error(invalid().message,{cause:error});
  }
}
