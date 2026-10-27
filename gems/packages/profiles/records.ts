import path from 'node:path';
import crypto from 'node:crypto';
import type {Store} from '../database';
import {MAX_FILES} from '../core/security';
import {validateTarget} from '../installer/target-policy';
import type {Profile,ProfileRef,ProfileSwitchFile,ProfileSwitchState} from './types';

export const PROFILE_KIND='profile',JOURNAL_KIND='profile-switch';
export const MAX_PROFILES=200,MAX_REFS=1000,MAX_PROFILE_BYTES=256*1024,MAX_JOURNAL_BYTES=8*1024**2;
export interface Journal {format:1;id:string;profileId:string;name:string;gamePath:string;gameIdentity:string;catalogDigest:string;created:string;state:ProfileSwitchState;files:(ProfileSwitchFile&{applied:boolean})[];error?:string}
export interface Active {profileId:string;gamePath:string;switchId:string}
export const activeId=(gamePath:string)=>crypto.createHash('sha256').update(JSON.stringify(path.resolve(gamePath).toLowerCase())).digest('hex');
export const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
export function fail(){return new Error('配置方案记录的结构、标识或容量无法确认，已停止操作并保留原记录');}
export function object(value:unknown,keys:string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw fail();return value as Record<string,unknown>;}
export const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=80&&/^[-a-z0-9_]+$/i.test(value);
export const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/u.test(value);
export const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
export function name(value:unknown):string{if(!text(value,120)||value!==value.trim())throw new Error('方案名称需要1至120个字符，不能含控制字符或首尾空白');return value;}
export function game(value:unknown):string{if(!text(value,32768)||!path.isAbsolute(value))throw fail();return path.resolve(value);}
export function refs(value:unknown):ProfileRef[]{
  if(!Array.isArray(value)||value.length>MAX_REFS)throw fail();const seen=new Set<string>();
  for(const item of value){const ref=object(item,['modId','name','version','fingerprint']);if(!id(ref.modId)||!text(ref.name,300)||ref.version!==undefined&&!text(ref.version,120)||!hash(ref.fingerprint)||seen.has(ref.modId))throw fail();seen.add(ref.modId);}
  return value as ProfileRef[];
}
export function validateProfile(key:unknown,value:unknown):Profile{
  const p=object(value,['format','id','name','gamePath','created','updated','mods']);
  if(p.format!==1||!id(key)||p.id!==key||!date(p.created)||!date(p.updated))throw fail();name(p.name);game(p.gamePath);refs(p.mods);if(Buffer.byteLength(JSON.stringify(value))>MAX_PROFILE_BYTES)throw fail();return value as Profile;
}
export function validateJournal(key:unknown,value:unknown):Journal{
  const j=object(value,['format','id','profileId','name','gamePath','gameIdentity','catalogDigest','created','state','files','error']);
  if(j.format!==1||!id(key)||j.id!==key||!id(j.profileId)||!text(j.name,120)||!text(j.gameIdentity,32768)||!hash(j.catalogDigest)||!date(j.created)||!['preparing','executing','recovery-required','completed','rolled-back'].includes(j.state as string)||j.error!==undefined&&(typeof j.error!=='string'||j.error.length>4096)||!Array.isArray(j.files)||j.files.length>MAX_FILES)throw fail();game(j.gamePath);
  const seen=new Set<string>();for(const value of j.files){const f=object(value,['target','before','after','baseline','owner','changed','applied']);if(!text(f.target,4096)||[f.before,f.after,f.baseline].some(h=>h!==null&&!hash(h))||f.owner!==undefined&&!id(f.owner)||typeof f.changed!=='boolean'||f.changed!==(f.before!==f.after)||typeof f.applied!=='boolean'||f.applied&&!f.changed)throw fail();const target=validateTarget(f.target);if(seen.has(target.toLowerCase()))throw fail();seen.add(target.toLowerCase());}
  if(j.state==='rolled-back'&&(j.files as Journal['files']).some(f=>f.applied)||j.state==='completed'&&(j.files as Journal['files']).some(f=>f.changed&&!f.applied)||Buffer.byteLength(JSON.stringify(value))>MAX_JOURNAL_BYTES-8192)throw fail();return value as Journal;
}
/** SQL bounds before JSON allocation. Bad rows are never silently omitted. */
export function rows<T>(store:Store,kind:string,limit:number,maxBytes:number,totalBytes:number,validate:(id:unknown,value:unknown)=>T):T[]{
  const count=store.db.prepare('SELECT COUNT(*) AS total FROM documents WHERE kind=?');let total=0;try{count.bind([kind]);if(count.step())total=Number(count.getAsObject().total);}finally{count.free();}if(total>limit)throw fail();
  const s=store.db.prepare("SELECT CASE WHEN typeof(id)='text' AND length(CAST(id AS BLOB))<=80 THEN id ELSE NULL END AS id,CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=? THEN json ELSE NULL END AS json FROM documents WHERE kind=? ORDER BY rowid DESC LIMIT ?");
  const out:T[]=[];let bytes=0;try{s.bind([maxBytes,kind,limit]);while(s.step()){const row=s.getAsObject();if(typeof row.json!=='string')throw fail();bytes+=Buffer.byteLength(row.json);if(bytes>totalBytes)throw fail();try{out.push(validate(row.id,JSON.parse(row.json)));}catch{throw fail();}}}finally{s.free();}return out;
}
export const readProfiles=(store:Store)=>rows(store,PROFILE_KIND,MAX_PROFILES,MAX_PROFILE_BYTES,16*1024**2,validateProfile);
export const readJournals=(store:Store)=>rows(store,JOURNAL_KIND,1000,MAX_JOURNAL_BYTES,32*1024**2,validateJournal);
export function readActive(store:Store){
  const markers=rows<Active>(store,'profile-active',MAX_PROFILES,65536,1024*1024,(key,value)=>{const v=object(value,['profileId','gamePath','switchId']);if(!id(v.profileId)||!id(v.switchId)||!hash(key)||activeId(game(v.gamePath))!==key)throw fail();return value as Active;});
  if(markers.length){const journals=readJournals(store),profiles=readProfiles(store);for(const marker of markers){const journal=journals.find(j=>j.id===marker.switchId);if(!journal||journal.state!=='completed'||journal.profileId!==marker.profileId||activeId(journal.gamePath)!==activeId(marker.gamePath)||!profiles.some(p=>p.id===marker.profileId&&activeId(p.gamePath)===activeId(marker.gamePath)))throw fail();}}
  return markers;
}
export const pendingJournal=(j:Journal)=>!['completed','rolled-back'].includes(j.state);
