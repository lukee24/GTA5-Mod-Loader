import {safeXml} from './xml';import {MAX_FILES,relativeSafe} from '../core/security';import type {FileEntry} from '../core/types';
interface Operation {source:string;target:string;}
export interface OivPlan {name:string;author?:string;version?:string;operations:Operation[];blockers:string[];}
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function text(value:unknown,label:string,fallback?:string){
 if(value===undefined||value===null||value==='')return fallback;
 if(!['string','number','boolean'].includes(typeof value))throw new Error('OIV '+label+'元数据必须为普通文字');
 const result=String(value).trim();if(result.length>200||/[\x00-\x1f\x7f]/.test(result))throw new Error('OIV '+label+'元数据过长或含控制字符');return result||fallback;
}
export function parseOiv(textXml:string,fallbackName:string):OivPlan{
 const xml=safeXml(textXml),pkg=xml.package,plan:OivPlan={name:fallbackName,operations:[],blockers:[]};
 if(!object(pkg)){plan.blockers.push('OIV 清单缺少唯一的 package 节点');return plan;}
 if(pkg.metadata!==undefined&&!object(pkg.metadata))throw new Error('OIV 元数据格式无效或存在重复块');
 const metadata=pkg.metadata as Record<string,unknown>|undefined;
 plan.name=text(metadata?.name,'名称',fallbackName)!;
 if(metadata?.author!==undefined&&!object(metadata.author))throw new Error('OIV 作者元数据格式无效');
 plan.author=text((metadata?.author as Record<string,unknown>|undefined)?.displayName,'作者');
 if(metadata?.version!==undefined){
  if(!object(metadata.version))throw new Error('OIV 版本元数据格式无效');const {major,minor,tag}=metadata.version;
  if(![major,minor].every(value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=999999))throw new Error('OIV 版本主次号必须为受支持的非负整数');
  const suffix=text(tag,'版本标签');plan.version=major+'.'+minor+(suffix?' '+suffix:'');
 }
 if(Object.keys(pkg).some(key=>!['metadata','colors','content','@_version','@_id','@_target'].includes(key)))plan.blockers.push('OIV package 含未支持的属性或节点，自动安装已阻止');
 if(pkg['@_version']!==undefined&&pkg['@_version']!=='2.2')plan.blockers.push('OIV 声明的包格式版本尚未核对，自动安装已阻止');
 if(pkg['@_target']!==undefined&&pkg['@_target']!=='Five')plan.blockers.push('OIV 声明的目标不是受支持的 GTA V，自动安装已阻止');
 const content=pkg.content;
 if(!object(content)||Object.keys(content).some(key=>key!=='add')||content.add===undefined){plan.blockers.push('OIV 含 RPF、可选组件或未实现操作；自动安装已阻止');return plan;}
 const ops=Array.isArray(content.add)?content.add:[content.add];if(!ops.length||ops.length>MAX_FILES)throw new Error('OIV 操作数量超过支持范围');
 const sources=new Set<string>(),targets=new Set<string>();
 for(const op of ops){
  if(!object(op)||typeof op['@_source']!=='string'||typeof op['#text']!=='string')throw new Error('不支持此 OIV add 操作结构');
  if(Object.keys(op).some(key=>key!=='@_source'&&key!=='#text')){plan.blockers.push('OIV add 含未支持的属性或子节点，自动安装已阻止');continue;}
  const source=relativeSafe('content/'+op['@_source']),target=relativeSafe(op['#text']);if(sources.has(source.toLowerCase())||targets.has(target.toLowerCase()))throw new Error('OIV 包含重复源文件或目标；一源多目标尚未支持');sources.add(source.toLowerCase());targets.add(target.toLowerCase());plan.operations.push({source,target});
 }
 if(plan.blockers.length)plan.operations=[];return plan;
}
export function applyOiv(plan:OivPlan,files:FileEntry[]){
 const index=new Map(files.map(file=>[file.path.toLowerCase(),file]));const resolved=plan.operations.map(operation=>{const file=index.get(operation.source.toLowerCase());if(!file)throw new Error('OIV 源文件不存在：'+operation.source);return{file,target:operation.target};});
 for(const file of files)delete file.target;
 for(const operation of resolved)operation.file.target=operation.target;
}
