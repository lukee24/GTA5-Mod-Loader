import fs from 'node:fs';
import path from 'node:path';
import {hashFile,inspectFileHash,hashOrNull,noLinks,atomicWrite} from '../core/security';
import {planSnapshot,validateSnapshot,type SnapshotPlan} from './snapshot-plan';
import {restoreDirectoryIdentity,captureRestoreStage,verifyRestoreStage,assertRestoreStage,cleanupRestoreStage,type RestoreStage} from './restore-stage';
import {captureCommitTarget,assertCommitTarget} from '../core/commit-target';
import {verifyBlob,cleanupBlobStage} from './blob-stage';
function syncFile(file:string){const fd=fs.openSync(file,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
export class Backup {
  constructor(public root:string){noLinks(path.parse(path.resolve(root)).root,path.join(root,'blobs'));fs.mkdirSync(path.join(root,'blobs'),{recursive:true});}
  file(hash:string){if(!/^[0-9a-f]{64}$/.test(hash))throw new Error('备份哈希无效');return path.join(this.root,'blobs',hash);}
  async put(file:string){
    noLinks(path.parse(path.resolve(file)).root,file);
    const evidence=await inspectFileHash(file),hash=evidence.hash,target=this.file(hash);noLinks(this.root,target);
    const directory=restoreDirectoryIdentity(path.dirname(target));
    const checkpoint=captureCommitTarget(target);
    if(checkpoint.stamp!==null){await verifyBlob(target,directory,hash,evidence.bytes);assertCommitTarget(checkpoint);}
    else{
      const tmp=target+'.tmp-'+crypto.randomUUID();let stage:RestoreStage|undefined,linked=false;
      try{
        noLinks(path.parse(path.resolve(file)).root,file);fs.copyFileSync(file,tmp,fs.constants.COPYFILE_EXCL);
        stage=captureRestoreStage(tmp,directory);await verifyRestoreStage(stage,hash,evidence.bytes);
        assertRestoreStage(stage);syncFile(tmp);await verifyRestoreStage(stage,hash,evidence.bytes);
        assertRestoreStage(stage);noLinks(this.root,target);
        // link creates a new name exclusively: unlike rename, it cannot replace a concurrent blob.
        try{fs.linkSync(tmp,target);linked=true;}
        catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw new Error('无法安全发布备份，未覆盖已有文件',{cause:error});}
        if(linked){if(!cleanupBlobStage(stage,target,true))throw new Error('备份临时副本身份发生变化，未确认保存成功');stage=undefined;}
        await verifyBlob(target,directory,hash,evidence.bytes);
      }finally{if(stage)cleanupBlobStage(stage,target,linked);}
    }
    return hash;
  }
  async restore(hash:string,target:string,expectedCurrent?:string|null,beforeCommit?:()=>void|Promise<void>,beforePublish?:()=>void){
    if(beforeCommit!==undefined&&typeof beforeCommit!=='function')throw new Error('无法验证恢复提交条件，未开始写入');
    if(beforePublish!==undefined&&typeof beforePublish!=='function')throw new Error('无法验证恢复同步提交条件，未开始写入');
    const source=this.file(hash),volume=path.parse(path.resolve(target)).root;
    noLinks(this.root,source);noLinks(volume,target);
    const evidence=await inspectFileHash(source);if(evidence.hash!==hash)throw new Error('备份校验失败，未进行写入');
    noLinks(volume,target);fs.mkdirSync(path.dirname(target),{recursive:true});const temp=target+'.gems-'+crypto.randomUUID();
    const directory=restoreDirectoryIdentity(path.dirname(target));let stage:RestoreStage|undefined;
    try{
      noLinks(this.root,source);noLinks(volume,temp);fs.copyFileSync(source,temp,fs.constants.COPYFILE_EXCL);stage=captureRestoreStage(temp,directory);
      // 完整校验并刷新临时副本，防止损坏数据先覆盖原文件。
      await verifyRestoreStage(stage,hash,evidence.bytes);assertRestoreStage(stage);syncFile(temp);
      // 刷新之后重新核验，目标SHA异步核对期间的暂存替换也须阻止提交。
      await verifyRestoreStage(stage,hash,evidence.bytes);noLinks(volume,target);
      const checkpoint=captureCommitTarget(target);
      if(expectedCurrent!==undefined&&await hashOrNull(target)!==expectedCurrent)throw new Error('提交前目标发生变化，未覆盖用户文件');
      assertCommitTarget(checkpoint);await beforeCommit?.();
      // Run after the final await: an async guard's completion can itself schedule
      // ledger changes before this continuation resumes. Do not await this check.
      if(beforePublish){
        const result=(beforePublish as ()=>unknown)();
        if(result!==undefined){
          if(result&&typeof(result as any).then==='function')Promise.resolve(result).catch(()=>{});
          throw new Error('恢复同步提交检查必须同步完成且不返回值，未提交文件');
        }
      }
      assertRestoreStage(stage);assertCommitTarget(checkpoint);noLinks(volume,target);fs.renameSync(temp,target);
    }finally{if(stage)cleanupRestoreStage(stage);}
    if(await hashFile(target)!==hash)throw new Error('写入后 SHA-256 校验失败');
  }
  async snapshot(files:{absolute:string;relative:string}[],gamePath:string,beforeWrite:(plan:SnapshotPlan)=>void|Promise<void>=()=>{}){
    if(typeof beforeWrite!=='function')throw new Error('快照预检回调无效，未开始备份');
    const plan=planSnapshot(files,gamePath),target=path.join(this.root,'snapshots',plan.id+'.json');noLinks(this.root,target);if(fs.existsSync(target))throw new Error('快照标识已存在，未覆盖原记录');
    try{await beforeWrite(plan);}catch(error){if(error instanceof TypeError)throw new Error('快照预检未完成或试图修改只读计划，未开始备份',{cause:error});throw error;}
    const entries=[];for(const file of plan.files){noLinks(plan.gamePath,file.absolute);entries.push({path:file.relative,hash:await this.put(file.absolute)});}
    const record={id:plan.id,name:plan.name,created:plan.created,gamePath:plan.gamePath,entries};validateSnapshot(record.id,record);
    atomicWrite(target,JSON.stringify(record,null,2),()=>{if(fs.existsSync(target))throw new Error('快照记录自备份开始后已出现，未覆盖原记录');});return record;
  }
}
