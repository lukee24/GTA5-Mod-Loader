import fs from 'node:fs';
import path from 'node:path';
import {noLinks} from '../core/security';
import type {Store} from '../database';
import type {LogEntry,LogView} from '../core/types';

export const LOG_LIMIT=1000,LOG_TAIL_BYTES=4*1024**2,LOG_LINE_BYTES=64*1024;
const fallbackScope='数据库未保存，仅文件日志';
type RecordData=Omit<LogEntry,'source'>;
function record(value:unknown):RecordData|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  if(typeof v.id!=='string'||!v.id.length||v.id.length>128||/[\x00-\x1f\x7f]/u.test(v.id)||
     typeof v.kind!=='string'||!v.kind.length||v.kind.length>80||/[\x00-\x1f\x7f]/u.test(v.kind)||
     typeof v.message!=='string'||v.message.length>32768||typeof v.time!=='string'||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v.time)||!Number.isFinite(Date.parse(v.time))||new Date(v.time).toISOString()!==v.time||
     (v.scope!==undefined&&v.scope!==fallbackScope))return null;
  return{id:v.id,time:v.time,kind:v.kind,message:v.message,...(v.scope===fallbackScope?{scope:fallbackScope}:{})};
}
function parse(bytes:Uint8Array|string):RecordData|null{
  try{if(Buffer.byteLength(bytes)>LOG_LINE_BYTES)return null;const text=typeof bytes==='string'?bytes:new TextDecoder('utf-8',{fatal:true}).decode(bytes);return record(JSON.parse(text));}catch{return null;}
}
function equal(a:RecordData,b:RecordData){return a.time===b.time&&a.kind===b.kind&&a.message===b.message&&a.scope===b.scope;}

// Fixed local path only. Snapshot checks detect observed changes; they do not provide an OS lock.
export function operationLogs(store:Store):LogView{
  const issues:string[]=[],entries=new Map<string,LogEntry>();
  const sample=store.logRows(LOG_LIMIT+1,LOG_LINE_BYTES);let invalidDatabase=0,invalidFile=0,conflicts=0;
  for(const row of sample.rows){const item=row.json===null?null:parse(row.json);if(!item||item.id!==row.id){invalidDatabase++;continue;}entries.set(item.id,{...item,source:'数据库'});}
  let fileBytes=0,fileReadBytes=0,truncated=sample.total>LOG_LIMIT;
  const file=path.join(store.root,'operations.jsonl');let fd:number|undefined;
  try{
    noLinks(path.parse(path.resolve(store.root)).root,file);
    try{fd=fs.openSync(file,'r');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(fd!==undefined){
      const before=fs.fstatSync(fd,{bigint:true});
      if(!before.isFile()||before.nlink>1n||before.size>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('日志不是独立普通文件');
      fileBytes=Number(before.size);const offset=Math.max(0,fileBytes-LOG_TAIL_BYTES),start=Math.max(0,offset-1);
      const buffer=Buffer.alloc(fileBytes-start);let read=0;
      while(read<buffer.length){const n=fs.readSync(fd,buffer,read,buffer.length-read,start+read);if(!n)throw new Error('日志读取不完整');read+=n;}
      fileReadBytes=read;
      noLinks(path.parse(path.resolve(store.root)).root,file);
      const after=fs.fstatSync(fd,{bigint:true}),current=fs.statSync(file,{bigint:true});
      for(const stat of [after,current])if(stat.dev!==before.dev||stat.ino!==before.ino||stat.size!==before.size||stat.mtimeNs!==before.mtimeNs||stat.ctimeNs!==before.ctimeNs||stat.nlink!==1n)throw new Error('日志读取期间发生变化');
      let first=offset-start;
      if(offset>0){truncated=true;issues.push('文件日志仅读取末尾 4 MiB，较早记录未包含。');if(buffer[first-1]!==10){const newline=buffer.indexOf(10,first);first=newline<0?buffer.length:newline+1;}}
      const fileRecords=new Map<string,RecordData>(),disputed=new Set<string>();
      for(let at=first;at<buffer.length;){
        const end=buffer.indexOf(10,at);if(end<0){issues.push('文件末尾有未完成的日志行，已跳过。');break;}
        const line=buffer.subarray(at,end);at=end+1;if(!line.length)continue;
        const item=parse(line);if(!item){invalidFile++;continue;}
        const previous=fileRecords.get(item.id);
        if(previous&&!equal(previous,item)){disputed.add(item.id);conflicts++;}else fileRecords.set(item.id,item);
      }
      for(const item of fileRecords.values()){
        const database=entries.get(item.id);
        if(database){if(!equal(database,item)){conflicts++;}continue;}
        if(!disputed.has(item.id))entries.set(item.id,{...item,source:'文件补充',scope:item.scope||'数据库未收录，来自文件日志'});
      }
    }
  }catch{issues.push('文件日志无法安全读取，已保留原文件；请检查文件连接、权限或并发修改后刷新。');}
  finally{if(fd!==undefined)fs.closeSync(fd);}
  if(invalidDatabase)issues.push(`数据库中 ${invalidDatabase} 条日志格式无效或超过读取上限，已跳过。`);
  if(invalidFile)issues.push(`文件中 ${invalidFile} 条日志格式无效或超过 64 KiB，已跳过。`);
  if(conflicts)issues.push(`发现 ${conflicts} 处相同日志标识内容不一致；优先保留数据库记录，冲突的文件独有记录不展示。`);
  const sorted=[...entries.values()].sort((a,b)=>b.time.localeCompare(a.time)||a.id.localeCompare(b.id));
  truncated||=sorted.length>LOG_LIMIT;
  if(truncated)issues.push('当前展示和导出为受限的最近记录，不是完整历史归档。');
  return{checked:new Date().toISOString(),entries:sorted.slice(0,LOG_LIMIT),issues,coverage:{limit:LOG_LIMIT,databaseTotal:sample.total,databaseSampled:sample.rows.length,fileBytes,fileReadBytes,truncated}};
}
