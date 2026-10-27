import fs from 'node:fs';import path from 'node:path';import {inside,noLinks,relativeSafe,sameGamePath,MAX_FILES,MAX_BYTES} from '../core/security';
export interface SnapshotRecord {id:string;name:string;created:string;gamePath:string;entries:{path:string;hash:string}[]}
export interface SnapshotPlan {readonly id:string;readonly name:string;readonly created:string;readonly gamePath:string;readonly files:readonly Readonly<{absolute:string;relative:string}>[];readonly estimatedBytes:number}
const error=()=>new Error('快照清单的字段、路径、标识或容量无法确认，已停止备份并保留原文件');
function object(value:unknown,keys:string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw error();return value as Record<string,unknown>;}
function text(value:unknown,max:number){return typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/u.test(value);}
function id(value:unknown){return text(value,80)&&/^[-a-z0-9_]+$/i.test(value as string);}
function absolute(value:unknown){return text(value,32768)&&path.isAbsolute(value as string);}
/** Capture is read-only and may preserve files that the installer cannot safely restore. */
export function snapshotPath(value:unknown){if(!text(value,4096))throw error();let normalized:string;try{normalized=relativeSafe(value as string);}catch{throw error();}if(!/^(mods|scripts)\//i.test(normalized)&&! /^[^/]+\.(asi|ini|dll)$/i.test(normalized))throw error();return normalized;}
export function validateSnapshot(key:unknown,value:unknown):SnapshotRecord{
  const record=object(value,['id','name','created','gamePath','entries']);
  if(!id(key)||record.id!==key||!text(record.name,300)||!absolute(record.gamePath)||typeof record.created!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.created)||!Number.isFinite(Date.parse(record.created))||new Date(record.created).toISOString()!==record.created||!Array.isArray(record.entries)||record.entries.length>MAX_FILES)throw error();
  const seen=new Set<string>();for(const value of record.entries){const entry=object(value,['path','hash']),target=snapshotPath(entry.path).toLowerCase();if(seen.has(target)||typeof entry.hash!=='string'||! /^[a-f0-9]{64}$/.test(entry.hash))throw error();seen.add(target);}
  return value as SnapshotRecord;
}
export function planSnapshot(input:unknown,gamePath:unknown):SnapshotPlan{
  if(!absolute(gamePath)||!Array.isArray(input)||input.length>MAX_FILES)throw error();
  const files:{absolute:string;relative:string}[]=[],seen=new Set<string>();
  for(const value of input){const file=object(value,['absolute','relative']),source=file.absolute,relative=snapshotPath(file.relative);if(!absolute(source)||seen.has(relative.toLowerCase()))throw error();
    try{const expected=inside(gamePath as string,relative);if(!sameGamePath(expected,source as string))throw error();noLinks(gamePath as string,expected);const stat=fs.statSync(expected);if(!stat.isFile()||!Number.isSafeInteger(stat.size)||stat.size<0||stat.size>MAX_BYTES)throw error();}catch{throw error();}
    seen.add(relative.toLowerCase());files.push({absolute:source as string,relative});
  }
  const header={id:crypto.randomUUID(),name:'环境快照',created:new Date().toISOString(),gamePath:gamePath as string};
  // Empty strings are only a serialization budget template, never saved as resource hashes.
  const estimatedBytes=Buffer.byteLength(JSON.stringify({...header,entries:files.map(file=>({path:file.relative,hash:''}))}))+files.length*64;
  if(estimatedBytes>8*1024**2)throw error();return Object.freeze({...header,files:Object.freeze(files.map(file=>Object.freeze(file))),estimatedBytes});
}
