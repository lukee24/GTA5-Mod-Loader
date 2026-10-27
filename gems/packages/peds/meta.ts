import fs from 'node:fs';
import type {ImportReport,FileEntry} from '../core/types';
import {safeXml} from '../scanner/xml';
import {readTextSnapshot} from '../scanner/text-snapshot';
import {relativeSafe} from '../core/security';
import {inspectPedThumbnail} from './thumbnail';
import type {PedReference,PedEvidence,PedReferencesV1,PedSource,PedDependency} from './types';
import {canonicalGameRoot,fail,inputDigest,object,strictJson,strings,token,text,validateAnalysis,validateDependency,pedHash,PED_LIMIT,PED_KINDS,evidenceOrder,dependencyOrder,referenceId,ordinal} from './validation';
const list=(v:any):any[]=>v===undefined||v===''?[]:Array.isArray(v)?v:[v];
function readSource(root:string,file:FileEntry,limit:number,label:'XML'|'GEMS 清单'){
  const actualRoot=canonicalGameRoot(fs.realpathSync.native(root)),actualFile=canonicalGameRoot(fs.realpathSync.native(file.source));
  if(!actualFile.startsWith(actualRoot.endsWith('\\')?actualRoot:actualRoot+'\\'))fail('配置实际路径不在资料根目录内');
  return readTextSnapshot(root,file.source,limit,label,file.hash);
}
function xmlObject(v:any,label:string){if(!v||typeof v!=='object'||Array.isArray(v))fail(label+'必须是唯一节点');if(Object.keys(v).some(k=>k.startsWith('@_xmlns')))fail('人物XML命名空间未支持');return v;}
function reference(name:string,evidence:PedEvidence,kind:PedReference['kind']='unknown'):PedReference{return{referenceId:'',modelName:name,hash:pedHash(name),kind,parsedPedType:null,evidence:[evidence],dependencies:[]};}
const symbols:[string,PedDependency['kind']][]=[['PropsName','props'],['ClipDictionaryName','clip-dictionary'],['ExpressionDictionaryName','expression-dictionary'],['CreatureMetadataName','creature-metadata'],['MovementClipSet','movement-clip-set']];
/** Only explicitly recognized XML nodes supply model identifiers; filenames never do. */
export function parsePedMeta(xml:string,file:Pick<FileEntry,'path'|'hash'|'size'>):PedReference[]{
  if(xml.charCodeAt(0)===0xfeff)fail('人物XML不接受BOM');
  const parsed=safeXml(xml);if(!parsed||typeof parsed!=='object')fail('XML根无效');
  if(!Object.prototype.hasOwnProperty.call(parsed,'CPedModelInfo__InitDataList'))return [];
  if(Object.keys(parsed).some(k=>k!=='CPedModelInfo__InitDataList'&&k!=='?xml'))fail('人物XML存在多个根');
  const root=xmlObject(parsed.CPedModelInfo__InitDataList,'CPedModelInfo__InitDataList');if(Object.keys(root).some(k=>k.startsWith('@_xmlns')))fail('人物XML命名空间未支持');
  const infos=xmlObject(root.InitDatas,'InitDatas'),result:PedReference[]=[];
  for(const [index,raw] of list(infos.Item).entries()){
    const item=xmlObject(raw,'InitDatas/Item');if(!token(item.Name))fail('人物Name不是受支持的单个标识');
    const ref=reference(item.Name,{kind:'peds-meta',sourcePath:file.path,sourceSha256:file.hash,sourceBytes:file.size,locator:'CPedModelInfo__InitDataList/InitDatas/Item['+(index+1)+']/Name'});
    if(item.Pedtype!==undefined&&item.Pedtype!==''){if(!token(item.Pedtype))fail('Pedtype不是受支持的单个标识');ref.parsedPedType=item.Pedtype;}
    for(const [field,kind] of symbols){const value=item[field];if(value===undefined||value==='')continue;if(!text(value,128))fail(field+'依赖符号无效');ref.dependencies.push({kind,identifier:value,origin:'parsed-reference',required:'unknown'});}
    result.push(ref);if(result.length>PED_LIMIT)fail('人物引用超过2000项');
  }
  return result;
}
function manifestReferences(root:string,rawText:string,file:FileEntry,report:ImportReport):PedReference[]{
  const manifest=strictJson(rawText,1024**2) as any;if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))fail('GEMS清单格式无效');
  if(manifest.pedReferences===undefined)return [];if(manifest.format!==1)fail('人物声明清单版本未支持');
  const block=object(manifest.pedReferences,['schemaVersion','entries']);if(block.schemaVersion!==1||!Array.isArray(block.entries)||block.entries.length>PED_LIMIT)fail('人物声明版本或条数无效');
  return block.entries.map((raw:any,index:number)=>{
    const entry=object(raw,['modelName','kind','sourceFiles'],['dependencies','thumbnail']);
    if(!token(entry.modelName)||!PED_KINDS.includes(entry.kind))fail('清单人物标识或类型无效');
    const files=strings(entry.sourceFiles,32,4096);if(!files.length||new Set(files.map(f=>f.toLowerCase())).size!==files.length)fail('声明来源为空或重复');
    for(const name of files){if(relativeSafe(name)!==name)fail('声明来源路径无效');if(!report.files.some(f=>f.path===name))fail('声明来源文件不存在：'+name);}
    const ref=reference(entry.modelName,{kind:'manifest-declaration',sourcePath:file.path,sourceSha256:file.hash,sourceBytes:file.size,locator:'pedReferences.entries['+index+']'},entry.kind);
    ref.dependencies=files.map(identifier=>({kind:'file',identifier,origin:'manifest-declaration',required:'declared'}));
    if(entry.thumbnail!==undefined){if(!text(entry.thumbnail,4096)||relativeSafe(entry.thumbnail)!==entry.thumbnail)fail('缩略图声明路径无效');const image=report.files.find(f=>f.path===entry.thumbnail);if(!image)fail('缩略图来源文件不存在');ref.thumbnail=inspectPedThumbnail(root,image);}
    if(entry.dependencies!==undefined){if(!Array.isArray(entry.dependencies)||entry.dependencies.length>32)fail('显式依赖超过32项');for(const raw of entry.dependencies){const d=object(raw,['kind','identifier']);if(!['dlc','runtime','file'].includes(d.kind))fail('显式依赖类型无效');ref.dependencies.push(validateDependency({...d,origin:'manifest-declaration',required:'declared'}));}}
    return ref;
  });
}
export function analyzeReportPedReferences(root:string,report:ImportReport,source:PedSource):PedReferencesV1{
  const refs:PedReference[]=[],issues:string[]=[],fingerprint=inputDigest(report);let candidateCount=0;
  const candidates=report.files.filter(f=>/\.meta$/i.test(f.path)||f.path.toLowerCase()==='gems.mod.json');
  if(candidates.length>2000||candidates.reduce((sum,f)=>sum+f.size,0)>32*1024**2)fail('配置分析超过2000个文件或32MiB，旧索引未覆盖');
  for(const file of report.files){
    if(/\.(rpf|ymt|ydd|ytd)$/i.test(file.path))issues.push('资源尚未解析为人物或服装资料，未按文件名推导模型：'+file.path);
    if(/\.meta$/i.test(file.path)){candidateCount++;if(file.size>4*1024**2)fail('meta超过4MiB');refs.push(...parsePedMeta(readSource(root,file,4*1024**2,'XML'),file));}
    if(file.path.toLowerCase()==='gems.mod.json')refs.push(...manifestReferences(root,readSource(root,file,1024**2,'GEMS 清单'),file,report));
    if(refs.length>PED_LIMIT)fail('人物引用超过2000项');
  }
  const byName=new Map<string,PedReference>();
  for(const ref of refs){const key=ref.modelName.toLowerCase(),previous=byName.get(key);if(!previous){byName.set(key,ref);continue;}
    if(previous.modelName!==ref.modelName)fail('大小写别名定义冲突：'+ref.modelName);
    if(previous.evidence.some(e=>e.kind==='peds-meta')&&ref.evidence.some(e=>e.kind==='peds-meta'))fail('多个配置定义同一人物：'+ref.modelName);
    if(previous.evidence.some(e=>e.kind==='manifest-declaration')&&ref.evidence.some(e=>e.kind==='manifest-declaration'))fail('重复人物声明：'+ref.modelName);
    if(previous.kind!=='unknown'&&ref.kind!=='unknown'&&previous.kind!==ref.kind)fail('重复声明类型冲突');
    previous.evidence.push(...ref.evidence);previous.kind=previous.kind==='unknown'?ref.kind:previous.kind;previous.parsedPedType=previous.parsedPedType??ref.parsedPedType;previous.dependencies.push(...ref.dependencies);if(ref.thumbnail)previous.thumbnail=ref.thumbnail;
  }
  const references=[...byName.values()].sort((a,b)=>ordinal(a.modelName,b.modelName));
  for(const ref of references){ref.evidence.sort(evidenceOrder);ref.dependencies=[...new Map(ref.dependencies.map(d=>[JSON.stringify([d.kind,d.identifier]),d])).values()].sort(dependencyOrder);ref.referenceId=referenceId(source,fingerprint,ref.modelName,ref.evidence);}
  if(!references.length)issues.push(candidateCount?'未从受支持的明确节点或清单识别人物；未按文件名猜测':'尚无可解析人物配置或明确声明');
  return validateAnalysis({schema:'gems.ped-references',schemaVersion:1,source,reportId:report.id,inputDigest:fingerprint,parserVersion:'peds-meta-v1',analyzedAt:new Date().toISOString(),status:references.length?(issues.length?'partial':'parsed'):'unsupported',references,issues});
}
