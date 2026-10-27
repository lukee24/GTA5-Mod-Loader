import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {Store,DocumentChange} from '../database';
import type {Backup} from '../backup';
import type {ModRecord,Transaction} from '../core/types';
import {inside,noLinks,hashOrNull,inspectFileHash,sameGamePath,MAX_FILES,MAX_BYTES,executable} from '../core/security';
import {directoryIdentity} from '../core/path-identity';
import {readMods,validateModRecord} from '../installer/mod-records';
import {readTransactions,validateRecoveryTransaction} from '../installer/recovery-records';
import {validateTarget} from '../installer/target-policy';
import {explainError} from '../core/errors';
import {clone,readActive,activeId,JOURNAL_KIND,type Journal} from './records';
import type {Profile,ProfileRef,ProfileEntry,ProfileSwitchPlan} from './types';

export const digest=(value:unknown)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const targetKey=(value:string)=>validateTarget(value).toLowerCase();
export function fingerprint(mod:ModRecord){return digest({version:mod.report.version,method:mod.report.method,compatibility:mod.report.compatibility,files:mod.report.files.filter(f=>f.target).map(f=>({target:targetKey(f.target!),hash:f.hash,size:f.size,binary:f.binary})).sort((a,b)=>a.target.localeCompare(b.target))});}
export function catalog(store:Store){const mods=readMods(store),transactions=readTransactions(store),active=readActive(store);return{mods,transactions,digest:digest({mods:mods.map(({metadata,...m})=>m),transactions,active})};}
export function transaction(mod:ModRecord,transactions:Transaction[]){const tx=transactions.find(tx=>tx.id===mod.transactionId);if(!tx||tx.modId!==mod.id||tx.trustedRestore||mod.report.method==='已校验快照')throw new Error('方案只能引用具有完整普通安装事务的受管模组：'+mod.report.name);if(mod.status==='已启用'&&(tx.state!=='已完成'||tx.changes.some(f=>!f.applied))||mod.status==='已停用'&&(tx.state!=='已回滚'||tx.changes.some(f=>f.applied))||mod.status==='已卸载')throw new Error('模组安装或恢复状态尚未完成：'+mod.report.name);const files=mod.report.files.filter(f=>f.target);if(files.length!==tx.changes.length||!files.length||tx.changes.some(f=>f.after===null||!files.some(r=>targetKey(r.target!)===targetKey(f.target)&&r.hash===f.after)))throw new Error('模组报告与受管事务清单不匹配：'+mod.report.name);return tx;}
export function refFor(mod:ModRecord):ProfileRef{return{modId:mod.id,name:mod.report.name,...(mod.report.version?{version:mod.report.version}:{}),fingerprint:fingerprint(mod)};}
export function entry(ref:ProfileRef,gamePath:string,mods:ModRecord[],transactions:Transaction[]):ProfileEntry{
  const mod=mods.find(m=>m.id===ref.modId);let status:ProfileEntry['status'],message:string;
  if(!mod){status='missing';message='缺少此受管模组；导入方案不会下载或猜测替代文件';}
  else if(mod.status==='已卸载'){status='uninstalled';message='此模组已经卸载，不能直接启用';}
  else if(!transactions.some(tx=>tx.id===mod.transactionId&&sameGamePath(tx.gamePath,gamePath))){status='wrong-game';message='模组属于其他游戏目录或缺少安装事务';}
  else if(fingerprint(mod)!==ref.fingerprint){status='changed';message='版本或文件内容与方案固定记录不同；须明确重新选择后再预览';}
  else if(mod.status==='已停用'){status='disabled';message='当前已停用；切换时将从校验备份重新启用';}
  else{status='enabled';message='当前已启用；仍需核对文件与冲突';}
  return{...ref,status,...(mod?.report.version?{currentVersion:mod.report.version}:{}),message};
}
export interface Prepared {plan:ProfileSwitchPlan;profile:Profile;catalogDigest:string;gameIdentity:string;changes:DocumentChange[]}
export function validateBatchBudget(changes:DocumentChange[],journal:Journal){
  const projected=[...changes,{operation:'put',kind:'profile-active',id:activeId(journal.gamePath),value:{profileId:journal.profileId,gamePath:journal.gamePath,switchId:journal.id}},{operation:'put',kind:JOURNAL_KIND,id:journal.id,value:{...journal,state:'completed',files:journal.files.map(f=>({...f,applied:f.changed}))}}];
  // Allow the bounded metadata fields to change without exceeding the final
  // Store limit. Count the full active marker and journal, including long paths.
  if(Buffer.byteLength(JSON.stringify(projected))+65536>16*1024**2)throw new Error('方案提交连同恢复账本超过16MiB原子容量；未截断方案，未修改文件');
}
export function validateFinalRecords(store:Store,changes:DocumentChange[]){
  const current=catalog(store),mods=new Map(current.mods.map(m=>[m.id,m])),txs=new Map(current.transactions.map(t=>[t.id,t]));
  for(const c of changes){if(c.operation!=='put')throw new Error('方案提交不能删除安装记录');if(c.kind==='mod'){validateModRecord(c.id,c.value);mods.set(c.id,c.value as ModRecord);}else if(c.kind==='transaction'){validateRecoveryTransaction(c.id,c.value);txs.set(c.id,c.value as Transaction);}else throw new Error('方案提交记录类型无效');}
  for(const [kind,map] of [['模组',mods],['事务',txs]] as const){let bytes=0;if(map.size>10000)throw new Error(kind+'记录超过10000条上限');for(const record of map.values()){const size=Buffer.byteLength(JSON.stringify(record))+8192;if(size>8*1024**2)throw new Error(kind+'单条记录超过8MiB安全容量');bytes+=size;}if(bytes>32*1024**2)throw new Error(kind+'记录合计超过32MiB安全容量');}
  if(changes.length+2>128||Buffer.byteLength(JSON.stringify(changes))>14*1024**2)throw new Error('本次方案切换超过单次原子提交128项/16MiB容量；未截断方案，未修改文件');
}
export async function prepare(store:Store,backup:Backup,profile:Profile):Promise<Prepared>{
  const snapshot=catalog(store),mods=snapshot.mods,txs=snapshot.transactions;
  const plan:ProfileSwitchPlan={id:crypto.randomUUID(),profileId:profile.id,name:profile.name,gamePath:profile.gamePath,created:new Date().toISOString(),actions:[],files:[],overlaps:[],blockers:[],warnings:['仅切换本工具已经管理的文件；游戏内加载和功能仍需独立实测。'],highRisk:false,bytes:0};
  const identity=directoryIdentity(profile.gamePath);noLinks(path.parse(profile.gamePath).root,profile.gamePath);
  for(const mod of mods.filter(m=>m.status==='已启用')){const tx=txs.find(t=>t.id===mod.transactionId);if(!tx||tx.modId!==mod.id)plan.blockers.push('启用模组的安装事务缺失或身份不匹配，无法确定其游戏目录和所有权：'+mod.report.name);}
  if(txs.some(tx=>sameGamePath(tx.gamePath,profile.gamePath)&&['准备中','执行中','恢复待处理'].includes(tx.state)))plan.blockers.push('游戏目录存在未完成安装事务，请先恢复');
  const active=mods.filter(m=>m.status==='已启用'&&txs.some(tx=>tx.id===m.transactionId&&sameGamePath(tx.gamePath,profile.gamePath)));
  const selected:ModRecord[]=[];for(const ref of profile.mods){const result=entry(ref,profile.gamePath,mods,txs);if(!['enabled','disabled'].includes(result.status)){plan.blockers.push(ref.name+'：'+result.message);continue;}selected.push(mods.find(m=>m.id===ref.modId)!);}
  const selectedIds=new Set(selected.map(m=>m.id));for(const m of active)plan.actions.push({modId:m.id,name:m.report.name,action:selectedIds.has(m.id)?'keep':'disable'});for(const m of selected.filter(m=>m.status==='已停用'))plan.actions.push({modId:m.id,name:m.report.name,action:'enable'});
  const chains=new Map<string,{target:string;baseline:string|null;current:string;owners:string[]}>();
  // Existing ownership is ordered by persisted transaction insertion, oldest first.
  for(const tx of [...txs].reverse()){
    const mod=active.find(m=>m.transactionId===tx.id);if(!mod)continue;transaction(mod,txs);
    for(const f of tx.changes){const key=targetKey(f.target),prior=chains.get(key);if(prior){if(prior.current!==f.before)plan.blockers.push('现有共享目标恢复链不连续：'+f.target);prior.current=f.after!;prior.owners.push(mod.id);}else chains.set(key,{target:f.target,baseline:f.before,current:f.after!,owners:[mod.id]});}
  }
  const wanted=new Map<string,{target:string;layers:{mod:ModRecord;before:string|null;after:string}[]}>();
  for(const mod of selected){let tx:Transaction;try{tx=transaction(mod,txs);}catch(error){plan.blockers.push(explainError(error));continue;}for(const f of tx.changes){const key=targetKey(f.target),layer={mod,before:f.before,after:f.after!},prior=wanted.get(key);if(prior)prior.layers.push(layer);else wanted.set(key,{target:f.target,layers:[layer]});}}
  const keys=[...new Set([...chains.keys(),...wanted.keys()])].sort();if(keys.length>MAX_FILES)throw new Error('方案涉及文件超过20000项安全上限');
  const checked=new Set<string>();async function verify(hash:string){if(checked.has(hash))return;const file=backup.file(hash);noLinks(backup.root,file);const result=await inspectFileHash(file);if(result.hash!==hash)throw new Error('方案备份校验失败：'+hash);checked.add(hash);plan.bytes+=result.bytes;if(!Number.isSafeInteger(plan.bytes)||plan.bytes>MAX_BYTES)throw new Error('方案备份与输出合计超过20GiB安全上限');}
  // Ordinary disable preserves the immediate previous layer. Follow only older,
  // fully rolled-back transactions still referenced by actual managed records;
  // reach their complete root before comparing it with disk. An external edit
  // back to a historical intermediate layer must not become a new baseline.
  function restoredBaseline(mod:ModRecord,before:string|null,target:string,actual:string|null|undefined){
    const hashes:string[]=[],seen=new Set<string>();let value=before,cursor=txs.findIndex(tx=>tx.id===mod.transactionId);
    while(value!==null&&cursor>=0){if(seen.has(cursor+':'+value))break;seen.add(cursor+':'+value);let previous=-1;
      for(let i=cursor+1;i<txs.length;i++){const tx=txs[i],owner=mods.find(m=>m.transactionId===tx.id&&m.id===tx.modId&&['已停用','已卸载'].includes(m.status));if(!owner||!sameGamePath(tx.gamePath,profile.gamePath)||tx.trustedRestore||tx.state!=='已回滚'||tx.changes.some(f=>f.applied))continue;if(tx.changes.some(f=>targetKey(f.target)===target&&f.after===value)){previous=i;break;}}
      if(previous<0)break;const change=txs[previous].changes.find(f=>targetKey(f.target)===target)!;hashes.push(value);value=change.before;cursor=previous;
    }
    return{resolved:value===actual,baseline:value,hashes};
  }
  for(const key of keys){
    const chain=chains.get(key),desired=wanted.get(key),target=chain?.target??desired!.target,layers=desired?.layers??[],absolute=inside(profile.gamePath,target);
    let baseline:string|null=chain?.baseline??null,actual:string|null|undefined;const chainHashes:string[]=[];
    try{noLinks(profile.gamePath,absolute);actual=await hashOrNull(absolute);}catch(error){plan.blockers.push(explainError(error));}
    if(!chain){const roots=layers.map(l=>restoredBaseline(l.mod,l.before,key,actual));if(roots.every(r=>r.resolved)){baseline=actual!;for(const root of roots)chainHashes.push(...root.hashes);}else{baseline=layers[0].before;plan.blockers.push('受管文件或停用后的完整恢复基线无法核对，可能发生外部变化：'+target);}}
    const before=chain?chain.current:baseline,after=layers.length?layers.at(-1)!.after:baseline;
    try{if(actual!==before)throw new Error('受管文件或停用后的恢复基线发生外部变化：'+target);if(before)await verify(before);if(baseline)await verify(baseline);for(const hash of chainHashes)await verify(hash);for(const layer of layers)await verify(layer.after);}catch(error){plan.blockers.push(explainError(error));}
    plan.files.push({target,before,after,baseline,...(layers.length?{owner:layers.at(-1)!.mod.id}:{}),changed:before!==after});
    if(layers.length>1)plan.overlaps.push({target,order:layers.map(l=>({modId:l.mod.id,name:l.mod.report.name,hash:l.after})),differentContent:new Set(layers.map(l=>l.after)).size>1,winner:layers.at(-1)!.mod.id});
  }
  if(plan.overlaps.length)plan.warnings.push('共享目标按方案列出的模组顺序依次覆盖，最后一层生效；确认前请核对每个目标的顺序和最终拥有者。');
  plan.highRisk=plan.files.some(f=>f.changed&&(executable(f.target)||!/^mods\//i.test(f.target)));
  const changes:DocumentChange[]=[];
  const put=(kind:string,id:string,value:unknown)=>changes.push({operation:'put',kind,id,value});
  for(const mod of active){const tx=transaction(mod,txs);put('transaction',tx.id,{...tx,state:'已回滚',changes:tx.changes.map(f=>({...f,before:plan.files.find(p=>targetKey(p.target)===targetKey(f.target))!.baseline,applied:false})),error:'配置方案切换已停用此层或将所有权转交新事务；停用记录保留独立恢复到原始文件的完整基线。'});if(!selectedIds.has(mod.id))put('mod',mod.id,{...mod,status:'已停用'});}
  const layerBaselines=new Map(plan.files.map(f=>[targetKey(f.target),f.baseline]));
  for(const mod of selected){let tx:Transaction;try{tx=transaction(mod,txs);}catch{continue;}const rebased=tx.changes.map(f=>{const key=targetKey(f.target),before=layerBaselines.get(key)!;layerBaselines.set(key,f.after);return{...f,before,applied:true};});
    const next:Transaction={id:crypto.randomUUID(),modId:mod.id,name:mod.report.name,gamePath:profile.gamePath,created:plan.created,state:'已完成',changes:rebased};put('transaction',next.id,next);put('mod',mod.id,{...mod,transactionId:next.id,status:'已启用',installed:plan.created});
  }
  try{validateFinalRecords(store,changes);const projectedJournal:Journal={format:1,id:crypto.randomUUID(),profileId:profile.id,name:profile.name,gamePath:profile.gamePath,gameIdentity:identity,catalogDigest:snapshot.digest,created:plan.created,state:'completed',files:plan.files.map(f=>({...f,applied:f.changed}))};validateBatchBudget(changes,projectedJournal);const reserve=plan.bytes*2+64*1024**2;for(const root of [profile.gamePath,backup.root]){const stat=fs.statfsSync(root);if(Number(stat.bavail)*Number(stat.bsize)<reserve)throw new Error('方案备份与恢复所需磁盘空间不足');}}catch(error){plan.blockers.push(explainError(error));}
  if(catalog(store).digest!==snapshot.digest)throw new Error('预览期间安装记录发生变化，请重新预览');
  plan.blockers=[...new Set(plan.blockers)];return{plan,profile:clone(profile),catalogDigest:snapshot.digest,gameIdentity:identity,changes};
}
