import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {RpfArchive,DEFAULT_RPF_LIMITS} from './index';
import {readRpfSnapshot} from './file-snapshot';
import {noLinks,sameGamePath} from '../core/security';
import {captureCommitTarget,assertCommitTarget,type CommitTarget} from '../core/commit-target';
import {fileStamp,fileIdentity,directoryIdentity} from '../core/path-identity';

const digest=(bytes:Buffer)=>crypto.createHash('sha256').update(bytes).digest('hex');
export interface RpfReplacementPreview {
 id:string;archiveName:string;sourcePath:string;archiveSha256:string;entryId:number;entryPath:string;replacementPath:string;
 beforeBytes:number;beforeSha256:string;afterBytes:number;afterSha256:string;outputBytes:number;outputSha256:string;
 created:string;gameplayVerified:false;
}
export interface RpfCopyResult {path:string;bytes:number;sha256:string;entryPath:string;entrySha256:string;verifiedEntries:number;gameplayVerified:false;originalModified:false}

/** Read only a stable, bounded independent file; never load or execute its contents. */
function replacementSnapshot(filename:string,maxBytes:number){
 const file=path.resolve(filename);noLinks(path.parse(file).root,file);const checkpoint=captureCommitTarget(file),fd=fs.openSync(file,'r');
 try{
  const before=fs.fstatSync(fd,{bigint:true});
  if(!before.isFile()||before.nlink!==1n||before.size<1n||before.size>BigInt(maxBytes))throw new Error('替换内容必须是非空独立普通文件，且不超过 128 MiB');
  const stamp=fileStamp(before),size=Number(before.size),bytes=Buffer.alloc(size);
  const verify=()=>{noLinks(path.parse(file).root,file);assertCommitTarget(checkpoint);if(fileStamp(fs.fstatSync(fd,{bigint:true}))!==stamp)throw new Error('替换内容读取期间发生变化');};
  let offset=0;while(offset<size){verify();const requested=Math.min(64*1024,size-offset),count=fs.readSync(fd,bytes,offset,requested,offset);if(!Number.isSafeInteger(count)||count<=0||count>requested)throw new Error('替换内容读取不完整');offset+=count;}
  verify();const hash=digest(bytes),second=crypto.createHash('sha256'),chunk=Buffer.alloc(64*1024);offset=0;
  while(offset<size){verify();const requested=Math.min(chunk.length,size-offset),count=fs.readSync(fd,chunk,0,requested,offset);if(!Number.isSafeInteger(count)||count<=0||count>requested)throw new Error('替换内容复核读取不完整');second.update(chunk.subarray(0,count));offset+=count;}
  verify();if(second.digest('hex')!==hash)throw new Error('替换内容读取期间字节发生变化');
  return{bytes,hash,checkpoint};
 }finally{fs.closeSync(fd);}
}

/** Reserve a new name with O_EXCL: even a last-instant competing output is never overwritten. */
function writeNewCopy(file:string,bytes:Buffer,beforeCreate:()=>void){
 fs.mkdirSync(path.dirname(file),{recursive:true});beforeCreate();
 const parent=directoryIdentity(path.dirname(file));let fd:number|undefined;
 try{
  fd=fs.openSync(file,'wx');const owned=fileIdentity(fs.fstatSync(fd,{bigint:true}));
  const check=()=>{const opened=fs.fstatSync(fd!,{bigint:true}),current=fs.lstatSync(file,{bigint:true});if(directoryIdentity(path.dirname(file))!==parent||!opened.isFile()||opened.nlink!==1n||!current.isFile()||current.isSymbolicLink()||current.nlink!==1n||fileIdentity(opened)!==owned||fileIdentity(current)!==owned)throw new Error('独立副本写入期间文件或目录身份变化');};
  check();let offset=0;while(offset<bytes.length){check();const requested=Math.min(64*1024,bytes.length-offset),count=fs.writeSync(fd,bytes,offset,requested,offset);if(!Number.isSafeInteger(count)||count<=0||count>requested)throw new Error('独立副本写入不完整');offset+=count;}
  fs.fsyncSync(fd);check();
 }catch(error){
  if(fd!==undefined)throw new Error('独立副本导出未完成，已创建的输出保留在 '+file+'，请检查后另选文件名重试；本操作未写入原档',{cause:error});
  if((error as NodeJS.ErrnoException).code==='EEXIST')throw new Error('独立副本不能覆盖已有文件，请选择新的文件名',{cause:error});
  throw error;
 }finally{if(fd!==undefined)fs.closeSync(fd);}
}

