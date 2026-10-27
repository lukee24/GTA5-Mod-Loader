import fs from 'node:fs';import path from 'node:path';
import {inspectFileHash} from '../core/security';
import {captureCommitTarget,assertCommitTarget} from '../core/commit-target';
import {directoryIdentity,fileIdentity} from '../core/path-identity';
import {cleanupRestoreStage,type RestoreStage} from './restore-stage';

/** Read an existing blob without overwriting it, including a concurrent winner. */
export async function verifyBlob(file:string,directory:string,hash:string,bytes:number){
 try{
  const checkpoint=captureCommitTarget(file);
  if(checkpoint.directory!==directory||checkpoint.stamp===null)throw new Error('备份目标身份发生变化');
  const actual=await inspectFileHash(file,{expectedBytes:bytes});
  if(actual.hash!==hash)throw new Error('备份内容不匹配');assertCommitTarget(checkpoint);
 }catch(error){throw new Error('已保存的备份校验失败，未覆盖原文件',{cause:error});}
}

/** After exclusive hard-link publication, remove only our own two-link staging name. */
export function cleanupBlobStage(stage:RestoreStage,target:string,linked:boolean){
 if(!linked)return cleanupRestoreStage(stage);
 try{
  if(directoryIdentity(path.dirname(stage.file))!==stage.directory||directoryIdentity(path.dirname(target))!==stage.directory)return false;
  const temporary=fs.lstatSync(stage.file,{bigint:true}),blob=fs.lstatSync(target,{bigint:true});
  if(!temporary.isFile()||temporary.isSymbolicLink()||temporary.nlink!==2n||fileIdentity(temporary)!==stage.identity)return false;
  if(!blob.isFile()||blob.isSymbolicLink()||blob.nlink!==2n||fileIdentity(blob)!==stage.identity)return false;
  fs.unlinkSync(stage.file);return true;
 }catch{return false;}
}
