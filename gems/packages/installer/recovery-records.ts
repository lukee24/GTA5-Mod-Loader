import path from 'node:path';import type {Store} from '../database';import type {Transaction} from '../core/types';import {MAX_FILES} from '../core/security';import {validateTarget} from './target-policy';
const error=()=>new Error('事务记录的字段、结构、标识或容量无法确认，已停止文件操作并保留原记录');
function id(value:unknown){return typeof value==='string'&&value.length>0&&value.length<=80&&/^[-a-z0-9_]+$/i.test(value);}
function text(value:unknown,max:number){return typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/u.test(value);}
function object(value:unknown,keys:string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw error();return value as Record<string,unknown>;}
function hash(value:unknown){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
export function validateRecoveryTransaction(key:unknown,value:unknown):Transaction{
  const tx=object(value,['id','name','modId','gamePath','created','state','changes','error','trustedRestore','operation']);
  if(tx.operation!==undefined&&tx.operation!=='update')throw error();
  if(!id(key)||tx.id!==key||!id(tx.modId)||!text(tx.name,300)||!text(tx.gamePath,32768)||!path.isAbsolute(tx.gamePath as string)||typeof tx.created!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(tx.created)||!Number.isFinite(Date.parse(tx.created))||new Date(tx.created).toISOString()!==tx.created||!['准备中','执行中','已完成','已回滚','恢复待处理'].includes(tx.state as string)||tx.trustedRestore!==undefined&&typeof tx.trustedRestore!=='boolean'||tx.error!==undefined&&(typeof tx.error!=='string'||tx.error.length>4096)||!Array.isArray(tx.changes)||tx.changes.length>MAX_FILES)throw error();
  const targets=new Set<string>();
  for(const value of tx.changes){
    const change=object(value,['target','before','after','applied']);
    if(!text(change.target,4096)||(change.before!==null&&!hash(change.before))||(!hash(change.after)&&!(tx.operation==='update'&&change.after===null&&hash(change.before)))||typeof change.applied!=='boolean')throw error();
    let target:string;try{target=validateTarget(change.target as string,tx.trustedRestore===true);}catch{throw error();}
    const name=target.toLowerCase();if(targets.has(name))throw error();targets.add(name);
  }
  if(tx.state==='已回滚'&&tx.changes.some(change=>change.applied)||tx.state==='已完成'&&(!tx.changes.length||tx.changes.some(change=>!change.applied)))throw error();
  return value as Transaction;
}
/** Full batch admission before any recovery writes. No deletion, normalization, or migration. */
export function readRecoveryTransactions(store:Store):Transaction[]{
  const sample=store.recoveryRows();if(sample.limited)throw new Error('事务记录超过10000条或合计32MiB完整恢复准入上限，已停止本批恢复并保留原记录');
  const records:Transaction[]=[];
  for(const row of sample.rows){try{if(row.json===null)throw error();records.push(validateRecoveryTransaction(row.id,JSON.parse(row.json)));}catch{throw error();}}
  return records;
}
export const readTransactions=readRecoveryTransactions;
export function readTransaction(store:Store,key:unknown):Transaction|undefined{
  if(!id(key))throw error();const row=store.recoveryRow(key as string);if(!row)return undefined;
  try{if(row.json===null)throw error();return validateRecoveryTransaction(key,JSON.parse(row.json));}catch{throw error();}
}
