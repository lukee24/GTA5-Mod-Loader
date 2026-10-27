import {validateImportReport} from '../core/import-report';import type {Store} from '../database';import type {ModRecord} from '../core/types';
const error=()=>new Error('模组记录的字段、结构、标识或容量无法确认，已停止文件操作并保留原记录');
function id(value:unknown){return typeof value==='string'&&value.length>0&&value.length<=80&&/^[-a-z0-9_]+$/i.test(value);}
function object(value:unknown,keys:string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw error();return value as Record<string,unknown>;}
function text(value:unknown,max:number,empty=false){return typeof value==='string'&&value.length<=max&&(empty||value.length>0)&&!/[\x00-\x1f\x7f]/u.test(value);}
function date(value:unknown){return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;}
/** Validate persisted MOD DTOs; admission does not authenticate authors, files or game effects. */
export function validateModRecord(key:unknown,value:unknown):ModRecord{
  const mod=object(value,['id','report','transactionId','status','installed','bytes','metadata']);
  if(!id(key)||mod.id!==key||!id(mod.transactionId)||!['已启用','已停用','已卸载'].includes(mod.status as string)||!date(mod.installed)||!Number.isSafeInteger(mod.bytes)||(mod.bytes as number)<0)throw error();
  try{validateImportReport(key,mod.report);}catch{throw error();}
  if(mod.metadata!==undefined){const metadata=object(mod.metadata,['brand','favorite']);if(metadata.brand!==undefined&&!text(metadata.brand,80,true)||metadata.favorite!==undefined&&typeof metadata.favorite!=='boolean')throw error();}
  return value as ModRecord;
}
export function readMods(store:Store):ModRecord[]{
  const sample=store.modRows();if(sample.limited)throw new Error('模组记录超过10000条或合计32MiB准入上限，已停止文件操作并保留原记录');
  return sample.rows.map(row=>{try{if(row.json===null)throw error();return validateModRecord(row.id,JSON.parse(row.json));}catch{throw error();}});
}
export function readMod(store:Store,key:unknown):ModRecord|undefined{
  if(!id(key))throw error();const row=store.modRow(key as string);if(!row)return undefined;
  try{if(row.json===null)throw error();return validateModRecord(key,JSON.parse(row.json));}catch{throw error();}
}
/** Prospective new/replacement MOD record before any installation writes. Preserve malformed history. */
export function assertModWrite(store:Store,record:ModRecord){
  validateModRecord(record.id,record);readMods(store);const sample=store.modRows();
  const existing=sample.rows.find(row=>row.id===record.id),bytes=Buffer.byteLength(JSON.stringify(record));
  const total=sample.rows.reduce((sum,row)=>sum+Buffer.byteLength(row.json!),0)-(existing?Buffer.byteLength(existing.json!):0)+bytes;
  if(bytes>8*1024**2||total>32*1024**2||!existing&&sample.total>=10000)throw error();
}