/** One selected archive and one renderer capability. All edits publish a new independent file. */
export class RpfCopySession {
 private planned:RpfReplacementPreview|null=null;
 private constructor(readonly sourcePath:string,readonly archive:RpfArchive,private archiveHash:string){}
 static async open(file:string){
  if(typeof file!=='string'||!path.isAbsolute(file)||path.extname(file).toLowerCase()!=='.rpf')throw new Error('请选择本地 RPF 文件');
  const source=path.resolve(file),bytes=await readRpfSnapshot(source,DEFAULT_RPF_LIMITS.maxArchiveBytes);
  return new RpfCopySession(source,RpfArchive.parse(bytes,path.basename(source)),digest(bytes));
 }
 private async sourceCheckpoint():Promise<CommitTarget>{
  const checkpoint=captureCommitTarget(this.sourcePath),bytes=await readRpfSnapshot(this.sourcePath,this.archive.limits.maxArchiveBytes);assertCommitTarget(checkpoint);
  if(digest(bytes)!==this.archiveHash)throw new Error('原始 RPF 自打开后发生变化，请重新打开再预览；原档未修改');
  return checkpoint;
 }
 async preview(id:unknown,file:string):Promise<RpfReplacementPreview>{
  this.planned=null;
  if(!Number.isSafeInteger(id))throw new Error('请选择普通二进制文件条目');
  const entry=this.archive.list().find(entry=>entry.id===id);
  if(!entry||entry.type!=='binary'||entry.encrypted)throw new Error('仅支持未加密的普通二进制文件条目；资源和目录不可替换');
  if(typeof file!=='string'||!path.isAbsolute(file))throw new Error('请选择本地替换内容');
  const sourceCheckpoint=await this.sourceCheckpoint(),replacement=replacementSnapshot(file,this.archive.limits.maxExpandedBytes);
  const previous=this.archive.extractBinary(entry.id),output=this.archive.replaceBinaryEntries(new Map([[entry.id,replacement.bytes]]));
  assertCommitTarget(sourceCheckpoint);assertCommitTarget(replacement.checkpoint);
  const view:RpfReplacementPreview={id:crypto.randomUUID(),archiveName:path.basename(this.sourcePath),sourcePath:this.sourcePath,archiveSha256:this.archiveHash,entryId:entry.id,entryPath:entry.path,replacementPath:path.resolve(file),beforeBytes:previous.length,beforeSha256:digest(previous),afterBytes:replacement.bytes.length,afterSha256:replacement.hash,outputBytes:output.length,outputSha256:digest(output),created:new Date().toISOString(),gameplayVerified:false};
  this.planned=structuredClone(view);return structuredClone(view);
 }
 async export(id:unknown,filename:string,checkDestination:(file:string)=>void):Promise<RpfCopyResult>{
  const plan=this.planned;if(typeof id!=='string'||!plan||id!==plan.id)throw new Error('RPF 替换预览已失效，请重新选择内容');
  if(typeof filename!=='string'||!path.isAbsolute(filename)||path.extname(filename).toLowerCase()!=='.rpf')throw new Error('输出必须是独立的 .rpf 文件路径');
  if(typeof checkDestination!=='function')throw new Error('无法核对输出保护范围');
  const outputPath=path.resolve(filename);
  const allow=()=>{
   if(sameGamePath(outputPath,this.sourcePath)||sameGamePath(outputPath,plan.replacementPath))throw new Error('输出不能覆盖原始 RPF 或替换内容文件');
   noLinks(path.parse(outputPath).root,outputPath);checkDestination(outputPath);
   if(fs.existsSync(outputPath))throw new Error('独立副本不能覆盖已有文件，请选择新的文件名');
  };
  allow();const sourceCheckpoint=await this.sourceCheckpoint(),replacement=replacementSnapshot(plan.replacementPath,this.archive.limits.maxExpandedBytes);
  if(replacement.hash!==plan.afterSha256||replacement.bytes.length!==plan.afterBytes)throw new Error('替换内容自预览后发生变化，请重新预览；未导出');
  const output=this.archive.replaceBinaryEntries(new Map([[plan.entryId,replacement.bytes]]));
  if(output.length!==plan.outputBytes||digest(output)!==plan.outputSha256)throw new Error('RPF 重建结果与预览不一致，未导出');
  allow();assertCommitTarget(sourceCheckpoint);assertCommitTarget(replacement.checkpoint);
  writeNewCopy(outputPath,output,()=>{allow();assertCommitTarget(sourceCheckpoint);assertCommitTarget(replacement.checkpoint);});
  // The entire on-disk result must match the already verified rebuilt archive.
  const actual=await readRpfSnapshot(outputPath,this.archive.limits.maxArchiveBytes);
  if(digest(actual)!==plan.outputSha256)throw new Error('独立 RPF 已写入但回读哈希不一致，请保留输出核对；原档未修改');
  const parsed=RpfArchive.parse(actual,path.basename(outputPath),this.archive.limits);
  if(digest(parsed.extractBinary(plan.entryId))!==plan.afterSha256)throw new Error('独立 RPF 条目回读不一致，请保留输出核对；原档未修改');
  assertCommitTarget(sourceCheckpoint);assertCommitTarget(replacement.checkpoint);
  return{path:outputPath,bytes:actual.length,sha256:plan.outputSha256,entryPath:plan.entryPath,entrySha256:plan.afterSha256,verifiedEntries:parsed.list().filter(entry=>entry.type!=='directory').length,gameplayVerified:false,originalModified:false};
 }
}
