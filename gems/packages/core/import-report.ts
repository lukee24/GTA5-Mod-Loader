import path from 'node:path';import type {ImportReport} from './types';import {relativeSafe,MAX_FILES,MAX_BYTES} from './security';
const error=()=>new Error('导入记录的字段、结构、标识或容量无法确认，已停止保存并保留原记录');
const categories=['车辆','人物','武器','地图与房产','脚本与玩法','图形与环境','音效','其他'];
function id(value:unknown){return typeof value==='string'&&value.length>0&&value.length<=80&&/^[-a-z0-9_]+$/i.test(value);}
function object(value:unknown,keys:string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw error();return value as Record<string,unknown>;}
function text(value:unknown,max:number,empty=false){return typeof value==='string'&&value.length<=max&&(empty||value.length>0)&&!/[\x00-\x1f\x7f]/u.test(value);}
function date(value:unknown){return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;}
function absolute(value:unknown){return text(value,32768)&&path.isAbsolute(value as string);}
function relative(value:unknown){if(!text(value,4096))throw error();try{return relativeSafe(value as string).toLowerCase();}catch{throw error();}}
function array(value:unknown,max:number,accept:(item:unknown)=>boolean){if(!Array.isArray(value)||value.length>max||value.some(item=>!accept(item)))throw error();return value;}
/** Shared persisted report schema; it does not authenticate metadata or resource compatibility. */
export function validateImportReport(key:unknown,value:unknown):ImportReport{
  if(!id(key))throw error();
  const report=object(value,['id','name','original','created','categories','files','warnings','blockers','readme','method','compatibility','author','version','spawnNames','dlcNames','sourceUrl']);
  if(report.id!==key||!text(report.name,300)||!absolute(report.original)||!date(report.created)||!text(report.method,512)||!text(report.compatibility,512)||typeof report.readme!=='string'||report.readme.length>512*1024)throw error();
  const kinds=array(report.categories,8,item=>typeof item==='string'&&categories.includes(item));if(!kinds.length||new Set(kinds).size!==kinds.length)throw error();
  for(const key of ['warnings','blockers'])array(report[key],MAX_FILES,item=>text(item,8192));
  array(report.spawnNames,MAX_FILES,item=>typeof item==='string'&&/^[a-z0-9_]{1,64}$/i.test(item));
  array(report.dlcNames,MAX_FILES,item=>text(item,255));
  if(report.author!==undefined&&!text(report.author,200,true)||report.version!==undefined&&!text(report.version,80,true))throw error();
  if(report.sourceUrl!==undefined){try{if(!text(report.sourceUrl,2048))throw error();const url=new URL(report.sourceUrl as string);if(url.protocol!=='https:'||url.username||url.password)throw error();}catch{throw error();}}
  if(!Array.isArray(report.files)||report.files.length>MAX_FILES)throw error();
  const seen=new Set<string>();
  for(const item of report.files){const file=object(item,['path','source','size','hash','target','binary','resource']),name=relative(file.path);if(seen.has(name)||!absolute(file.source)||!Number.isSafeInteger(file.size)||(file.size as number)<0||(file.size as number)>MAX_BYTES||typeof file.hash!=='string'||! /^[a-f0-9]{64}$/.test(file.hash)||typeof file.binary!=='boolean'||file.resource!==undefined&&!text(file.resource,512))throw error();seen.add(name);if(file.target!==undefined)relative(file.target);}
  return value as ImportReport;
}
