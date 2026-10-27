import crypto from 'node:crypto';
import path from 'node:path';
import type {ImportReport} from '../core/types';
import {relativeSafe,MAX_BYTES} from '../core/security';
import type {WeaponEvidence,WeaponReferencesV1,WeaponSource} from './types';
export const WEAPON_BYTES=2*1024**2,WEAPON_LIMIT=2000,WEAPON_KIND='weapon-references-v1';
export const digest=(value:string|Uint8Array)=>crypto.createHash('sha256').update(value).digest('hex');
export function fail(message:string):never{throw new Error('武器目录：'+message);}
export function object(value:unknown,keys:string[]):Record<string,any>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail('字段或结构无效');return value as Record<string,any>;}
export function text(value:unknown,max:number,empty=false):value is string{
  if(typeof value!=='string'||value.length>max||(!empty&&!value.length)||/[\x00-\x1f\x7f]/u.test(value))return false;
  for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(code>=0xdc00&&code<=0xdfff)return false;}return true;
}
export function id(value:unknown):value is string{return text(value,80)&&/^[-a-z0-9_]+$/i.test(value);}
export function hex(value:unknown,length=64):value is string{return typeof value==='string'&&new RegExp('^[0-9a-f]{'+length+'}$').test(value);}
export function token(value:unknown):value is string{return typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value);}
export function date(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;}
export function strings(value:unknown,maxCount:number,maxLength:number){if(!Array.isArray(value)||value.length>maxCount||value.some(v=>!text(v,maxLength)))fail('列表超限或包含无效文本');return value as string[];}
export function sourceKey(value:WeaponSource){const v=object(value,['kind','id']);if(!['import','mod'].includes(v.kind)||!id(v.id))fail('来源标识无效');return v.kind+':'+v.id;}
export function inputDigest(report:ImportReport){return digest(JSON.stringify([report.id,report.created,[...report.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0).map(f=>[f.path,f.size,f.hash,f.target??null])]));}
export function weaponHash(name:string){if(!token(name))fail('武器标识格式未支持');let hash=0;for(const byte of Buffer.from(name.toLowerCase(),'ascii')){hash=(hash+byte)>>>0;hash=(hash+(hash<<10))>>>0;hash^=hash>>>6;}hash=(hash+(hash<<3))>>>0;hash^=hash>>>11;hash=(hash+(hash<<15))>>>0;return hash.toString(16).padStart(8,'0');}
/** Preserve actual directory casing and Unicode; do not merge case-sensitive paths. */
export function canonicalGameRoot(value:string){
  if(!text(value,32768))fail('游戏根目录无效');let result=value.replaceAll('/','\\');
  if(result.startsWith('\\\\?\\UNC\\'))result='\\\\'+result.slice(8);else if(result.startsWith('\\\\?\\'))result=result.slice(4);
  if(!/^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+(?:\\|$))/.test(result)||result.startsWith('\\\\.\\')||result.includes('\0'))fail('游戏根目录不是普通绝对路径');
  const root=path.win32.parse(result).root;
  while(result.length>root.length&&result.endsWith('\\'))result=result.slice(0,-1);
  if(path.win32.normalize(result)!==result)fail('游戏根目录尚未规范化');return result;
}
export const gameRootId=(value:string)=>digest(canonicalGameRoot(value));
export function validateEvidence(value:unknown):WeaponEvidence{
  const v=object(value,['kind','sourcePath','sourceSha256','sourceBytes','locator']);
  if(!['weapons-meta','manifest-declaration'].includes(v.kind)||!text(v.sourcePath,4096)||relativeSafe(v.sourcePath)!==v.sourcePath||!hex(v.sourceSha256)||!Number.isSafeInteger(v.sourceBytes)||v.sourceBytes<0||v.sourceBytes>MAX_BYTES||!text(v.locator,512))fail('来源证据无效');return v as WeaponEvidence;
}
export function validateAnalysis(value:unknown):WeaponReferencesV1{
  const v=object(value,['schema','schemaVersion','source','reportId','inputDigest','parserVersion','analyzedAt','status','references','issues']);sourceKey(v.source);
  if(v.schema!=='gems.weapon-references'||v.schemaVersion!==1||!id(v.reportId)||!hex(v.inputDigest)||v.parserVersion!=='weapons-meta-v1'||!date(v.analyzedAt)||!['parsed','partial','unsupported'].includes(v.status)||!Array.isArray(v.references)||v.references.length>WEAPON_LIMIT)fail('分析版本、日期或容量无效');
  strings(v.issues,WEAPON_LIMIT,8192);const ids=new Set<string>(),names=new Set<string>(),hashes=new Set<string>();let totalSymbols=0;
  for(const entry of v.references){const r=object(entry,['referenceId','weaponName','hash','kind','evidence','symbols','dependencies']);
    if(!hex(r.referenceId)||!token(r.weaponName)||!hex(r.hash,8)||weaponHash(r.weaponName)!==r.hash||!['addon','replace','unknown'].includes(r.kind)||!Array.isArray(r.evidence)||!r.evidence.length||r.evidence.length>32)fail('武器引用无效');
    if(ids.has(r.referenceId)||names.has(r.weaponName.toLowerCase())||hashes.has(r.hash))fail('重复标识或武器hash冲突');ids.add(r.referenceId);names.add(r.weaponName.toLowerCase());hashes.add(r.hash);r.evidence.forEach(validateEvidence);
    const s=object(r.symbols,['model','slot','ammo','components']);for(const key of ['model','slot','ammo'])if(s[key]!==undefined&&!token(s[key]))fail('配置符号无效');strings(s.components,256,64);if(s.components.some((x:string)=>!token(x))||new Set(s.components.map((x:string)=>x.toLowerCase())).size!==s.components.length)fail('组件引用重复或无效');
    if(!Array.isArray(r.dependencies)||r.dependencies.length>384)fail('依赖数量超限');for(const d of r.dependencies){object(d,['kind','identifier','origin','required']);if(!['model','ammo','component','dlc','runtime','file'].includes(d.kind)||!text(d.identifier,4096)||!['parsed-reference','manifest-declaration'].includes(d.origin)||!['declared','unknown'].includes(d.required))fail('依赖声明无效');if(d.kind==='file')relativeSafe(d.identifier);}
    totalSymbols+=s.components.length+r.dependencies.length;if(totalSymbols>20000)fail('组件/依赖总量超限');
  }
  if(Buffer.byteLength(JSON.stringify(v))>WEAPON_BYTES)fail('分析超过2MiB');return v as WeaponReferencesV1;
}
/** JSON.parse alone accepts duplicate keys. Reject them before domain validation. */
export function strictJson(input:string,limit=WEAPON_BYTES):unknown{
  if(typeof input!=='string'||Buffer.byteLength(input)>limit)fail('JSON超过容量限制');let at=0,nodes=0;
  const space=()=>{while(/[\x20\t\r\n]/.test(input[at]??'!'))at++;};
  const string=()=>{const start=at++;for(;at<input.length;at++){if(input[at]==='\\'){at++;continue;}if(input[at]==='"'){at++;return JSON.parse(input.slice(start,at));}}fail('JSON字符串不完整');};
  const value=(depth:number):any=>{if(depth>64||++nodes>100000)fail('JSON结构超限');space();const ch=input[at];
    if(ch==='"')return string();if(ch==='{'){at++;space();const o=Object.create(null),keys=new Set<string>();if(input[at]==='}'){at++;return o;}for(;;){space();if(input[at]!=='"')fail('JSON对象格式无效');const key=string();if(keys.has(key))fail('JSON包含重复字段');keys.add(key);space();if(input[at++]!==':')fail('JSON字段缺少冒号');o[key]=value(depth+1);space();const end=input[at++];if(end==='}')return o;if(end!==',')fail('JSON对象不完整');}}
    if(ch==='['){at++;space();const a:any[]=[];if(input[at]===']'){at++;return a;}for(;;){a.push(value(depth+1));space();const end=input[at++];if(end===']')return a;if(end!==',')fail('JSON数组不完整');}}
    const match=input.slice(at).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);if(!match)fail('JSON值无效');at+=match[0].length;return JSON.parse(match[0]);};
  const result=value(0);space();if(at!==input.length)fail('JSON尾部存在额外内容');return result;
}
