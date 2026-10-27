import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {DocumentChange} from '../database';
import type {Installer} from '../installer';
import type {ModRecord} from '../core/types';
import {inside,noLinks,hashOrNull,inspectFileHash,sameGamePath} from '../core/security';
import {directoryIdentity} from '../core/path-identity';
import {captureCommitTarget,assertCommitTarget} from '../core/commit-target';
import {explainError} from '../core/errors';
import {acquireGameDirectories} from '../installer/game-directory-lease';
import {validateTarget} from '../installer/target-policy';
import {PROFILE_KIND,JOURNAL_KIND,MAX_PROFILE_BYTES,MAX_PROFILES,MAX_REFS,MAX_JOURNAL_BYTES,clone,object,id,hash,name,game,refs,fail,validateProfile,validateJournal,readProfiles,readJournals,pendingJournal,readActive,activeId,type Active,type Journal} from './records';
import {catalog,digest,entry,refFor,transaction,prepare,validateFinalRecords,validateBatchBudget,type Prepared} from './planning';
import type {Profile,ProfileView,ProfilesState,ProfileSwitchSummary,ProfileSwitchResult,ProfileApproval} from './types';
export * from './types';
export const MAX_PROFILE_IMPORT_BYTES=MAX_PROFILE_BYTES;
const summary=(j:Journal):ProfileSwitchSummary=>({id:j.id,profileId:j.profileId,name:j.name,gamePath:j.gamePath,created:j.created,state:j.state,...(j.error?{error:j.error}:{}),files:j.files.length,applied:j.files.filter(f=>f.applied).length});

