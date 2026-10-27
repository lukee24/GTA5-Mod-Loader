import fs from 'node:fs';
import path from 'node:path';
import {Store} from '../database';
import {Backup} from '../backup';
import type {ImportReport,InstallPlan,Transaction,ModRecord,PlanFile,ModUpdatePlan} from '../core/types';
import {inside,noLinks,relativeSafe,inspectFileHash,hashOrNull,sameGamePath,executable} from '../core/security';
import {explainError} from '../core/errors';
import {OperationLogger} from '../core/operation-logger';

import {validateTarget} from './target-policy';
export {validateTarget} from './target-policy';
import {readRecoveryTransactions,readTransactions,readTransaction} from './recovery-records';
import {assertTransactionAppend} from './transaction-write';
import {readMods,readMod,assertModWrite} from './mod-records';
import {captureCommitTarget,assertCommitTarget} from '../core/commit-target';
import {captureInstallInputs} from './install-input';
import {captureRecoveryInput,assertRecoveryMatch} from './recovery-input';
import {commitModTransition} from './mod-transition';
import {RecoveryCheckpoint} from './recovery-checkpoint';
import {acquireGameDirectories} from './game-directory-lease';
import {assertEnabledOwnership} from './ownership-integrity';
import {planModUpdate,executeModUpdate,type ModUpdateContext} from './mod-update';
const pending=(tx:Transaction)=>['准备中','执行中','恢复待处理'].includes(tx.state);
const sameTarget=(a:string,b:string)=>relativeSafe(a).toLowerCase()===relativeSafe(b).toLowerCase();
// Instances sharing one database must also share the mutation boundary. This is
// an in-process Store lock, not an operating-system or cross-process file lock.
const activeStores=new WeakSet<Store>();

export class Installer {
  busy=false;
  private logger:OperationLogger;
  get logIssue(){return this.logger.issue;}
  constructor(public store:Store,public backup:Backup,public guard:(game:string)=>Promise<void>,public progress:(message:string,current?:number,total?:number)=>void=()=>{}){this.logger=new OperationLogger(store,'事务结果已保存，但操作日志记录失败：','请在备份与恢复中核对事务记录。');}

  // Logs describe the committed result; their failure must not change that result or hide
  // the original transaction error. Keep direct Store.log callers' protection unchanged.
  private recordLog(kind:string,message:string){
    this.logger.record(kind,message);
  }

  private assertOwnership(){assertEnabledOwnership(readMods(this.store),readTransactions(this.store));}
  private async guarded(game:string){
    this.assertOwnership();await this.guard(game);this.assertOwnership();
  }

  private transaction(mod:ModRecord){
    const tx=readTransaction(this.store,mod.transactionId);
    if(!tx||tx.modId!==mod.id)throw new Error('模组事务记录缺失或不匹配，未修改任何文件');
    return tx;
  }

  private owner(gamePath:string,target:string,newerThan?:string){
    const ordered=readTransactions(this.store);
    const cutoff=newerThan?ordered.findIndex(t=>t.id===newerThan):ordered.length;
    if(cutoff<0)throw new Error('事务顺序记录缺失');
    const records=readMods(this.store);
    assertEnabledOwnership(records,ordered);
    // 使用实际事务写入清单，而非包内未执行的文件；不同游戏目录不共享所有权。
    for(const tx of ordered.slice(0,cutoff)){
      const mod=records.find(m=>m.transactionId===tx.id&&m.id===tx.modId&&m.status==='已启用');
      if(mod&&sameGamePath(tx.gamePath,gamePath)&&tx.changes.some(c=>c.applied&&sameTarget(c.target,target)))return mod;
    }
  }

  private laterPending(gamePath:string,target:string,id:string){
    const ordered=readTransactions(this.store),cutoff=ordered.findIndex(tx=>tx.id===id);
    if(cutoff<0)throw new Error('事务顺序记录缺失');
    return ordered.slice(0,cutoff).find(tx=>pending(tx)&&sameGamePath(tx.gamePath,gamePath)&&tx.changes.some(c=>c.applied&&sameTarget(c.target,target)));
  }

