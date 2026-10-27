import {readTextSnapshot} from './text-snapshot';
import {MAX_FILES,relativeSafe} from '../core/security';
import type {FileEntry} from '../core/types';

export const GEMS_MANIFEST_BYTES=1024**2;
interface Mapping {source:string;target:string;}
export interface GemsManifest {name?:string;author?:string;version?:string;sourceUrl?:string;files:Mapping[];}
export function readGemsManifest(root:string,file:string,expectedHash?:string){return parseGemsManifest(readTextSnapshot(root,file,GEMS_MANIFEST_BYTES,'GEMS 清单',expectedHash));}
function metadata(value:unknown,label:string,max:number){
 if(value===undefined)return undefined;
 if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw new Error('GEMS 清单'+label+'元数据无效、过长或含控制字符');
 return value.trim();
}
export function parseGemsManifest(text:string):GemsManifest{
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>GEMS_MANIFEST_BYTES)throw new Error('GEMS 清单过大');
 let value:any;try{value=JSON.parse(text);}catch{throw new Error('GEMS 清单 JSON 无效');}
 if(!value||typeof value!=='object'||Array.isArray(value)||value.format!==1||!Array.isArray(value.files)||!value.files.length)throw new Error('GEMS 清单格式无效');
 if(value.files.length>MAX_FILES)throw new Error('GEMS 清单操作数量超过'+MAX_FILES+'项');
 const name=metadata(value.name,'名称',200),author=metadata(value.author,'作者',200),version=metadata(value.version,'版本',80),sourceUrl=metadata(value.source,'来源',2000);
 if(sourceUrl){let url:URL;try{url=new URL(sourceUrl);}catch{throw new Error('GEMS 清单来源网址无效');}if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw new Error('GEMS 清单来源须为不含账号密码的HTTPS网址');}
 const files:Mapping[]=[],sources=new Set<string>(),targets=new Set<string>();
 for(const operation of value.files){
  if(!operation||typeof operation!=='object'||Array.isArray(operation)||typeof operation.source!=='string'||typeof operation.target!=='string')throw new Error('GEMS 清单操作格式无效');
  const source=relativeSafe(operation.source),target=relativeSafe(operation.target),sourceKey=source.toLowerCase(),targetKey=target.toLowerCase();
  if(sources.has(sourceKey)||targets.has(targetKey))throw new Error('GEMS 清单包含重复源文件或目标');sources.add(sourceKey);targets.add(targetKey);files.push({source,target});
 }
 return{name,author,version,sourceUrl,files};
}
/** Resolve every mapping before replacing any inferred targets. Extra JSON fields
 * are never executed and package metadata is not proof of authorship/licensing.
 */
export function applyGemsManifest(manifest:GemsManifest,files:FileEntry[]){
 const index=new Map(files.map(file=>[file.path.toLowerCase(),file])),resolved=manifest.files.map(mapping=>{
  const file=index.get(mapping.source.toLowerCase());if(!file)throw new Error('GEMS 清单源文件不存在：'+mapping.source);return{file,target:mapping.target};
 });
 for(const file of files)delete file.target;
 for(const operation of resolved)operation.file.target=operation.target;
}
