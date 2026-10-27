import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import type {Store} from '../database';
import type {Backup} from '../backup';
import type {ImportReport,InstallPlan,ModRecord,ModUpdatePlan,Transaction} from '../core/types';
import {inside,noLinks,hashOrNull,inspectFileHash,relativeSafe,sameGamePath} from '../core/security';
import {validateImportReport} from '../core/import-report';
import {captureCommitTarget,assertCommitTarget} from '../core/commit-target';
import {explainError} from '../core/errors';
import {readMod,readMods,assertModWrite} from './mod-records';
import {readTransaction,readTransactions} from './recovery-records';
import {assertTransactionAppend} from './transaction-write';
import {assertTransactionUpdate} from './transaction-update';
import {RecoveryCheckpoint} from './recovery-checkpoint';
import {validateTarget} from './target-policy';

export interface ModUpdateContext {
  store:Store;backup:Backup;
  guard:(game:string)=>Promise<void>;
  progress:(message:string,current?:number,total?:number)=>void;
  plan:(report:ImportReport,game:string)=>Promise<InstallPlan>;
  owner:(game:string,target:string)=>ModRecord|undefined;
  pendingConflict:(game:string,target:string)=>Transaction|undefined;
  restore:(tx:Transaction)=>Promise<Transaction>;
  log:(kind:string,message:string)=>void;
}
const key=(target:string)=>relativeSafe(target).toLowerCase();
function original(c:ModUpdateContext,id:string){
  const mod=readMod(c.store,id),tx=mod&&readTransaction(c.store,mod.transactionId);
  if(!mod||mod.status!=='已启用'||!tx||tx.modId!==id||tx.state!=='已完成'||tx.changes.some(change=>!change.applied||change.after===null))throw new Error('更新需要完整启用的安装记录；请先处理恢复或重新启用');
  if(tx.trustedRestore||mod.report.method==='已校验快照')throw new Error('快照恢复记录不能作为模组更新对象');
  return{mod,tx};
}
function lifecycle(mod:ModRecord){const {metadata,...rest}=mod;return rest;}
async function verifyBackup(c:ModUpdateContext,hash:string){const file=c.backup.file(hash);noLinks(c.backup.root,file);if((await inspectFileHash(file)).hash!==hash)throw new Error('原始恢复备份校验失败');}

/** The preview includes removed old files. It never guesses package identity/version. */
export async function planModUpdate(c:ModUpdateContext,id:string,report:ImportReport):Promise<ModUpdatePlan>{
  validateImportReport(report.id,report);readMods(c.store);
  const {mod,tx}=original(c,id),base=await c.plan(report,tx.gamePath);
  const plan:ModUpdatePlan={...base,modId:id,previousTransactionId:tx.id,previousName:mod.report.name,previousVersion:mod.report.version,nextVersion:report.version,removals:[]};
  if(report.id===id)plan.blockers.push('请选择另外导入的新版本；不能把当前安装报告作为更新包');
  if(readMod(c.store,report.id)?.status==='已启用')plan.blockers.push('所选更新包已作为另一模组启用，请先核对安装记录');
  if(readTransactions(c.store).some(t=>t.modId===id&&['准备中','执行中','恢复待处理'].includes(t.state)))plan.blockers.push('当前模组存在未完成事务，请先恢复');
  const incoming=new Set(plan.files.map(file=>key(file.target)));
  for(const change of tx.changes){
    try{
      const target=inside(tx.gamePath,validateTarget(change.target));noLinks(tx.gamePath,target);
      if(await hashOrNull(target)!==change.after)throw new Error('旧版文件已被其他工具修改：'+change.target);
      if(c.owner(tx.gamePath,change.target)?.id!==id)throw new Error('旧版目标已被后续模组接管：'+change.target);
      if(c.pendingConflict(tx.gamePath,change.target))throw new Error('旧版目标涉及未完成事务：'+change.target);
      if(change.before)await verifyBackup(c,change.before);
      if(!incoming.has(key(change.target)))plan.removals.push({target:change.target,beforeHash:change.after!,restoreHash:change.before});
    }catch(error){plan.blockers.push(explainError(error));}
  }
  for(const file of plan.files){const owner=c.owner(tx.gamePath,file.target);if(owner&&owner.id!==id)plan.blockers.push('更新不能覆盖另一启用模组 '+owner.report.name+'：'+file.target);}
  try{
    const removedBytes=plan.removals.reduce((total,item)=>total+fs.statSync(inside(tx.gamePath,item.target)).size+(item.restoreHash?fs.statSync(c.backup.file(item.restoreHash)).size:0),0);
    const gameSpace=fs.statfsSync(tx.gamePath),backupSpace=fs.statfsSync(c.backup.root),required=base.bytes*2+removedBytes+64*1024**2;
    if(!Number.isSafeInteger(required)||Number(gameSpace.bavail)*Number(gameSpace.bsize)<required||Number(backupSpace.bavail)*Number(backupSpace.bsize)<required)plan.blockers.push('更新与恢复需要更多可用磁盘空间');
  }catch{plan.blockers.push('无法检查更新恢复所需空间');}
  plan.warnings.push('请确认这是同一模组的新版本。旧版独有文件会恢复到安装前状态；升级失败会尝试恢复旧版，外部改动会阻止自动恢复并保留待处理事务。');
  return plan;
}

