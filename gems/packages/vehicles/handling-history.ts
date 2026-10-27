import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {noLinks,sameGamePath} from '../core/security';
import {editHandling} from './handling';
import {handlingFields,type HandlingField} from './handling-fields';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
interface Report {schemaVersion:1;model:string;created:string;original:string;output:string;beforeSha256:string;afterSha256:string;changes:{field:HandlingField;axis?:'x'|'y'|'z';before:number;after:number}[];gameWritten:false;installed:false;}
export interface HandlingHistoryItem {id:string;model:string|null;created:string|null;changes:number|null;issue:string|null;}
export interface HandlingHistoryView {items:HandlingHistoryItem[];observed:number;limited:boolean;notices:string[];checked:string;}
function fingerprint(stat:fs.BigIntStats){return[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.nlink].join(':');}
function read(root:string,file:string,max:number){
 noLinks(root,file);const fd=fs.openSync(file,'r');
 try{const before=fs.fstatSync(fd,{bigint:true});if(!before.isFile()||before.nlink!==1n||before.size>BigInt(max))throw new Error('副本文件不是独立普通文件或超过读取上限');const bytes=Buffer.alloc(Number(before.size));let offset=0;
  while(offset<bytes.length){const size=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(!size)throw new Error('副本文件读取不完整');offset+=size;}
  noLinks(root,file);if(fingerprint(fs.fstatSync(fd,{bigint:true}))!==fingerprint(before)||fingerprint(fs.lstatSync(file,{bigint:true}))!==fingerprint(before))throw new Error('核验读取期间副本文件发生变化');
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new Error('副本文件不是有效UTF-8文本');}
  return{text,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),check(){noLinks(root,file);if(fingerprint(fs.lstatSync(file,{bigint:true}))!==fingerprint(before))throw new Error('核验期间副本文件发生变化，请重新核验');}};
 }finally{fs.closeSync(fd);}
}
export class HandlingHistory {
 constructor(private readonly root:string){}
 private folder(id:unknown){if(typeof id!=='string'||id.length!==36||!uuid.test(id))throw new Error('配置副本标识无效');const folder=path.join(this.root,'handling-edits',id);noLinks(this.root,folder);if(!fs.lstatSync(folder).isDirectory())throw new Error('配置副本目录不存在或类型无效');return folder;}
 private report(id:unknown){const folder=this.folder(id),file=read(this.root,path.join(folder,'report.json'),64*1024);let report:Report;
  try{report=JSON.parse(file.text);}catch{throw new Error('配置副本报告不是有效JSON');}
  if(!report||typeof report!=='object'||Array.isArray(report)||report.schemaVersion!==1||typeof report.model!=='string'||report.model.trim()!==report.model||!/^[-a-z0-9_.]{1,64}$/i.test(report.model)||typeof report.created!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(report.created)||!Number.isFinite(Date.parse(report.created))||new Date(report.created).toISOString()!==report.created||report.gameWritten!==false||report.installed!==false)throw new Error('配置副本报告格式或状态不受支持');
  for(const value of [report.beforeSha256,report.afterSha256])if(typeof value!=='string'||value.length!==64||!/^[a-f0-9]{64}$/i.test(value))throw new Error('配置副本报告摘要无效');
  if(typeof report.original!=='string'||typeof report.output!=='string'||!sameGamePath(report.original,path.join(folder,'original.meta'))||!sameGamePath(report.output,path.join(folder,'handling.meta')))throw new Error('配置副本报告路径与受保护目录不一致');
  if(!Array.isArray(report.changes)||!report.changes.length||report.changes.length>64||report.changes.some(change=>!change||typeof change!=='object'||Array.isArray(change)||typeof change.field!=='string'||!Object.hasOwn(handlingFields,change.field)||typeof change.before!=='number'||!Number.isFinite(change.before)||typeof change.after!=='number'||!Number.isFinite(change.after)||('axis'in change&&!['x','y','z'].includes(change.axis||''))))throw new Error('配置副本修改清单无效');
  return{folder,report,file};
 }
 list():HandlingHistoryView {
  const base=path.join(this.root,'handling-edits');noLinks(this.root,base);const items:HandlingHistoryItem[]=[],notices:string[]=[];let observed=0,limited=false,ignored=0;
  if(!fs.existsSync(base))return{items,observed,limited,notices,checked:new Date().toISOString()};
  const directory=fs.opendirSync(base);try{let entry;while((entry=directory.readSync())){if(observed>=1000){limited=true;break;}observed++;if(entry.name.length!==36||!uuid.test(entry.name)){ignored++;continue;}
    try{const {report}=this.report(entry.name);items.push({id:entry.name,model:report.model,created:report.created,changes:report.changes.length,issue:null});}
    catch{items.push({id:entry.name,model:null,created:null,changes:null,issue:'报告缺失、无效、文件连接或目录不受支持；未核验'});}
  }}finally{directory.closeSync();}noLinks(this.root,base);
  if(ignored)notices.push(ignored+' 项不是受支持的副本目录，未读取');if(limited)notices.push('目录超过1000项读取限额，本次列表不是完整历史');
  items.sort((a,b)=>(b.created||'').localeCompare(a.created||'')||a.id.localeCompare(b.id));if(items.length>100){notices.push('本次只展示前100项副本，未实现完整历史分页');limited=true;}
  return{items:items.slice(0,100),observed,limited,notices,checked:new Date().toISOString()};
 }
 verify(id:unknown){
  const {folder,report,file}=this.report(id),original=read(this.root,path.join(folder,'original.meta'),4*1024**2),output=read(this.root,path.join(folder,'handling.meta'),4*1024**2);
  if(original.sha256!==report.beforeSha256.toLowerCase()||output.sha256!==report.afterSha256.toLowerCase())throw new Error('配置副本或原文快照的SHA-256与报告不一致');
  const expected=editHandling(original.text,report.model,report.changes.map(change=>({field:change.field,axis:change.axis,value:change.after})));
  if(expected.xml!==output.text||expected.changes.some((change,index)=>change.before!==report.changes[index].before))throw new Error('配置副本内容与报告修改清单不一致');
  file.check();original.check();output.check();
  return{id:id as string,model:report.model,changes:report.changes.length,checked:new Date().toISOString(),original:path.join(folder,'original.meta'),output:path.join(folder,'handling.meta'),beforeSha256:original.sha256,afterSha256:output.sha256,validation:'文件哈希与修改清单一致；仅静态核验，游戏兼容及效果待验证',gameWrites:false};
 }
}
export type HandlingHistoryVerification=ReturnType<HandlingHistory['verify']>;