  private pendingConflict(gamePath:string,target:string){
    return readTransactions(this.store).find(tx=>pending(tx)&&sameGamePath(tx.gamePath,gamePath)&&tx.changes.some(c=>sameTarget(c.target,target)));
  }

  private assertRestoreDependencies(tx:Transaction,target:string){
    const dependency=this.laterPending(tx.gamePath,target,tx.id);
    if(dependency)throw new Error('后续未完成事务仍依赖此文件，请先处理 '+dependency.name+'：'+target);
    const owner=this.owner(tx.gamePath,target,tx.id);
    if(owner)throw new Error('共享文件仍被后续安装的 '+owner.report.name+' 使用，停止恢复：'+target);
  }

  async plan(report:ImportReport,gamePath:string,trustedRestore=false):Promise<InstallPlan>{
    readMods(this.store);await this.guarded(gamePath);
    const files:PlanFile[]=[],blockers=[...report.blockers],targets=new Set<string>();
    if(readTransactions(this.store).some(tx=>pending(tx)&&tx.modId===report.id))blockers.push('此模组存在未完成事务，请先在备份与恢复中处理');
    for(const entry of report.files.filter(f=>f.target)){
      try{
        if(trustedRestore&&(report.method!=='已校验快照'||path.resolve(entry.source).toLowerCase()!==this.backup.file(entry.hash).toLowerCase()))throw new Error('快照恢复源不属于已校验备份');
        const target=validateTarget(entry.target!,trustedRestore),absolute=inside(gamePath,target);
        if(targets.has(target.toLowerCase()))throw new Error('重复写入目标：'+target);
        targets.add(target.toLowerCase());noLinks(gamePath,absolute);noLinks(this.store.root,entry.source);
        if((await inspectFileHash(entry.source,{expectedBytes:entry.size})).hash!==entry.hash)throw new Error('导入缓存发生变化，请重新导入');
        const unfinished=this.pendingConflict(gamePath,target);
        if(unfinished)throw new Error('目标仍涉及未完成事务 '+unfinished.name+'：'+target);
        const beforeHash=await hashOrNull(absolute),owner=this.owner(gamePath,target);
        files.push({...entry,target,beforeHash,owner:owner?.report.name});
      }catch(e){blockers.push(explainError(e));}
    }
    if(!files.length)blockers.push('没有可执行的文件写入操作');
    const bytes=files.reduce((n,f)=>n+f.size,0);
    blockers.push(...this.storageBlockers(files,gamePath));
    return{id:crypto.randomUUID(),reportId:report.id,name:report.name,gamePath,files,conflicts:files.filter(f=>f.beforeHash!==null),blockers,warnings:[...report.warnings],bytes,highRisk:files.some(f=>f.binary||executable(f.target)||!/^mods\//i.test(f.target)),created:new Date().toISOString(),trustedRestore};
  }

  private storageBlockers(files:PlanFile[],gamePath:string){
    try{
      const bytes=files.reduce((total,file)=>total+file.size,0);
      const oldBytes=files.reduce((total,file)=>total+(file.beforeHash!==null?fs.statSync(inside(gamePath,file.target)).size:0),0);
      if(!Number.isSafeInteger(bytes)||bytes<0||!Number.isSafeInteger(oldBytes)||oldBytes<0)throw new Error('容量计算无效');
      const reserve=64*1024**2,space=fs.statfsSync(gamePath),backupSpace=fs.statfsSync(this.backup.root),blockers:string[]=[];
      if(Number(space.bavail)*Number(space.bsize)<bytes*2+reserve)blockers.push('游戏磁盘可用空间不足');
      if(Number(backupSpace.bavail)*Number(backupSpace.bsize)<oldBytes+bytes*2+reserve)blockers.push('备份磁盘可用空间不足');
      return blockers;
    }catch{return ['无法检查磁盘剩余空间'];}
  }

  async planEnable(id:string){
    const mod=readMod(this.store,id);
    if(!mod||mod.status!=='已停用')throw new Error('模组当前未停用');
    const previous=this.transaction(mod);
    if(previous.state!=='已回滚'||previous.changes.some(c=>c.applied))throw new Error('此前恢复尚未完成，不能重新启用');
    const plan=await this.plan(mod.report,previous.gamePath,previous.trustedRestore);
    plan.reenableFrom=previous.id;
    plan.warnings.push('重新启用只允许写入已恢复的原目标；现有文件覆盖仍需明确确认');
    for(const file of plan.files){
      const old=previous.changes.find(c=>sameTarget(c.target,file.target));
      if(!old||old.after!==file.hash||old.before!==file.beforeHash)plan.blockers.push('停用后的目标已变化，请保留现有文件并重新导入：'+file.target);
      const owner=this.owner(previous.gamePath,file.target,previous.id);
      if(owner)plan.blockers.push('目标已被后续安装的 '+owner.report.name+' 使用，请先停用该模组：'+file.target);
    }
    if(plan.files.length!==previous.changes.length)plan.blockers.push('重新启用清单与原安装事务不一致');
    return plan;
  }

  private updateContext():ModUpdateContext{return{store:this.store,backup:this.backup,guard:game=>this.guarded(game),progress:(...args)=>this.progress(...args),plan:(report,game)=>this.plan(report,game),owner:(game,target)=>this.owner(game,target),pendingConflict:(game,target)=>this.pendingConflict(game,target),restore:tx=>this.restoreWithinTransaction(tx),log:(kind,message)=>this.recordLog(kind,message)};}
  async planUpdate(id:string,report:ImportReport){return planModUpdate(this.updateContext(),id,structuredClone(report));}
  async update(plan:ModUpdatePlan,report:ImportReport,approved:{overwrite:boolean;binary:boolean}){
    const captured=captureInstallInputs(plan,report,approved);
    return this.exclusive(()=>this.withGameDirectories([captured.plan.gamePath],()=>executeModUpdate(this.updateContext(),captured.plan as ModUpdatePlan,captured.report,captured.approved)));
  }

  async exclusive<T>(fn:()=>Promise<T>){
    const store=this.store;
    if(this.busy||activeStores.has(store))throw new Error('另一个文件事务正在执行');
    activeStores.add(store);this.busy=true;
    try{return await fn();}finally{activeStores.delete(store);this.busy=false;}
  }

  private async withGameDirectories<T>(paths:ReadonlyArray<string>,fn:()=>Promise<T>){
    const release=acquireGameDirectories(paths);
    try{return await fn();}finally{release();}
  }

  async install(plan:InstallPlan,report:ImportReport,approved:{overwrite:boolean;binary:boolean}){
    return this.exclusive(async()=>{
      ({plan,report,approved}=captureInstallInputs(plan,report,approved));
      return this.withGameDirectories([plan.gamePath],async()=>{
      readMods(this.store);
      if(plan.reportId!==report.id||plan.files.some(f=>!report.files.some(r=>r.target&&sameTarget(r.target,f.target)&&r.hash===f.hash&&r.size===f.size&&path.resolve(r.source)===path.resolve(f.source))))throw new Error('安装计划与已预览的导入报告不匹配');
      const previousMod=readMod(this.store,report.id);
      if(previousMod?.status==='已启用')throw new Error('此导入已经安装');
      if(plan.blockers.length)throw new Error(plan.blockers.join('；'));
      if((plan.conflicts.length||plan.files.some(file=>file.beforeHash!==null))&&!approved.overwrite)throw new Error('需要明确确认现有文件覆盖');
      if((plan.highRisk||plan.files.some(f=>f.binary||executable(f.target)||!/^mods\//i.test(f.target)))&&!approved.binary)throw new Error('需要明确确认脚本及二进制安装风险');
      if(plan.reenableFrom){
        const mod=readMod(this.store,report.id);
        if(mod?.transactionId!==plan.reenableFrom||!sameGamePath(this.transaction(mod).gamePath,plan.gamePath))throw new Error('重新启用计划已失效，请再次预览');
        const refreshed=await this.planEnable(report.id);
        if(refreshed.blockers.length)throw new Error(refreshed.blockers.join('；'));
      }
      const transactions=readTransactions(this.store);
      if(transactions.length>=10000)throw new Error('事务记录达到10000条准入上限，未开始新安装；自动归档尚未支持，请保留原数据并联系维护者');
      if(transactions.some(tx=>pending(tx)&&tx.modId===report.id))throw new Error('此模组存在未完成事务，请先恢复');
      await this.guarded(plan.gamePath);
      for(const f of plan.files){
        if(plan.trustedRestore&&(report.method!=='已校验快照'||path.resolve(f.source).toLowerCase()!==this.backup.file(f.hash).toLowerCase()))throw new Error('快照恢复来源无效');
        const target=inside(plan.gamePath,validateTarget(f.target,plan.trustedRestore));noLinks(plan.gamePath,target);
        if(this.pendingConflict(plan.gamePath,f.target))throw new Error('目标涉及未完成事务，请先恢复：'+f.target);
        if(await hashOrNull(target)!==f.beforeHash)throw new Error('目标自预览后发生变化，请重新生成计划');
        noLinks(this.store.root,f.source);
        if((await inspectFileHash(f.source,{expectedBytes:f.size})).hash!==f.hash)throw new Error('导入缓存发生变化');
      }
      const spaceProblems=this.storageBlockers(plan.files,plan.gamePath);if(spaceProblems.length)throw new Error(spaceProblems.join('；'));
      const tx:Transaction={id:crypto.randomUUID(),name:report.name,modId:report.id,gamePath:plan.gamePath,created:new Date().toISOString(),state:'准备中',changes:[],trustedRestore:plan.trustedRestore};
      assertTransactionAppend(this.store,{...tx,changes:plan.files.map(file=>({target:file.target,before:file.beforeHash,after:file.hash,applied:false}))});
      const record:ModRecord={id:report.id,report,transactionId:tx.id,status:'已启用',installed:new Date().toISOString(),bytes:plan.bytes,metadata:previousMod?.metadata};
      assertModWrite(this.store,record);
      const actualBytes=plan.files.reduce((total,file)=>total+file.size,0);
      if(!Number.isSafeInteger(actualBytes)||plan.bytes!==actualBytes)throw new Error('安装计划总字节数与已核验文件清单不一致，未开始事务');
      this.store.put('transaction',tx.id,tx);
      const checkpoint=new RecoveryCheckpoint(this.store,tx,'安装');
      try{
        for(const f of plan.files){
          checkpoint.assertCurrent();
          const target=inside(plan.gamePath,f.target);noLinks(plan.gamePath,target);noLinks(this.store.root,f.source);
          const before=f.beforeHash?await this.backup.put(target):null;checkpoint.assertCurrent();
          const after=await this.backup.put(f.source);checkpoint.assertCurrent();
          // 备份阶段也可能有外部写入；不得把变化后的内容当作已批准的版本。
          if(before!==f.beforeHash||after!==f.hash)throw new Error('备份期间源文件或目标发生变化，停止事务');
          tx.changes.push({target:f.target,before,after,applied:false});checkpoint.save(tx);
        }
        tx.state='执行中';checkpoint.save(tx);
        for(const [i,change]of tx.changes.entries()){
          await this.guarded(plan.gamePath);checkpoint.assertCurrent();const target=inside(plan.gamePath,change.target);noLinks(plan.gamePath,target);
          const current=await hashOrNull(target);checkpoint.assertCurrent();if(current!==change.before)throw new Error('写入前目标发生变化，停止事务');
          if(!change.after)throw new Error('普通安装事务不可删除目标');
          change.applied=true;checkpoint.save(tx);await this.backup.restore(change.after,target,change.before,()=>this.guarded(plan.gamePath),()=>{checkpoint.assertCurrent();this.assertOwnership();});
          checkpoint.assertCurrent();
          this.progress('正在写入并校验 '+change.target,i+1,tx.changes.length);
        }
        this.assertOwnership();tx.state='已完成';checkpoint.save(tx);
        const saved=commitModTransition(this.store,previousMod,record);this.recordLog('安装','已写入 '+report.name+'；游戏内测试待验证');return saved;
      }catch(e){
        // Never roll back using a ledger changed by another actor: it may now
        // describe different targets or hashes. Preserve it for manual review.
        checkpoint.assertCurrent();
        // A failed database commit can leave tx ahead of the actual ledger. Only saved
        // applied markers authorize recovery; never persist the unsaved working copy.
        const saved=readTransaction(this.store,tx.id);
        if(!saved)throw new Error('事务记录缺失，无法安全恢复；请保留原数据',{cause:e});
        const restored=await this.restoreWithinTransaction(saved);this.recordLog('回滚',restored.name+'：'+restored.state);throw e;
      }
      });
    });
  }

  // Returns the resulting private ledger copy; does not mutate the caller's request.
  async restoreTransaction(input:Transaction):Promise<Transaction>{
    return this.exclusive(()=>{
      const request=captureRecoveryInput(input);
      return this.withGameDirectories([request.gamePath],()=>this.restoreWithinTransaction(request));
    });
  }

  // Only install failure, disable, and recover call this while holding exclusive.
  private async restoreWithinTransaction(input:Transaction):Promise<Transaction>{
    const request=captureRecoveryInput(input);readMods(this.store);
    const persisted=readTransactions(this.store).find(record=>record.id===request.id);
    assertRecoveryMatch(request,persisted);
    const tx=persisted,checkpoint=new RecoveryCheckpoint(this.store,persisted);
    tx.state='恢复待处理';checkpoint.save(tx);
    try{
      await this.guarded(tx.gamePath);checkpoint.assertCurrent();
      for(const [i,change]of [...tx.changes].reverse().entries()){
        if(!change.applied)continue;
        await this.guarded(tx.gamePath);checkpoint.assertCurrent();
        this.assertRestoreDependencies(tx,change.target);
        const target=inside(tx.gamePath,validateTarget(change.target,tx.trustedRestore));noLinks(tx.gamePath,target);
        const targetCheckpoint=captureCommitTarget(target),current=await hashOrNull(target);assertCommitTarget(targetCheckpoint);checkpoint.assertCurrent();
        this.assertRestoreDependencies(tx,change.target);
        if(current!==change.before){
          if(current!==change.after)throw new Error('文件已被其他工具修改，停止恢复：'+change.target);
          if(change.before)await this.backup.restore(change.before,target,change.after,async()=>{await this.guarded(tx.gamePath);},()=>{checkpoint.assertCurrent();this.assertRestoreDependencies(tx,change.target);});
          else{await this.guarded(tx.gamePath);checkpoint.assertCurrent();this.assertRestoreDependencies(tx,change.target);assertCommitTarget(targetCheckpoint);noLinks(tx.gamePath,target);fs.unlinkSync(target);}
        }
        change.applied=false;checkpoint.save(tx);
        this.progress('正在恢复并校验 '+change.target,i+1,tx.changes.length);
      }
      this.assertOwnership();checkpoint.assertCurrent();tx.state='已回滚';tx.error=undefined;
    }catch(e){checkpoint.assertCurrent();tx.error=explainError(e);}
    checkpoint.save(tx);
    return tx;
  }

  async disable(id:string,uninstall=false){
    return this.exclusive(async()=>{
      readMods(this.store);
      const mod=readMod(this.store,id);
      if(!mod||mod.status==='已卸载')throw new Error('模组不存在或已卸载');
      if(readTransactions(this.store).some(tx=>pending(tx)&&tx.modId===id))throw new Error('此模组存在未完成事务，请先在备份与恢复中处理');
      const tx=this.transaction(mod);
      if(mod.status==='已停用'&&uninstall){
        if(tx.state!=='已回滚'||tx.changes.some(c=>c.applied))throw new Error('恢复尚未完成，请先处理事务再卸载');
        // 停用文件已还原；这里只更新记录，不再触碰用户后来写入的文件。
        const saved=commitModTransition(this.store,mod,{...mod,status:'已卸载'});this.recordLog('卸载',mod.report.name+'（已停用，保留备份）');return saved;
      }
      if(mod.status!=='已启用')throw new Error('模组当前未启用');
      if(tx.state!=='已完成')throw new Error('事务恢复尚未完成，请在备份与恢复中处理');
      return this.withGameDirectories([tx.gamePath],async()=>{
      await this.guarded(tx.gamePath);
      for(const change of tx.changes){
        const dependency=this.laterPending(tx.gamePath,change.target,tx.id);
        if(dependency)throw new Error('后续未完成事务仍依赖此文件，请先处理 '+dependency.name+'：'+change.target);
        const owner=this.owner(tx.gamePath,change.target,tx.id);
        if(owner)throw new Error('共享文件仍被后续安装的 '+owner.report.name+' 使用；请先恢复后续安装');
        const target=inside(tx.gamePath,validateTarget(change.target,tx.trustedRestore));noLinks(tx.gamePath,target);
        if(await hashOrNull(target)!==change.after)throw new Error('文件发生外部变化，未执行恢复：'+change.target);
      }
      const restored=await this.restoreWithinTransaction(tx);
      if(restored.state!=='已回滚')throw new Error(restored.error||'恢复未完成');
      this.assertOwnership();assertRecoveryMatch(restored,readTransaction(this.store,restored.id));
      const saved=commitModTransition(this.store,mod,{...mod,status:uninstall?'已卸载':'已停用'});this.recordLog(uninstall?'卸载':'停用',mod.report.name);return saved;
      });
    });
  }

  async enable(id:string,approved={overwrite:false,binary:true}){
    const plan=await this.planEnable(id),mod=readMod(this.store,id)!;
    return this.install(plan,mod.report,approved);
  }

  async recover(){
    return this.exclusive(async()=>{
      const messages:string[]=[],transactions=readRecoveryTransactions(this.store),mods=new Map(readMods(this.store).map(mod=>[mod.id,mod]));
      assertEnabledOwnership([...mods.values()],transactions);
      const games=transactions.filter(tx=>pending(tx)||(tx.state==='已完成'&&mods.get(tx.modId)?.transactionId!==tx.id)).map(tx=>tx.gamePath);
      return this.withGameDirectories(games,async()=>{
      for(let tx of transactions){
        const mod=mods.get(tx.modId);
        // 重新启用提交前崩溃时，旧模组记录仍存在但指向旧事务。
        // 不能仅凭 mod 存在就忽略已经写入、尚未建立所有权的新事务。
        if(pending(tx)||(tx.state==='已完成'&&mod?.transactionId!==tx.id)){
          tx=await this.restoreWithinTransaction(tx);
          const message=tx.name+'：'+tx.state+(tx.error?'，'+tx.error:'');
          messages.push(message);this.recordLog('恢复',message);
        }
        if(tx.state==='已回滚'&&mod?.transactionId===tx.id&&mod.status==='已启用'){
          this.assertOwnership();assertRecoveryMatch(tx,readTransaction(this.store,tx.id));
          const saved=commitModTransition(this.store,mod,{...mod,status:'已停用'});mods.set(mod.id,saved);
        }
      }
      return messages;
      });
    });
  }
}
