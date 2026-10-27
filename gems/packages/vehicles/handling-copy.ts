import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {noLinks} from '../core/security';import {directoryIdentity,fileIdentity,fileStamp} from '../core/path-identity';import {verifyOwnedFile} from '../core/atomic-write';import {editHandling,type HandlingChange} from './handling';
interface OwnedCopy {file:string;identity:string;bytes:number;hash:string}
/** Creates a new owned export with its original snapshot; never edits an input or game file. */
export function saveHandlingCopy(root:string,text:string,name:string,changes:HandlingChange[]){
 const result=editHandling(text,name,changes),base=path.join(root,'handling-edits');noLinks(root,base);fs.mkdirSync(base,{recursive:true});
 const directory=path.join(base,crypto.randomUUID());fs.mkdirSync(directory);const parent=directoryIdentity(directory),created:OwnedCopy[]=[];
 function verify(copy:OwnedCopy){return verifyOwnedFile(copy.file,parent,copy.identity,copy.bytes,copy.hash);}
 function write(name:string,content:string){
  const file=path.join(directory,name),bytes=Buffer.byteLength(content,'utf8'),hash=crypto.createHash('sha256').update(content,'utf8').digest('hex');
  noLinks(root,file);if(directoryIdentity(directory)!==parent)throw new Error('配置副本目录发生变化，未继续写入');const fd=fs.openSync(file,'wx');let copy:OwnedCopy;
  try{
   const stat=fs.fstatSync(fd,{bigint:true});if(!stat.isFile()||stat.nlink!==1n)throw new Error('配置副本文件身份无法确认');
   copy={file,identity:fileIdentity(stat),bytes,hash};created.push(copy);
   if(directoryIdentity(directory)!==parent)throw new Error('配置副本目录发生变化，未继续写入');fs.writeFileSync(fd,content,'utf8');fs.fsyncSync(fd);
  }finally{fs.closeSync(fd);}
  verify(copy);return file;
 }
 try{
  const original=write('original.meta',text),output=write('handling.meta',result.xml),report={schemaVersion:1,model:name,created:new Date().toISOString(),original,output,beforeSha256:result.beforeSha256,afterSha256:result.afterSha256,changes:result.changes,validation:result.validation,gameWritten:false,installed:false};
  write('report.json',JSON.stringify(report,null,2));const sealed=created.map(copy=>({copy,stamp:verify(copy)}));
  for(const {copy,stamp}of sealed){if(directoryIdentity(directory)!==parent)throw new Error('配置副本目录发生变化');noLinks(root,copy.file);const stat=fs.lstatSync(copy.file,{bigint:true});if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||fileStamp(stat)!==stamp)throw new Error('配置副本在最终核验期间发生变化，未确认保存成功');}
  return report;
 }catch(error){
  for(const copy of created.reverse())try{
   if(directoryIdentity(directory)!==parent)continue;noLinks(root,copy.file);const stat=fs.lstatSync(copy.file,{bigint:true});
   if(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1n&&fileIdentity(stat)===copy.identity)fs.unlinkSync(copy.file);
  }catch{/* Preserve the original error and unknown or unremovable files. */}
  throw error;
 }
}
