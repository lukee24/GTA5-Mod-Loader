import path from 'node:path';
import type {Store} from '../database';
import {relativeSafe} from '../core/security';
import {validatedRetryReceipt} from './download-retry';
import type {DownloadRecord} from './types';

const states=['排队中','下载中','正在扫描','已分析','失败','已取消','已中断'];
function id(value:unknown){return typeof value==='string'&&value.length<=80&&/^[-a-z0-9_]+$/i.test(value);}
function string(value:unknown,max:number){return typeof value==='string'&&value.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);}
export function validateDownloadRecord(key:unknown,input:unknown):DownloadRecord{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('下载文档不是对象');
 // Includes unknown historical fields: retain them only when their structure is safe to clone/serialize.
 const stack=[{value:input,depth:0}];let nodes=0;
 while(stack.length){const {value,depth}=stack.pop()!;if(++nodes>4096||depth>32)throw new Error('下载文档节点/深度超过上限');if(value&&typeof value==='object')for(const child of Object.values(value))stack.push({value:child,depth:depth+1});}
 const record=input as DownloadRecord;
 if(!id(key)||record.id!==key||!string(record.name,180)||relativeSafe(record.name)!==record.name||record.name.includes('/')||! /\.(zip|oiv|oivs)$/i.test(record.name))throw new Error('下载标识或文件名无效');
 if(!states.includes(record.status)||!Number.isSafeInteger(record.received)||record.received<0||record.size!==null&&(!Number.isSafeInteger(record.size)||record.size<1||record.size>1024**3))throw new Error('下载状态或容量无效');
 if(!string(record.created,40)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(record.created)||(!Number.isFinite(Date.parse(record.created))||new Date(record.created).toISOString()!==record.created.replace(/(?:\.(\d{1,3}))?Z$/,(_,fraction:string)=>'.'+(fraction||'').padEnd(3,'0')+'Z')))throw new Error('下载时间无效');
 if(!string(record.sourceUrl,2000))throw new Error('下载来源无效');const source=new URL(record.sourceUrl);
 if(source.protocol!=='https:'||source.username||source.password||source.port||source.search||source.hash)throw new Error('下载来源无效');
 for(const field of ['retryOf','retryRoot','reportId'] as const)if(record[field]!==undefined&&!id(record[field]))throw new Error('下载关联标识无效');
 if(record.sha256!==undefined&&(typeof record.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(record.sha256)))throw new Error('下载摘要无效');
 for(const field of ['error','checksum'] as const)if(record[field]!==undefined&&!string(record[field],500))throw new Error('下载说明无效');
 if(record.file!==undefined&&(!string(record.file,32768)||!path.isAbsolute(record.file)))throw new Error('下载文件路径无效');
 if(record.retryAsset!==undefined)validatedRetryReceipt(record.retryAsset);
 return record;
}
/** Read-only admission. Never delete or invent replacement data for a rejected document. */
export function readDownloadRecords(store:Store){
 const {total,rows,truncated}=store.downloadRows(),records:DownloadRecord[]=[],issues:string[]=[];
 if(total>10000)issues.push('下载历史超过10000条，只展示受限近期记录');if(truncated)issues.push('下载文档合计超过16 MiB读取上限');
 let invalid=0;for(const row of rows){try{if(row.json===null)throw new Error('文档容量或类型无效');records.push(validateDownloadRecord(row.id,JSON.parse(row.json)));}catch{invalid++;}}
 if(invalid)issues.push(invalid+' 条下载记录的类型、结构、字段或容量无法确认；原数据保留');
 return{records,issues,total};
}