/** Caller holds both Store and game-directory leases. No async gap in final ownership commit. */
export async function executeModUpdate(c:ModUpdateContext,plan:ModUpdatePlan,report:ImportReport,approved:{overwrite:boolean;binary:boolean}){
  if(plan.blockers.length)throw new Error(plan.blockers.join('；'));
  if(!approved.overwrite)throw new Error('更新需要明确确认替换旧版及恢复旧版独有文件');
  const {mod,tx:previous}=original(c,plan.modId),previousCheckpoint=new RecoveryCheckpoint(c.store,previous,'安装');
  const refreshed=await planModUpdate(c,mod.id,report);
  if(refreshed.blockers.length)throw new Error(refreshed.blockers.join('；'));
  const view=(p:ModUpdatePlan)=>{const {id,created,...rest}=p;return rest;};
  if(!isDeepStrictEqual(view(plan),view(refreshed)))throw new Error('更新计划已失效，文件或安装记录发生变化，请重新预览');
  if(refreshed.highRisk&&!approved.binary)throw new Error('需要明确确认脚本及二进制安装风险');
  const oldTargets=new Map(previous.changes.map(change=>[key(change.target),change]));
  const tx:Transaction={id:crypto.randomUUID(),modId:mod.id,name:report.name,gamePath:plan.gamePath,created:new Date().toISOString(),state:'准备中',operation:'update',changes:[...plan.files.map(file=>({target:file.target,before:file.beforeHash,after:file.hash,applied:false})),...plan.removals.map(item=>({target:item.target,before:item.beforeHash,after:item.restoreHash,applied:false}))]};
  const next:ModRecord={...mod,report:{...report,id:mod.id},transactionId:tx.id,installed:new Date().toISOString(),bytes:plan.bytes};
  const committed:Transaction={...tx,state:'已完成',changes:plan.files.map(file=>({target:file.target,before:oldTargets.get(key(file.target))?.before??file.beforeHash,after:file.hash,applied:true}))};
  // Null means the original did not exist, not "use the old installed hash".
  for(const change of committed.changes){const old=oldTargets.get(key(change.target));if(old)change.before=old.before;}
  const superseded:Transaction={...previous,state:'已回滚',changes:previous.changes.map(change=>({...change,applied:false})),error:'此版本已由更新事务 '+tx.id+' 替换；恢复基线已转交新版。'};
  assertTransactionAppend(c.store,tx);assertModWrite(c.store,next);assertTransactionUpdate(c.store,superseded);
  // Reserve final batch capacity before writing game files.
  if(Buffer.byteLength(JSON.stringify([committed,superseded,next]))>15*1024**2)throw new Error('更新提交记录超过安全容量上限，未开始更新');
  previousCheckpoint.assertCurrent();c.store.put('transaction',tx.id,tx);
  const checkpoint=new RecoveryCheckpoint(c.store,tx,'安装');
  const assertUnchanged=()=>{
    checkpoint.assertCurrent();previousCheckpoint.assertCurrent();
    const current=readMod(c.store,mod.id);
    if(!current||!isDeepStrictEqual(lifecycle(current),lifecycle(mod)))throw new Error('旧版模组记录在更新期间变化，已停止更新');
    const pending=readTransactions(c.store).filter(record=>record.id!==tx.id&&['准备中','执行中','恢复待处理'].includes(record.state)&&sameGamePath(record.gamePath,plan.gamePath));
    for(const change of tx.changes){const owner=c.owner(plan.gamePath,change.target);if(owner&&owner.id!==mod.id)throw new Error('更新目标被另一模组接管：'+change.target);if(pending.some(record=>record.changes.some(item=>key(item.target)===key(change.target))))throw new Error('更新目标出现另一未完成事务：'+change.target);}
  };
  try{
    // Every current target and every output is verified/backed up before the first mutation.
    for(const change of tx.changes){
      assertUnchanged();await c.guard(plan.gamePath);assertUnchanged();
      const target=inside(plan.gamePath,validateTarget(change.target));noLinks(plan.gamePath,target);
      if(await hashOrNull(target)!==change.before)throw new Error('更新备份前目标发生变化：'+change.target);
      if(change.before&&await c.backup.put(target)!==change.before)throw new Error('更新备份期间目标发生变化');
      const file=plan.files.find(file=>key(file.target)===key(change.target));
      if(file){noLinks(c.store.root,file.source);if(await c.backup.put(file.source)!==change.after)throw new Error('更新源文件发生变化');}
      else if(change.after)await verifyBackup(c,change.after);
      assertUnchanged();
    }
    tx.state='执行中';checkpoint.save(tx);
    for(const [index,change]of tx.changes.entries()){
      await c.guard(plan.gamePath);assertUnchanged();const target=inside(plan.gamePath,change.target);noLinks(plan.gamePath,target);
      const targetCheckpoint=captureCommitTarget(target);
      if(await hashOrNull(target)!==change.before)throw new Error('更新写入前目标发生变化：'+change.target);
      assertCommitTarget(targetCheckpoint);assertUnchanged();
      change.applied=true;checkpoint.save(tx);
      if(change.after)await c.backup.restore(change.after,target,change.before,()=>c.guard(plan.gamePath),assertUnchanged);
      else{await c.guard(plan.gamePath);assertUnchanged();assertCommitTarget(targetCheckpoint);noLinks(plan.gamePath,target);fs.unlinkSync(target);}
      assertUnchanged();c.progress('正在更新并校验 '+change.target,index+1,tx.changes.length);
    }
    const commitTargets=[];
    for(const change of tx.changes){const target=inside(plan.gamePath,change.target);noLinks(plan.gamePath,target);const captured=captureCommitTarget(target);if(await hashOrNull(target)!==change.after)throw new Error('更新提交前文件校验失败：'+change.target);assertCommitTarget(captured);commitTargets.push(captured);}
    assertUnchanged();next.metadata=readMod(c.store,mod.id)?.metadata;
    assertModWrite(c.store,next);assertTransactionUpdate(c.store,committed);assertTransactionUpdate(c.store,superseded);
    for(const captured of commitTargets)assertCommitTarget(captured);
    c.store.writeBatch([{operation:'put',kind:'transaction',id:tx.id,value:committed},{operation:'put',kind:'transaction',id:previous.id,value:superseded},{operation:'put',kind:'mod',id:mod.id,value:next}]);
    c.log('更新',mod.report.name+' → '+report.name+'；文件校验完成，游戏内加载待实测');return next;
  }catch(error){
    checkpoint.assertCurrent();previousCheckpoint.assertCurrent();
    const saved=readTransaction(c.store,tx.id);if(!saved)throw new Error('更新事务记录缺失，请保留现场核对',{cause:error});
    const restored=await c.restore(saved);
    c.log('更新恢复',report.name+'：'+restored.state);
    if(restored.state!=='已回滚')throw new Error(explainError(error)+'；旧版恢复未完成：'+(restored.error||'请在备份与恢复中处理'),{cause:error});
    throw new Error(explainError(error)+'；已按哈希恢复旧版，更新未完成',{cause:error});
  }
}
