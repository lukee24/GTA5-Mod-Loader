import fs from 'node:fs';import path from 'node:path';
import {directoryIdentity,fileStamp} from './path-identity';
export interface CommitTarget {readonly file:string;readonly directory:string;readonly stamp:string|null}
export function captureCommitTarget(file:string):CommitTarget{
 const directory=directoryIdentity(path.dirname(file),true);let stamp:string|null=null;
 try{const stat=fs.lstatSync(file,{bigint:true});if(!stat.isFile()||stat.isSymbolicLink())throw new Error('提交目标不是普通文件，已停止写入');stamp=fileStamp(stat);}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 return Object.freeze({file,directory,stamp});
}
export function assertCommitTarget(expected:CommitTarget){
 const current=captureCommitTarget(expected.file);
 if(current.directory!==expected.directory||current.stamp!==expected.stamp)throw new Error('提交前目标发生变化，未覆盖或删除用户文件');
}
