import fs from 'node:fs';
import path from 'node:path';
import type {Store} from '../database';
import {databaseFileHash,noDatabaseJournals} from '../database/file-state';
import type {ModRecord,Transaction} from '../core/types';
import {readMods} from '../installer/mod-records';
import {readTransactions} from '../installer/recovery-records';
import {assertEnabledOwnership} from '../installer/ownership-integrity';
import {inside,noLinks,inspectFileHash} from '../core/security';
import {validateTarget} from '../installer/target-policy';
import {readTextSnapshot} from '../scanner/text-snapshot';
import {readPedReferenceIndex,assertPedIndexCollection} from './index';
import {analyzeReportPedReferences} from './meta';
import {listPedUserStates} from './user-state';
import {canonicalGameRoot,digest,fail,gameRootId,PED_LIMIT,ordinal} from './validation';
import {pedCatalogRevision,pedCatalogText} from '../bridge/ped-catalog';
import type {PreparedPedCatalog,PedCatalogCheck,PedCatalogV1,PedFileState,PedReference,PedReferencesV1} from './types';

type SourceSnapshot={path:string;hash:string;limit:number;identity:string;text:boolean};
type FileSnapshot={target:string;identity:string|null};
type Budget={bytes:number;started:number};
type SourceBudget={textFiles:number;textBytes:number;assetFiles:number;assetBytes:number};
const snapshots=new WeakMap<PreparedPedCatalog,{store:Store;database:string;root:string;rootStamp:string;exeStamp:string;payload:string;checks:PedCatalogCheck[];files:FileSnapshot[];sources:SourceSnapshot[]}>();
const pending=(tx:Transaction)=>['准备中','执行中','恢复待处理'].includes(tx.state);
function stamp(file:string){const s=fs.lstatSync(file,{bigint:true});return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.nlink].join(':');}
function time(budget:{started:number}){if(performance.now()-budget.started>60000)fail('目录文件核验超过60秒，请缩小本次目录；未截断或导出');}
function consume(budget:Budget,bytes:number){time(budget);budget.bytes+=bytes;if(budget.bytes>2*1024**3)fail('目录文件核验超过2GiB，未截断或导出');}
function consumeSource(budget:SourceBudget,text:boolean,bytes:number){
  if(text){budget.textFiles++;budget.textBytes+=bytes;if(budget.textFiles>2000||budget.textBytes>32*1024**2)fail('导出配置来源核验超过2000个文件或32MiB');}
  else{budget.assetFiles++;budget.assetBytes+=bytes;if(budget.assetFiles>20000||budget.assetBytes>2*1024**3)fail('导出资产来源核验超过20000个文件或2GiB');}
}
export function resolvePedGameRoot(input:string){
  if(typeof input!=='string'||!path.isAbsolute(input))fail('请选择实际游戏绝对目录');noLinks(path.parse(input).root,input);
  if(!fs.lstatSync(input).isDirectory())fail('游戏路径不是目录');const resolved=fs.realpathSync.native(input);noLinks(path.parse(resolved).root,resolved);
  const root=canonicalGameRoot(resolved),exe=path.join(root,'GTA5_Enhanced.exe');noLinks(root,exe);const s=fs.lstatSync(exe);if(!s.isFile()||s.nlink!==1)fail('目标目录没有独立的Enhanced程序文件');
  return{root,rootStamp:stamp(root),exeStamp:stamp(exe)};
}
function databaseFingerprint(store:Store){noDatabaseJournals(store.root);const current=digest(store.db.export());if(databaseFileHash(store.root)!==current)fail('数据库磁盘文件与当前会话不一致，请重启核对');return current+':'+stamp(path.join(store.root,'gems.sqlite'));}
function matchingRoot(tx:Transaction,root:string){try{noLinks(path.parse(tx.gamePath).root,tx.gamePath);return canonicalGameRoot(fs.realpathSync.native(tx.gamePath))===root;}catch{return false;}}
function analysisFacts(value:PedReferencesV1){const {analyzedAt,...facts}=value;return JSON.stringify(facts);}
function resolvedFileWithin(root:string,file:string){const actualRoot=canonicalGameRoot(fs.realpathSync.native(root)),actualFile=canonicalGameRoot(fs.realpathSync.native(file));if(!actualFile.startsWith(actualRoot.endsWith('\\')?actualRoot:actualRoot+'\\'))fail('文件实际路径不在已核验目录内');noLinks(actualRoot,actualFile);}
async function readSource(store:Store,source:Omit<SourceSnapshot,'identity'>,budget:{started:number}):Promise<SourceSnapshot>{
  time(budget);noLinks(store.root,source.path);resolvedFileWithin(store.root,source.path);const identity=stamp(source.path);
  if(source.text)readTextSnapshot(store.root,source.path,source.limit,source.limit===1024**2?'GEMS 清单':'XML',source.hash);
  else{const stat=fs.lstatSync(source.path);if(!stat.isFile()||stat.nlink!==1||stat.size!==source.limit)fail('声明来源资产大小或文件类型变化');const result=await inspectFileHash(source.path,{expectedBytes:source.limit});if(result.hash!==source.hash)fail('声明来源资产与扫描摘要不一致');}
  time(budget);noLinks(store.root,source.path);if(stamp(source.path)!==identity)fail('来源文件身份在核验期间变化');return{...source,identity};
}
async function inspectTarget(root:string,target:string,budget:Budget):Promise<{hash:string|null;identity:string|null}>{
  const file=inside(root,target);noLinks(root,file);let size:number,identity:string;
  try{const s=fs.lstatSync(file);if(!s.isFile()||s.nlink!==1)fail('安装目标不是独立普通文件：'+target);resolvedFileWithin(root,file);size=s.size;identity=stamp(file);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{hash:null,identity:null};throw error;}
  consume(budget,size);const result=await inspectFileHash(file,{expectedBytes:size});noLinks(root,file);if(stamp(file)!==identity)fail('安装目标身份在核验期间变化：'+target);time(budget);return{hash:result.hash,identity};
}
function verifyIdentities(root:string,files:FileSnapshot[]){for(const file of files){const full=inside(root,file.target);noLinks(root,full);let identity:string|null=null;try{identity=stamp(full);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(identity!==file.identity)fail('文件集合核验期间安装目标身份变化：'+file.target);}}
async function inspectMod(mod:ModRecord,transactions:Transaction[],owners:Map<string,string>,root:string,checks:PedCatalogCheck[],files:FileSnapshot[],budget:Budget):Promise<{state:PedFileState;issues:string[]}>{
  if(mod.status==='已停用')return{state:'disabled',issues:['该模组已停用']};if(mod.status==='已卸载')return{state:'uninstalled',issues:['该模组已卸载']};
  const tx=transactions.find(t=>t.id===mod.transactionId&&t.modId===mod.id);if(!tx)return{state:'unverified',issues:['启用记录缺少对应安装事务']};
  if(!matchingRoot(tx,root))return{state:'unverified',issues:['安装事务属于另一游戏目录或目录无法核验']};
  if(tx.state!=='已完成')return{state:'pending',issues:['安装事务尚未完成或仍待恢复']};
  const changes=tx.changes.filter(c=>c.after!==null);if(!changes.length)return{state:'unverified',issues:['事务没有可核验的安装文件']};
  if(checks.length+changes.length>20000)fail('目录文件核验超过20000项，未截断');
  let state:PedFileState='verified';const issues:string[]=[];
  for(const change of changes){time(budget);const target=validateTarget(change.target,tx.trustedRestore===true);noLinks(root,inside(root,target));
    if(transactions.some(t=>pending(t)&&t.changes.some(c=>c.target.toLowerCase()===target.toLowerCase()))){state='pending';issues.push('文件存在待恢复事务：'+target);continue;}
    if(owners.get(target.toLowerCase())!==tx.id){state='shadowed';issues.push('文件当前由其他启用事务占用或缺少已应用记录：'+target);continue;}
    const actual=await inspectTarget(root,target,budget),result:PedFileState=actual.hash===null?'missing':actual.hash!==change.after?'changed':'verified';
    checks.push({target,expectedHash:change.after!,observedHash:actual.hash,state:result});files.push({target,identity:actual.identity});
    if(result!=='verified'){state=result;issues.push('安装文件'+(result==='missing'?'缺失':'内容已变化')+'：'+target);}
    if(issues.length>60)fail('单模组核验问题超过60项，未截断');
  }
  if(mod.report.blockers.length){state='unverified';issues.push('导入报告仍存在安装/兼容阻塞，目录不能解除：'+mod.report.blockers.join('；'));}
  return{state,issues};
}
/** A verified whole MOD is insufficient if the referenced source was not installed by it. */
function referenceInstalled(ref:PedReference,mod:ModRecord,tx:Transaction|undefined){
  const sourcePaths=[...ref.evidence.filter(e=>e.kind==='peds-meta').map(e=>e.sourcePath),...ref.dependencies.filter(d=>d.kind==='file'&&d.origin==='manifest-declaration').map(d=>d.identifier)];
  return sourcePaths.length>0&&sourcePaths.every(source=>{const file=mod.report.files.find(f=>f.path===source);return file?.target&&tx?.changes.some(c=>c.applied&&c.target.toLowerCase()===file.target!.toLowerCase()&&c.after===file.hash);});
}
export async function preparePedCatalog(store:Store,gamePath:string):Promise<PreparedPedCatalog>{
  assertPedIndexCollection(store);
  const game=resolvePedGameRoot(gamePath),database=databaseFingerprint(store),mods=readMods(store),allTransactions=readTransactions(store);assertEnabledOwnership(mods,allTransactions);
  const transactions=allTransactions.filter(tx=>matchingRoot(tx,game.root)),enabled=new Map(mods.filter(m=>m.status==='已启用').map(m=>[m.id,m.transactionId])),owners=new Map<string,string>();
  // Transactions are returned in descending persisted row order, the existing install-layer order.
  for(const tx of transactions)if(enabled.get(tx.modId)===tx.id)for(const change of tx.changes)if(change.applied&&change.after!==null&&!owners.has(change.target.toLowerCase()))owners.set(change.target.toLowerCase(),tx.id);
  const peds:PedCatalogV1['peds']=[],issues:string[]=[],checks:PedCatalogCheck[]=[],files:FileSnapshot[]=[],sources:SourceSnapshot[]=[],sourceNames=new Map<string,{hash:string;bytes:number;text:boolean}>(),budget={bytes:0,started:performance.now()},sourceBudget:SourceBudget={textFiles:0,textBytes:0,assetFiles:0,assetBytes:0};
  for(const mod of mods){time(budget);const view=readPedReferenceIndex(store,{kind:'mod',id:mod.id});
    if(view.status!=='current'||!view.analysis){if(mod.report.categories.includes('人物'))issues.push(mod.report.name+'：'+view.status+'，没有可用的当前人物索引');continue;}
    const analysis=view.analysis;if(!analysis.references.length){issues.push(mod.report.name+'：未识别可用人物标识');continue;}
    const declaredFiles=new Set(analysis.references.flatMap(r=>[...r.dependencies.filter(d=>d.kind==='file').map(d=>d.identifier),...(r.thumbnail?[r.thumbnail.sourcePath]:[])]));
    const nextSources:Omit<SourceSnapshot,'identity'>[]=[];
    for(const file of mod.report.files.filter(f=>/\.meta$/i.test(f.path)||f.path.toLowerCase()==='gems.mod.json'||declaredFiles.has(f.path))){
      time(budget);const isText=/\.meta$/i.test(file.path)||file.path.toLowerCase()==='gems.mod.json',known=sourceNames.get(file.source);
      if(known){if(known.hash!==file.hash||known.bytes!==file.size||known.text!==isText)fail('同一路径的来源快照声明不一致');continue;}
      consumeSource(sourceBudget,isText,file.size);sourceNames.set(file.source,{hash:file.hash,bytes:file.size,text:isText});
      nextSources.push({path:file.source,hash:file.hash,limit:isText?(file.path.toLowerCase()==='gems.mod.json'?1024**2:4*1024**2):file.size,text:isText});
    }
    // Admit this MOD's aggregate budget before streaming any of its asset contents.
    for(const source of nextSources)sources.push(await readSource(store,source,budget));
    // Derived database JSON is a cache. Re-parse current sources before accepting its facts.
    if(analysisFacts(analyzeReportPedReferences(store.root,mod.report,{kind:'mod',id:mod.id}))!==analysisFacts(analysis))fail('当前来源与已存人物索引不一致，请重新分析');
    const installed=await inspectMod(mod,transactions,owners,game.root,checks,files,budget),tx=transactions.find(t=>t.id===mod.transactionId&&t.modId===mod.id);
    const userStates=new Map(listPedUserStates(store,{kind:'mod',id:mod.id}).map(s=>[s.referenceId,s]));
    for(const ref of analysis.references){const linked=referenceInstalled(ref,mod,tx),state=userStates.get(ref.referenceId)!;peds.push({id:ref.referenceId,modId:mod.id,name:mod.report.name,modelName:ref.modelName,hash:ref.hash,kind:ref.kind,parsedPedType:ref.parsedPedType,dependencyRefs:structuredClone(ref.dependencies),evidence:structuredClone(ref.evidence),transactionId:mod.transactionId,fileState:installed.state==='verified'&&!linked?'unverified':installed.state,registration:'unknown',dependencies:ref.dependencies.some(d=>d.origin==='manifest-declaration')?'declared-only':'unknown',desktopFavorite:state.favorite,userTags:[...state.tags],issues:[...installed.issues,...analysis.issues,...(!linked?['引用来源没有对应本事务的目标/摘要，不能认定该人物文件已启用']:[]),'文件证据不证明人物已注册或游戏内加载']});if(peds.length>PED_LIMIT)fail('人物引用超过2000项，未导出或截断');}
  }
  peds.sort((a,b)=>ordinal(a.modId,b.modId)||ordinal(a.id,b.id));
  const withoutRevision:Omit<PedCatalogV1,'revision'>={schemaVersion:1,component:'GEMS.PedCatalog',protocol:'gems.ped-catalog.v1',gameRoot:game.root,gameRootId:gameRootId(game.root),targetGame:'enhanced',requiresGameRestart:true,peds,issues};
  const catalog:PedCatalogV1={...withoutRevision,revision:pedCatalogRevision(withoutRevision)},text=pedCatalogText(catalog),prepared={catalog,text,checks};
  time(budget);verifyIdentities(game.root,files);for(const source of sources){noLinks(store.root,source.path);if(stamp(source.path)!==source.identity)fail('目录核验期间来源文件身份变化');}
  if(databaseFingerprint(store)!==database)fail('目录核验期间数据库变化');const again=resolvePedGameRoot(game.root);if(again.root!==game.root||again.rootStamp!==game.rootStamp||again.exeStamp!==game.exeStamp)fail('目录核验期间游戏目标变化');
  snapshots.set(prepared,{store,database,root:game.root,rootStamp:game.rootStamp,exeStamp:game.exeStamp,payload:digest(text),checks:structuredClone(checks),files,sources});return prepared;
}
export async function verifyPedCatalogSnapshot(store:Store,prepared:PreparedPedCatalog):Promise<void>{
  const saved=snapshots.get(prepared);if(!saved||saved.store!==store)fail('导出快照不是本次应用准备的对象');
  if(databaseFingerprint(store)!==saved.database||digest(prepared.text)!==saved.payload||pedCatalogText(prepared.catalog)!==prepared.text)fail('保存前数据库或目录快照变化，请重新预览');
  const sameRoot=()=>{const game=resolvePedGameRoot(saved.root);if(game.root!==saved.root||game.rootStamp!==saved.rootStamp||game.exeStamp!==saved.exeStamp)fail('保存前游戏根目录或程序文件变化');};sameRoot();
  const budget={bytes:0,started:performance.now()};for(const source of saved.sources)if((await readSource(store,source,budget)).identity!==source.identity)fail('保存前来源文件身份变化');
  for(const [index,check] of saved.checks.entries()){const actual=await inspectTarget(saved.root,check.target,budget);if(actual.hash!==check.observedHash||actual.identity!==saved.files[index].identity)fail('保存前安装文件内容或身份变化：'+check.target);}
  sameRoot();verifyIdentities(saved.root,saved.files);for(const source of saved.sources){noLinks(store.root,source.path);if(stamp(source.path)!==source.identity)fail('保存核验期间来源文件身份变化');}
  time(budget);if(databaseFingerprint(store)!==saved.database)fail('保存核验期间数据库变化');
}