export class Profiles {
  private plans=new Map<string,Prepared>();
  constructor(public installer:Installer,private currentGamePath:()=>string,private baseGameGuard:(game:string)=>Promise<void>){if(typeof currentGamePath!=='function'||typeof baseGameGuard!=='function')throw new Error('配置方案需要当前游戏目录与独立的游戏/启动门禁');}
  private get store(){return this.installer.store;}
  private get backup(){return this.installer.backup;}
  private profile(key:string){if(!id(key))throw fail();const profile=readProfiles(this.store).find(p=>p.id===key);if(!profile)throw new Error('配置方案不存在');return profile;}
  private active(gamePath:string){
    const markers=readActive(this.store);
    return markers.find(m=>sameGamePath(m.gamePath,gamePath));
  }
  pending(){return readJournals(this.store).filter(pendingJournal).map(summary);}
  assertWritable(){readActive(this.store);if(this.pending().length)throw new Error('配置方案存在未完成切换，暂不修改游戏文件或再次启动；请先恢复方案事务');}
  list(gamePath?:string):ProfileView[]{
    const snapshot=catalog(this.store),all=readProfiles(this.store),filter=gamePath?game(gamePath):undefined;
    return all.filter(p=>!filter||sameGamePath(p.gamePath,filter)).map(profile=>{
      const entries=profile.mods.map(ref=>entry(ref,profile.gamePath,snapshot.mods,snapshot.transactions));
      const enabled=snapshot.mods.filter(m=>m.status==='已启用'&&snapshot.transactions.some(t=>t.id===m.transactionId&&sameGamePath(t.gamePath,profile.gamePath)));
      const ordered=snapshot.transactions.slice().reverse().flatMap(tx=>enabled.filter(m=>m.transactionId===tx.id).map(m=>m.id));
      const matchesCurrent=entries.every(e=>e.status==='enabled')&&digest(ordered)===digest(profile.mods.map(m=>m.modId));
      return{profile,entries,active:this.active(profile.gamePath)?.profileId===profile.id,matchesCurrent};
    });
  }
  state(gamePath=this.currentGamePath()):ProfilesState{return{profiles:this.list(gamePath||undefined),activeProfileId:gamePath?this.active(gamePath)?.profileId??null:null,pending:this.pending()};}
  private saveProfile(value:Profile){
    this.assertWritable();validateProfile(value.id,value);const existing=readProfiles(this.store),others=existing.filter(p=>p.id!==value.id);if(others.length>=MAX_PROFILES||others.reduce((n,p)=>n+Buffer.byteLength(JSON.stringify(p)),0)+Buffer.byteLength(JSON.stringify(value))>16*1024**2)throw new Error('配置方案达到200项或16MiB容量上限');this.store.put(PROFILE_KIND,value.id,value);this.plans.clear();return clone(value);
  }
  private select(gamePath:string,modIds:string[]){
    if(!Array.isArray(modIds)||modIds.length>MAX_REFS||modIds.some(value=>!id(value))||new Set(modIds).size!==modIds.length)throw new Error('模组选择包含无效、重复标识或超过1000项');const captured=[...modIds],snapshot=catalog(this.store);
    return captured.map(key=>{const mod=snapshot.mods.find(m=>m.id===key);if(!mod)throw new Error('只能选择已存在的受管模组：'+key);const tx=transaction(mod,snapshot.transactions);if(!sameGamePath(tx.gamePath,gamePath))throw new Error('不能把其他游戏目录的模组加入方案');return refFor(mod);});
  }
  create(input:{name:string;gamePath:string;modIds:string[]}){this.assertWritable();const captured=clone(input),gamePath=game(captured.gamePath),created=new Date().toISOString();return this.saveProfile({format:1,id:crypto.randomUUID(),name:name(captured.name),gamePath,created,updated:created,mods:this.select(gamePath,captured.modIds)});}
  copy(key:string,newName?:string){const original=this.profile(key),created=new Date().toISOString(),suffix=' 副本';const defaultName=original.name.slice(0,120-suffix.length).replace(/[\uD800-\uDBFF]$/u,'').trimEnd()+suffix;return this.saveProfile({...original,id:crypto.randomUUID(),name:name(newName??defaultName),created,updated:created});}
  rename(key:string,newName:string){const original=this.profile(key);return this.saveProfile({...original,name:name(newName),updated:new Date().toISOString()});}
  updateSelection(key:string,modIds:string[]){const original=this.profile(key);return this.saveProfile({...original,mods:this.select(original.gamePath,modIds),updated:new Date().toISOString()});}
  exportProfile(key:string){const p=this.profile(key),value={format:'gems-profile',version:1,name:p.name,mods:p.mods},pretty=JSON.stringify(value,null,2);const output=Buffer.byteLength(pretty)<=MAX_PROFILE_IMPORT_BYTES?pretty:JSON.stringify(value);if(Buffer.byteLength(output)>MAX_PROFILE_IMPORT_BYTES)throw new Error('配置方案导出超过256KiB上限，未生成不可重新导入的文件');return output;}
  importProfile(source:string,gamePath:string){
    this.assertWritable();if(typeof source!=='string'||Buffer.byteLength(source)>MAX_PROFILE_IMPORT_BYTES)throw new Error('配置方案文件超过256KiB上限或不是文本');let raw:unknown;try{raw=JSON.parse(source);}catch{throw new Error('配置方案不是有效JSON');}const p=object(raw,['format','version','name','mods']);if(p.format!=='gems-profile'||p.version!==1)throw new Error('不支持此配置方案格式或版本');const created=new Date().toISOString();return this.saveProfile({format:1,id:crypto.randomUUID(),name:name(p.name),gamePath:game(gamePath),created,updated:created,mods:clone(refs(p.mods))});
  }
  private assertGame(gamePath:string,identity?:string){if(!sameGamePath(game(this.currentGamePath()),gamePath))throw new Error('当前绑定的游戏目录与方案不一致，已停止切换');noLinks(path.parse(gamePath).root,gamePath);if(identity&&directoryIdentity(gamePath)!==identity)throw new Error('游戏目录身份发生变化，已停止方案事务');}
  private async guard(gamePath:string,identity?:string){this.assertGame(gamePath,identity);await this.baseGameGuard(gamePath);this.assertGame(gamePath,identity);}
  async planSwitch(key:string){
    this.assertWritable();const profile=clone(this.profile(key));await this.guard(profile.gamePath);const prepared=await prepare(this.store,this.backup,profile);await this.guard(profile.gamePath,prepared.gameIdentity);if(digest(this.profile(key))!==digest(profile)||catalog(this.store).digest!==prepared.catalogDigest)throw new Error('方案或安装记录在预览期间变化，请重新预览');
    if(this.plans.size>=8)this.plans.delete(this.plans.keys().next().value!);this.plans.set(prepared.plan.id,clone(prepared));return clone(prepared.plan);
  }
  private admitJournal(value:Journal){validateJournal(value.id,value);const existing=readJournals(this.store),others=existing.filter(j=>j.id!==value.id);if(others.length>=1000||others.reduce((sum,j)=>sum+Buffer.byteLength(JSON.stringify(j)),0)+Buffer.byteLength(JSON.stringify(value))+8192>32*1024**2)throw new Error('方案切换账本达到1000项或32MiB安全上限');}
  private checkpoint(initial:Journal){
    let expected=clone(initial);
    const check=()=>{const current=readJournals(this.store).find(j=>j.id===expected.id);if(!current||digest(current)!==digest(expected))throw new Error('方案切换账本在操作期间变化，停止并保留最新记录');};
    return{check,save:(value:Journal)=>{check();this.admitJournal(value);const captured=clone(value);this.store.put(JOURNAL_KIND,captured.id,captured);expected=captured;}};
  }
  private assertCatalog(expected:string){if(catalog(this.store).digest!==expected)throw new Error('安装所有权或事务记录在方案操作期间变化，已停止并保留当前文件');}
  async execute(planId:string,approval:ProfileApproval):Promise<ProfileSwitchResult>{
    const cached=this.plans.get(planId);if(!cached)throw new Error('方案预览已失效，请重新预览');const prepared=clone(cached);this.plans.delete(planId);const approved=clone(approval);
    if(!approved||approved.confirmed!==true)throw new Error('切换需要明确确认所列模组顺序、覆盖层级和文件恢复');if(prepared.plan.highRisk&&approved.binary!==true)throw new Error('脚本及二进制方案需要单独确认风险');
    if(prepared.plan.blockers.length)throw new Error(prepared.plan.blockers.join('；'));if(Date.now()-Date.parse(prepared.plan.created)>30*60*1000)throw new Error('方案预览超过30分钟，请重新预览');
    return this.installer.exclusive(async()=>{
      this.assertWritable();const plan=prepared.plan,release=acquireGameDirectories([plan.gamePath]);
      try{
        await this.guard(plan.gamePath,prepared.gameIdentity);if(digest(this.profile(plan.profileId))!==digest(prepared.profile))throw new Error('配置方案自预览后变化，请重新预览');this.assertCatalog(prepared.catalogDigest);validateFinalRecords(this.store,prepared.changes);
        for(const f of plan.files){const target=inside(plan.gamePath,validateTarget(f.target));noLinks(plan.gamePath,target);if(await hashOrNull(target)!==f.before)throw new Error('目标自方案预览后发生变化：'+f.target);this.assertCatalog(prepared.catalogDigest);}
        if(digest(this.profile(plan.profileId))!==digest(prepared.profile))throw new Error('配置方案在文件核验期间变化，请重新预览');
        const journal:Journal={format:1,id:crypto.randomUUID(),profileId:plan.profileId,name:plan.name,gamePath:plan.gamePath,gameIdentity:prepared.gameIdentity,catalogDigest:prepared.catalogDigest,created:new Date().toISOString(),state:'preparing',files:plan.files.map(f=>({...f,applied:false}))};this.admitJournal(journal);validateBatchBudget(prepared.changes,journal);
        this.store.put(JOURNAL_KIND,journal.id,journal);const checkpoint=this.checkpoint(journal);
        const assertUnchanged=()=>{checkpoint.check();this.assertCatalog(prepared.catalogDigest);this.assertGame(plan.gamePath,prepared.gameIdentity);if(digest(this.profile(plan.profileId))!==digest(prepared.profile))throw new Error('配置方案在切换期间变化，停止并恢复原状态');};
        try{
          // All inputs and outputs are backed up before the first game mutation.
          const required=new Set<string>();for(const change of prepared.changes)if(change.operation==='put'&&change.kind==='transaction'){const tx=change.value as {changes:{before:string|null;after:string|null}[]};for(const f of tx.changes)for(const hash of [f.before,f.after])if(hash)required.add(hash);}
          for(const f of journal.files){await this.guard(plan.gamePath,prepared.gameIdentity);assertUnchanged();const target=inside(plan.gamePath,f.target);noLinks(plan.gamePath,target);if(await hashOrNull(target)!==f.before)throw new Error('备份前方案目标发生变化：'+f.target);if(f.before&&await this.backup.put(target)!==f.before)throw new Error('备份期间方案目标发生变化');assertUnchanged();}
          for(const hash of required){const file=this.backup.file(hash);noLinks(this.backup.root,file);if((await inspectFileHash(file)).hash!==hash)throw new Error('方案输出或恢复备份校验失败');assertUnchanged();}
          journal.state='executing';checkpoint.save(journal);
          for(const [index,f] of journal.files.entries()){
            if(!f.changed)continue;await this.guard(plan.gamePath,prepared.gameIdentity);assertUnchanged();const target=inside(plan.gamePath,f.target);noLinks(plan.gamePath,target);const captured=captureCommitTarget(target);if(await hashOrNull(target)!==f.before)throw new Error('写入前方案目标发生变化：'+f.target);assertCommitTarget(captured);assertUnchanged();f.applied=true;checkpoint.save(journal);
            if(f.after)await this.backup.restore(f.after,target,f.before,()=>this.guard(plan.gamePath,prepared.gameIdentity),assertUnchanged);
            else{await this.guard(plan.gamePath,prepared.gameIdentity);assertUnchanged();assertCommitTarget(captured);noLinks(plan.gamePath,target);fs.unlinkSync(target);}
            assertUnchanged();this.installer.progress('正在切换方案并校验 '+f.target,index+1,journal.files.length);
          }
          const targets=[];for(const f of journal.files){const target=inside(plan.gamePath,f.target);noLinks(plan.gamePath,target);const captured=captureCommitTarget(target);if(await hashOrNull(target)!==f.after)throw new Error('方案提交前文件校验失败：'+f.target);assertCommitTarget(captured);targets.push(captured);}
          await this.guard(plan.gamePath,prepared.gameIdentity);assertUnchanged();
          const currentMods=catalog(this.store).mods,changes=clone(prepared.changes);for(const change of changes)if(change.operation==='put'&&change.kind==='mod')(change.value as ModRecord).metadata=currentMods.find(m=>m.id===change.id)?.metadata;
          validateFinalRecords(this.store,changes);const completed:Journal={...journal,state:'completed'};this.admitJournal(completed);const active:Active={profileId:plan.profileId,gamePath:plan.gamePath,switchId:journal.id};
          const batch:DocumentChange[]=[...changes,{operation:'put',kind:'profile-active',id:activeId(plan.gamePath),value:active},{operation:'put',kind:JOURNAL_KIND,id:journal.id,value:completed}];if(Buffer.byteLength(JSON.stringify(batch))>16*1024**2)throw new Error('方案最终提交超过16MiB上限，未提交');for(const target of targets)assertCommitTarget(target);assertUnchanged();this.store.writeBatch(batch);
          return{id:journal.id,state:'completed',message:'配置方案文件与所有权已原子提交；游戏内加载待实测',gameplayVerified:false};
        }catch(error){
          checkpoint.check();const persisted=readJournals(this.store).find(j=>j.id===journal.id)!;
          const result=await this.restore(persisted);throw new Error(explainError(error)+'；'+result.message,{cause:error});
        }
      }finally{release();}
    });
  }
  private async restore(input:Journal):Promise<ProfileSwitchResult>{
    const journal=clone(input),checkpoint=this.checkpoint(journal);journal.state='recovery-required';checkpoint.save(journal);
    const assertUnchanged=()=>{checkpoint.check();this.assertCatalog(journal.catalogDigest);this.assertGame(journal.gamePath,journal.gameIdentity);};
    try{
      await this.guard(journal.gamePath,journal.gameIdentity);assertUnchanged();
      // Validate every needed rollback blob before restoring the first file.
      for(const f of journal.files.filter(f=>f.applied&&f.before)){const source=this.backup.file(f.before!);noLinks(this.backup.root,source);if((await inspectFileHash(source)).hash!==f.before)throw new Error('方案恢复备份校验失败');assertUnchanged();}
      for(const [index,f] of [...journal.files].reverse().entries()){
        if(!f.applied)continue;await this.guard(journal.gamePath,journal.gameIdentity);assertUnchanged();const target=inside(journal.gamePath,validateTarget(f.target));noLinks(journal.gamePath,target);const captured=captureCommitTarget(target),current=await hashOrNull(target);assertCommitTarget(captured);assertUnchanged();
        if(current!==f.before){if(current!==f.after)throw new Error('方案目标已被外部修改，保留该文件并等待处理：'+f.target);if(f.before)await this.backup.restore(f.before,target,f.after,()=>this.guard(journal.gamePath,journal.gameIdentity),assertUnchanged);else{await this.guard(journal.gamePath,journal.gameIdentity);assertUnchanged();assertCommitTarget(captured);noLinks(journal.gamePath,target);fs.unlinkSync(target);}}
        f.applied=false;checkpoint.save(journal);this.installer.progress('正在恢复方案切换前状态 '+f.target,index+1,journal.files.length);
      }
      // Unchanged members are part of the captured baseline too; never claim a
      // complete recovery while one of those files changed outside this operation.
      const restoredTargets=[];for(const f of journal.files){const target=inside(journal.gamePath,f.target),captured=captureCommitTarget(target);if(await hashOrNull(target)!==f.before)throw new Error('方案恢复核对发现外部变化：'+f.target);assertCommitTarget(captured);restoredTargets.push(captured);assertUnchanged();}
      await this.guard(journal.gamePath,journal.gameIdentity);assertUnchanged();for(const target of restoredTargets)assertCommitTarget(target);journal.state='rolled-back';journal.error=undefined;checkpoint.save(journal);return{id:journal.id,state:'rolled-back',message:'已恢复整次方案切换前的文件和原有安装状态',gameplayVerified:false};
    }catch(error){checkpoint.check();journal.error=explainError(error);checkpoint.save(journal);return{id:journal.id,state:'recovery-required',message:'方案恢复待处理：'+journal.error,gameplayVerified:false};}
  }
  async recover():Promise<ProfileSwitchResult[]>{
    return this.installer.exclusive(async()=>{const pending=readJournals(this.store).filter(pendingJournal);if(pending.length>1)throw new Error('发现多个未完成配置方案事务，不能推测恢复顺序；请保留现场核对');const release=acquireGameDirectories(pending.map(j=>j.gamePath));try{const results:ProfileSwitchResult[]=[];for(const journal of pending)results.push(await this.restore(journal));return results;}finally{release();}});
  }
}
