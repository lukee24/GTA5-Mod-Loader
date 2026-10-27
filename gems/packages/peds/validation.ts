import crypto from 'node:crypto';
import path from 'node:path';
import type {ImportReport} from '../core/types';
import {relativeSafe,MAX_BYTES} from '../core/security';
import type {PedDependency,PedEvidence,PedReferencesV1,PedSource,PedUserState,PedUserTag} from './types';
import {validatePedThumbnail} from './thumbnail';
export const PED_BYTES=2*1024**2,PED_LIMIT=2000,PED_KIND='ped-references-v1';
export const digest=(value:string|Uint8Array)=>crypto.createHash('sha256').update(value).digest('hex');
export function fail(message:string):never{throw new Error('人物目录：'+message);}
export function object(value:unknown,keys:string[],optional:string[]=[]):Record<string,any>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)&&!optional.includes(k))||keys.some(k=>!Object.prototype.hasOwnProperty.call(value,k)))fail('字段或结构无效');return value as Record<string,any>;}
export function text(value:unknown,max:number,empty=false):value is string{
  if(typeof value!=='string'||value.length>max||(!empty&&!value.length)||/[\x00-\x1f\x7f]/u.test(value))return false;
  for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(code>=0xdc00&&code<=0xdfff)return false;}return true;
}
export function id(value:unknown):value is string{return text(value,80)&&/^[-a-z0-9_]+$/i.test(value);}
export function hex(value:unknown,length=64):value is string{return typeof value==='string'&&new RegExp('^[0-9a-f]{'+length+'}$').test(value);}
export function token(value:unknown):value is string{return typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value);}
export function date(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;}
export function strings(value:unknown,maxCount:number,maxLength:number){if(!Array.isArray(value)||value.length>maxCount||value.some(v=>!text(v,maxLength)))fail('列表超限或包含无效文本');return value as string[];}
export function sourceKey(value:PedSource){const v=object(value,['kind','id']);if(!['import','mod'].includes(v.kind)||!id(v.id))fail('来源标识无效');return v.kind+':'+v.id;}
export function inputDigest(report:ImportReport){return digest(JSON.stringify([report.id,report.created,[...report.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0).map(f=>[f.path,f.size,f.hash,f.target??null])]));}
export function pedHash(name:string){if(!token(name))fail('人物标识格式未支持');let hash=0;for(const byte of Buffer.from(name.toLowerCase(),'ascii')){hash=(hash+byte)>>>0;hash=(hash+(hash<<10))>>>0;hash^=hash>>>6;}hash=(hash+(hash<<3))>>>0;hash^=hash>>>11;hash=(hash+(hash<<15))>>>0;return hash.toString(16).padStart(8,'0');}
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
export function validateEvidence(value:unknown):PedEvidence{
  const v=object(value,['kind','sourcePath','sourceSha256','sourceBytes','locator']);
  if(!['peds-meta','manifest-declaration'].includes(v.kind)||!text(v.sourcePath,4096)||relativeSafe(v.sourcePath)!==v.sourcePath||!hex(v.sourceSha256)||!Number.isSafeInteger(v.sourceBytes)||v.sourceBytes<0||v.sourceBytes>MAX_BYTES||!text(v.locator,512))fail('来源证据无效');return v as PedEvidence;
}
export const PED_USER_KIND='ped-user-state-v1';
export const USER_TAGS:PedUserTag[]=['military','police','civilian','animal'];
export const PED_KINDS=['addon','npc-replace','protagonist-replace','unknown'];
const parsedKinds=['props','clip-dictionary','expression-dictionary','creature-metadata','movement-clip-set'];
export function validateTags(value:unknown):PedUserTag[]{if(!Array.isArray(value)||value.length>4||value.some(v=>!USER_TAGS.includes(v))||new Set(value).size!==value.length)fail('用户标签无效');return value as PedUserTag[];}
export function validateDependency(value:unknown):PedDependency{
  const d=object(value,['kind','identifier','origin','required']);
  const parsed=parsedKinds.includes(d.kind),declared=['dlc','runtime','file'].includes(d.kind);
  if(!parsed&&!declared||d.origin!==(parsed?'parsed-reference':'manifest-declaration')||d.required!==(parsed?'unknown':'declared')||!text(d.identifier,d.kind==='file'?4096:128))fail('依赖引用无效');
  if(d.kind==='file'&&relativeSafe(d.identifier)!==d.identifier)fail('依赖文件路径无效');return d as PedDependency;
}
export const ordinal=(a:string,b:string)=>a<b?-1:a>b?1:0;
export function evidenceOrder(a:PedEvidence,b:PedEvidence){return ordinal(a.sourcePath,b.sourcePath)||ordinal(a.kind,b.kind)||ordinal(a.locator,b.locator)||ordinal(a.sourceSha256,b.sourceSha256)||a.sourceBytes-b.sourceBytes;}
export function dependencyOrder(a:PedDependency,b:PedDependency){return ordinal(a.kind,b.kind)||ordinal(a.identifier,b.identifier)||ordinal(a.origin,b.origin)||ordinal(a.required,b.required);}
export function referenceId(source:PedSource,fingerprint:string,name:string,evidence:PedEvidence[]){return digest(JSON.stringify(['gems.ped-reference.v1','peds-meta-v1',source.kind,source.id,fingerprint,name.toLowerCase(),evidence.map(e=>[e.kind,e.sourcePath,e.sourceSha256,e.sourceBytes,e.locator])]));}
export function validateAnalysis(value:unknown):PedReferencesV1{
  const v=object(value,['schema','schemaVersion','source','reportId','inputDigest','parserVersion','analyzedAt','status','references','issues']);sourceKey(v.source);
  if(v.schema!=='gems.ped-references'||v.schemaVersion!==1||!id(v.reportId)||!hex(v.inputDigest)||v.parserVersion!=='peds-meta-v1'||!date(v.analyzedAt)||!['parsed','partial','unsupported'].includes(v.status)||!Array.isArray(v.references)||v.references.length>PED_LIMIT)fail('分析版本、日期或容量无效');
  strings(v.issues,PED_LIMIT,8192);const ids=new Set<string>(),names=new Set<string>(),hashes=new Set<string>();let total=0;
  for(const raw of v.references){const r=object(raw,['referenceId','modelName','hash','kind','parsedPedType','evidence','dependencies'],['thumbnail']);
    if(!hex(r.referenceId)||!token(r.modelName)||!hex(r.hash,8)||pedHash(r.modelName)!==r.hash||!PED_KINDS.includes(r.kind)||r.parsedPedType!==null&&!token(r.parsedPedType)||!Array.isArray(r.evidence)||!r.evidence.length||r.evidence.length>32)fail('人物引用无效');
    r.evidence.forEach(validateEvidence);if(referenceId(v.source,v.inputDigest,r.modelName,r.evidence)!==r.referenceId)fail('人物引用身份不匹配');
    if(r.thumbnail!==undefined)validatePedThumbnail(r.thumbnail);
    if(ids.has(r.referenceId)||names.has(r.modelName.toLowerCase())||hashes.has(r.hash))fail('重复标识或人物hash冲突');ids.add(r.referenceId);names.add(r.modelName.toLowerCase());hashes.add(r.hash);
    if(!Array.isArray(r.dependencies)||r.dependencies.length>96)fail('人物依赖超过96项');r.dependencies.forEach(validateDependency);if(new Set(r.dependencies.map((d:PedDependency)=>JSON.stringify([d.kind,d.identifier]))).size!==r.dependencies.length)fail('依赖重复');total+=r.dependencies.length;if(total>20000)fail('依赖总量超过20000');
  }
  if(Buffer.byteLength(JSON.stringify(v))>PED_BYTES)fail('分析超过2MiB');return v as PedReferencesV1;
}
export function validateUserState(value:unknown,stored=false):PedUserState{
  const v=object(value,['schema','schemaVersion','source','referenceId','favorite','tags','updatedAt']);sourceKey(v.source);
  if(v.schema!=='gems.ped-user-state'||v.schemaVersion!==1||!hex(v.referenceId)||typeof v.favorite!=='boolean'||!(v.updatedAt===null&&!stored||date(v.updatedAt)))fail('人物偏好格式无效');validateTags(v.tags);if(Buffer.byteLength(JSON.stringify(v))>4096)fail('人物偏好超过4KiB');return v as PedUserState;
}
/** JSON.parse alone accepts duplicate keys. Reject them before domain validation. */
export function strictJson(input:string,limit=PED_BYTES):unknown{
  if(typeof input!=='string'||Buffer.byteLength(input)>limit)fail('JSON超过容量限制');let at=0,nodes=0;
  const space=()=>{while(/[\x20\t\r\n]/.test(input[at]??'!'))at++;};
  const string=()=>{const start=at++;for(;at<input.length;at++){if(input[at]==='\\'){at++;continue;}if(input[at]==='"'){at++;return JSON.parse(input.slice(start,at));}}fail('JSON字符串不完整');};
  const value=(depth:number):any=>{if(depth>64||++nodes>100000)fail('JSON结构超限');space();const ch=input[at];
    if(ch==='"')return string();if(ch==='{'){at++;space();const o=Object.create(null),keys=new Set<string>();if(input[at]==='}'){at++;return o;}for(;;){space();if(input[at]!=='"')fail('JSON对象格式无效');const key=string();if(keys.has(key))fail('JSON包含重复字段');keys.add(key);space();if(input[at++]!==':')fail('JSON字段缺少冒号');o[key]=value(depth+1);space();const end=input[at++];if(end==='}')return o;if(end!==',')fail('JSON对象不完整');}}
    if(ch==='['){at++;space();const a:any[]=[];if(input[at]===']'){at++;return a;}for(;;){a.push(value(depth+1));space();const end=input[at++];if(end===']')return a;if(end!==',')fail('JSON数组不完整');}}
    const match=input.slice(at).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);if(!match)fail('JSON值无效');at+=match[0].length;return JSON.parse(match[0]);};
  const result=value(0);space();if(at!==input.length)fail('JSON尾部存在额外内容');return result;
}
