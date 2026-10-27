import fs from 'node:fs';import path from 'node:path';
import {inspectFileHash,MAX_BYTES} from '../core/security';
import {directoryIdentity as restoreDirectoryIdentity,fileIdentity as identity,fileStamp as stamp} from '../core/path-identity';
export {directoryIdentity as restoreDirectoryIdentity} from '../core/path-identity';
export interface RestoreStage {readonly file:string;readonly directory:string;readonly identity:string;readonly stamp:string;readonly bytes:number}
const failure=(cause?:unknown)=>new Error('恢复临时副本校验失败或身份发生变化，未覆盖目标文件',{cause});
export function captureRestoreStage(file:string,directory:string):RestoreStage{
 try{
  if(restoreDirectoryIdentity(path.dirname(file))!==directory)throw failure();
  const stat=fs.lstatSync(file,{bigint:true});
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||stat.size<0n||stat.size>BigInt(MAX_BYTES))throw failure();
  return Object.freeze({file,directory,identity:identity(stat),stamp:stamp(stat),bytes:Number(stat.size)});
 }catch(error){throw failure(error);}
}
export function assertRestoreStage(stage:RestoreStage){
 const current=captureRestoreStage(stage.file,stage.directory);
 if(current.stamp!==stage.stamp)throw failure();
}
export async function verifyRestoreStage(stage:RestoreStage,hash:string,bytes:number){
 try{assertRestoreStage(stage);const evidence=await inspectFileHash(stage.file,{expectedBytes:bytes});if(evidence.hash!==hash)throw failure();assertRestoreStage(stage);}
 catch(error){throw failure(error);}
}
/** Remove only the file identity owned by this operation, still in the same directory. */
export function cleanupRestoreStage(stage:RestoreStage){
 try{
  if(restoreDirectoryIdentity(path.dirname(stage.file))!==stage.directory)return false;
  const stat=fs.lstatSync(stage.file,{bigint:true});
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||identity(stat)!==stage.identity)return false;
  fs.unlinkSync(stage.file);return true;
 }catch{return false;}
}
