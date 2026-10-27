import fs from 'node:fs';
import type {ImportReport,FileEntry} from '../core/types';
import {safeXml} from '../scanner/xml';
import {readTextSnapshot} from '../scanner/text-snapshot';
import {relativeSafe} from '../core/security';
import type {WeaponReference,WeaponEvidence,WeaponReferencesV1,WeaponSource} from './types';
import {canonicalGameRoot,digest,fail,inputDigest,object,strictJson,strings,token,validateAnalysis,weaponHash,WEAPON_LIMIT} from './validation';

const list=(v:any):any[]=>v===undefined||v===''?[]:Array.isArray(v)?v:[v];
const explicitComponents=new WeakSet<WeaponReference>();
function readSource(root:string,file:FileEntry,limit:number,label:'XML'|'GEMS 清单'){
  const actualRoot=canonicalGameRoot(fs.realpathSync.native(root)),actualFile=canonicalGameRoot(fs.realpathSync.native(file.source));
  if(!actualFile.startsWith(actualRoot.endsWith('\\')?actualRoot:actualRoot+'\\'))fail('配置实际路径不在资料根目录内');
  return readTextSnapshot(root,file.source,limit,label,file.hash);
}
function xmlObject(v:any,label:string){if(!v||typeof v!=='object'||Array.isArray(v))fail(label+'必须是唯一节点');return v;}
function symbol(value:any,label:string,optional=false):string|undefined{if(optional&&(value===undefined||value===''))return undefined;if(!token(value))fail(label+'不是受支持的单个标识');return value;}
function reference(name:string,evidence:WeaponEvidence,symbols:WeaponReference['symbols'],kind:WeaponReference['kind']='unknown'):WeaponReference{
  const dependencies:WeaponReference['dependencies']=[];
  for(const key of ['model','ammo'] as const)if(symbols[key])dependencies.push({kind:key,identifier:symbols[key]!,origin:'parsed-reference',required:'unknown'});
  for(const component of symbols.components)dependencies.push({kind:'component',identifier:component,origin:'parsed-reference',required:'unknown'});
  return {referenceId:'',weaponName:name,hash:weaponHash(name),kind,evidence:[evidence],symbols,dependencies};
}
/** Exact recognized structure only; never infer a weapon identifier from a filename. */
export function parseWeaponMeta(xml:string,file:Pick<FileEntry,'path'|'hash'|'size'>):WeaponReference[]{
  const parsed=safeXml(xml);if(!parsed||typeof parsed!=='object')fail('XML根无效');
  if(!Object.prototype.hasOwnProperty.call(parsed,'CWeaponInfoBlob'))return [];
  if(Object.keys(parsed).some(k=>k!=='CWeaponInfoBlob'&&k!=='?xml'))fail('武器XML存在多个根');
  const root=xmlObject(parsed.CWeaponInfoBlob,'CWeaponInfoBlob');if(Object.keys(root).some(k=>k.startsWith('@_xmlns')))fail('武器XML命名空间未支持');
  const infos=xmlObject(root.Infos,'CWeaponInfoBlob/Infos'),result:WeaponReference[]=[];
  for(const [groupIndex,rawGroup] of list(infos.Item).entries()){
    const group=xmlObject(rawGroup,'Infos/Item');if(group.Infos===''||group.Infos===undefined)continue;
    const inner=xmlObject(group.Infos,'Infos/Item/Infos');
    for(const [itemIndex,rawItem] of list(inner.Item).entries()){
      const item=xmlObject(rawItem,'武器信息Item');if(item['@_type']!=='CWeaponInfo')continue;
      const name=symbol(item.Name,'武器Name')!,components:string[]=[];
      if(item.AttachPoints!==undefined&&item.AttachPoints!=='')for(const rawAttach of list(xmlObject(item.AttachPoints,'AttachPoints').Item)){
        const attach=xmlObject(rawAttach,'AttachPoints/Item');if(attach.Components===undefined||attach.Components==='')continue;
        for(const rawComponent of list(xmlObject(attach.Components,'Components').Item))components.push(symbol(xmlObject(rawComponent,'Components/Item').Name,'组件Name')!);
      }
      if(components.length>256)fail('组件引用超过256项');
      let ammo:string|undefined;if(item.AmmoInfo!==undefined&&item.AmmoInfo!=='')ammo=symbol(xmlObject(item.AmmoInfo,'AmmoInfo')['@_ref'],'AmmoInfo ref',true);
      const symbols:WeaponReference['symbols']={components};for(const [key,value] of [['model',item.Model],['slot',item.Slot]] as const){const found=symbol(value,key,true);if(found)symbols[key]=found;}if(ammo)symbols.ammo=ammo;
      const ref=reference(name,{kind:'weapons-meta',sourcePath:file.path,sourceSha256:file.hash,sourceBytes:file.size,locator:`CWeaponInfoBlob/Infos/Item[${groupIndex}]/Infos/Item[${itemIndex}]`},symbols);explicitComponents.add(ref);result.push(ref);
      if(result.length>WEAPON_LIMIT)fail('武器引用超过2000项');
    }
  }
  return result;
}
function manifestReferences(text:string,file:FileEntry,report:ImportReport):WeaponReference[]{
  const manifest=strictJson(text,1024**2) as any;if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))fail('GEMS清单格式无效');
  if(manifest.weaponReferences===undefined)return [];
  if(manifest.format!==1)fail('武器声明的安装清单版本未支持');
  const block=object(manifest.weaponReferences,['schemaVersion','entries']);if(block.schemaVersion!==1||!Array.isArray(block.entries)||block.entries.length>WEAPON_LIMIT)fail('武器声明版本或条数无效');
  return block.entries.map((raw:any,index:number)=>{
    const entry=object(raw,['weaponName','kind','sourceFiles','model','slot','ammo','components','dependencies']);
    if(!token(entry.weaponName)||!['addon','replace','unknown'].includes(entry.kind))fail('清单武器标识或类型无效');
    const files=strings(entry.sourceFiles,32,4096);if(!files.length||new Set(files.map(f=>f.toLowerCase())).size!==files.length)fail('声明来源为空或重复');
    for(const name of files){relativeSafe(name);if(!report.files.some(f=>f.path===name))fail('声明来源文件不存在：'+name);}
    const symbols:WeaponReference['symbols']={components:entry.components===undefined?[]:strings(entry.components,256,64)};
    for(const key of ['model','slot','ammo'] as const){const value=symbol(entry[key],key,true);if(value)symbols[key]=value;}
    const ref=reference(entry.weaponName,{kind:'manifest-declaration',sourcePath:file.path,sourceSha256:file.hash,sourceBytes:file.size,locator:'weaponReferences.entries['+index+']'},symbols,entry.kind);
    if(entry.components!==undefined)explicitComponents.add(ref);
    ref.dependencies=[...ref.dependencies.map(d=>({...d,origin:'manifest-declaration' as const})),...files.map(identifier=>({kind:'file' as const,identifier,origin:'manifest-declaration' as const,required:'declared' as const}))];
    if(entry.dependencies!==undefined){if(!Array.isArray(entry.dependencies)||entry.dependencies.length>32)fail('显式依赖超过32项');for(const d of entry.dependencies){object(d,['kind','identifier']);if(!['dlc','runtime','file'].includes(d.kind)||typeof d.identifier!=='string')fail('显式依赖无效');ref.dependencies.push({...d,origin:'manifest-declaration',required:'declared'});}}
    return ref;
  });
}
export function analyzeReportWeaponReferences(root:string,report:ImportReport,source:WeaponSource):WeaponReferencesV1{
  const refs:WeaponReference[]=[],issues:string[]=[],fingerprint=inputDigest(report);let candidateCount=0;
  const candidates=report.files.filter(file=>/\.meta$/i.test(file.path)||file.path.toLowerCase()==='gems.mod.json');
  if(candidates.length>2000||candidates.reduce((sum,file)=>sum+file.size,0)>32*1024**2)fail('配置分析超过2000个文件或32MiB，旧索引未覆盖');
  for(const file of report.files){
    if(/\.rpf$/i.test(file.path))issues.push('RPF内武器配置尚未解析：'+file.path);
    if(/\.meta$/i.test(file.path)){
      candidateCount++;if(file.size>4*1024**2)fail('meta超过4MiB，未覆盖旧分析：'+file.path);
      const xml=readSource(root,file,4*1024**2,'XML');refs.push(...parseWeaponMeta(xml,file));
    }
    if(file.path.toLowerCase()==='gems.mod.json')refs.push(...manifestReferences(readSource(root,file,1024**2,'GEMS 清单'),file,report));
    if(refs.length>WEAPON_LIMIT)fail('武器引用超过2000项');
  }
  // Same-name declarations may corroborate XML. Conflicting facts never win by order.
  const byName=new Map<string,WeaponReference>();
  for(const ref of refs){const key=ref.weaponName.toLowerCase(),previous=byName.get(key);if(!previous){byName.set(key,ref);continue;}
    if(previous.evidence.some(e=>e.kind==='weapons-meta')&&ref.evidence.some(e=>e.kind==='weapons-meta'))fail('多个配置定义同一武器：'+ref.weaponName);
    for(const field of ['model','slot','ammo'] as const)if(previous.symbols[field]&&ref.symbols[field]&&previous.symbols[field]!.toLowerCase()!==ref.symbols[field]!.toLowerCase())fail('配置与声明冲突：'+ref.weaponName+'/'+field);
    if(explicitComponents.has(previous)&&explicitComponents.has(ref)&&JSON.stringify(previous.symbols.components.map(v=>v.toLowerCase()).sort())!==JSON.stringify(ref.symbols.components.map(v=>v.toLowerCase()).sort()))fail('配置与声明组件冲突：'+ref.weaponName);
    if(previous.kind!=='unknown'&&ref.kind!=='unknown'&&previous.kind!==ref.kind)fail('重复声明类型冲突');
    if(previous.evidence.some(e=>e.kind==='manifest-declaration')&&ref.evidence.some(e=>e.kind==='manifest-declaration'))fail('重复武器声明：'+ref.weaponName);
    previous.evidence.push(...ref.evidence);previous.kind=previous.kind==='unknown'?ref.kind:previous.kind;
    const components=new Map([...previous.symbols.components,...ref.symbols.components].map(value=>[value.toLowerCase(),value]));
    previous.symbols={...ref.symbols,...previous.symbols,components:[...components.values()]};previous.dependencies.push(...ref.dependencies);if(explicitComponents.has(ref))explicitComponents.add(previous);
  }
  const references=[...byName.values()];for(const ref of references)ref.referenceId=digest(JSON.stringify([source.kind,source.id,fingerprint,ref.weaponName.toLowerCase(),ref.evidence]));
  if(!references.length)issues.push(candidateCount?'未从受支持的明确配置节点或清单识别武器；未按文件名猜测':'尚无可解析武器配置或明确声明');
  return validateAnalysis({schema:'gems.weapon-references',schemaVersion:1,source,reportId:report.id,inputDigest:fingerprint,parserVersion:'weapons-meta-v1',analyzedAt:new Date().toISOString(),status:references.length?(issues.length?'partial':'parsed'):'unsupported',references,issues});
}
