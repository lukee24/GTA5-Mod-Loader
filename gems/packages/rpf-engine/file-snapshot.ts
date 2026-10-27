import fs from 'node:fs';
import {open} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {noLinks} from '../core/security';
import {directoryIdentity,fileStamp} from '../core/path-identity';
import {fail} from './errors';

/** Fixed original extent, independent snapshot and two actual SHA passes. No writes. */
export async function readRpfSnapshot(filename:string,maxBytes:number):Promise<Buffer>{
  const file=path.resolve(filename);let directory:string;
  try{noLinks(path.parse(file).root,file);directory=directoryIdentity(path.dirname(file));}
  catch(cause){return fail('UNSAFE_PATH','RPF 路径包含链接、目录连接或无法确认的目录，已停止读取。',cause);}
  const info=fs.lstatSync(file,{bigint:true});if(!info.isFile()||info.isSymbolicLink())fail('NOT_FILE','所选路径不是普通 RPF 文件。');
  if(info.size>BigInt(maxBytes))fail('ARCHIVE_LIMIT','RPF 超过当前只读后端的大小限制。');
  if(info.size<16n)fail('TRUNCATED','RPF 文件头不完整。');
  const stamp=fileStamp(info),size=Number(info.size),handle=await open(file,'r');
  try{
    const check=()=>{
      try{
        noLinks(path.parse(file).root,file);
        if(directoryIdentity(path.dirname(file))!==directory||fileStamp(fs.lstatSync(file,{bigint:true}))!==stamp||fileStamp(fs.fstatSync(handle.fd,{bigint:true}))!==stamp)fail('CHANGED_DURING_READ','RPF 读取期间文件或路径发生变化，请重新分析。');
      }catch(cause){return fail('CHANGED_DURING_READ','RPF 读取期间文件或路径发生变化，请重新分析。',cause);}
    };
    check();const data=Buffer.alloc(size),first=crypto.createHash('sha256'),second=crypto.createHash('sha256');
    const readPass=async(buffer:Buffer,collect:boolean,hash:ReturnType<typeof crypto.createHash>)=>{
      let position=0;
      while(position<size){
        check();const offset=collect?position:0,length=Math.min(64*1024,size-position);
        const result=await handle.read(buffer,offset,length,position);check();
        if(!Number.isSafeInteger(result.bytesRead)||result.bytesRead<1||result.bytesRead>length)fail('CHANGED_DURING_READ','RPF 读取不完整或返回长度异常，请重新分析。');
        hash.update(buffer.subarray(offset,offset+result.bytesRead));position+=result.bytesRead;
      }
    };
    await readPass(data,true,first);
    await readPass(Buffer.alloc(Math.min(64*1024,size)),false,second);
    check();if(first.digest('hex')!==second.digest('hex'))fail('CHANGED_DURING_READ','RPF 读取期间实际内容发生变化，请重新分析。');
    return data;
  }finally{await handle.close();}
}
