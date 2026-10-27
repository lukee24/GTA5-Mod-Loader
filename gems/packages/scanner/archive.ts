import fs from 'node:fs';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Transform,Writable,type Readable} from 'node:stream';
import yauzl from 'yauzl';
import {crc32} from 'node:zlib';
import {inside,relativeSafe,noLinks,MAX_FILES,MAX_BYTES} from '../core/security';
export const ZIP_PATH_LENGTH=4096,ZIP_DIRECTORY_DEPTH=64;
export async function extractZip(source:string,destination:string):Promise<void>{
  noLinks(path.parse(path.resolve(destination)).root,destination);fs.mkdirSync(destination,{recursive:true});let total=0,count=0;const names=new Set<string>();
  const zip=await new Promise<yauzl.ZipFile>((resolve,reject)=>yauzl.open(source,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true},(err,value)=>err?reject(err):resolve(value!)));
  await new Promise<void>((resolve,reject)=>{
    const fail=(err:unknown)=>{zip.close();reject(err);};zip.on('error',fail);zip.on('end',resolve);
    zip.on('entry',(entry:yauzl.Entry)=>{void(async()=>{
      const isDir=entry.fileName.endsWith('/');const relative=relativeSafe(isDir?entry.fileName.slice(0,-1):entry.fileName);
      if(relative.length>ZIP_PATH_LENGTH)throw new Error('压缩包相对路径长度超过4096字符，未创建该条目路径');
      const directoryDepth=relative.split('/').length-(isDir?0:1);
      if(directoryDepth>ZIP_DIRECTORY_DEPTH)throw new Error('压缩包目录嵌套超过64层安全限制，未创建该条目路径');
      if(isDir&&entry.uncompressedSize!==0)throw new Error('压缩包目录条目含非空数据，已阻止忽略目录内容');
      if(isDir&&(entry.crc32>>>0)!==0)throw new Error('压缩包空目录CRC校验声明无效');
      const mode=(entry.externalFileAttributes>>>16)&0xf000;
      if(mode===0xa000||entry.generalPurposeBitFlag&1)throw new Error('不支持符号链接或加密压缩包');
      if(++count>MAX_FILES||entry.uncompressedSize>MAX_BYTES||(total+=entry.uncompressedSize)>MAX_BYTES)throw new Error('压缩包超过安全容量或文件数量限制');
      if(entry.uncompressedSize>1024*1024&&entry.uncompressedSize/Math.max(1,entry.compressedSize)>300)throw new Error('异常压缩比例，已阻止潜在解压炸弹');
      if(names.has(relative.toLowerCase()))throw new Error('压缩包包含重复或大小写冲突路径');names.add(relative.toLowerCase());
      const target=inside(destination,relative);noLinks(destination,target);
      const input=await new Promise<Readable>((res,rej)=>zip.openReadStream(entry,(err,stream)=>err?rej(err):res(stream!)));
      let bytes=0,crc=0;const limiter=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;crc=crc32(chunk,crc);callback(bytes>entry.uncompressedSize?new Error('解压长度不匹配'):null,chunk);}});
      try{
        if(isDir){
          // Verify even an empty compressed directory stream before creating its path.
          await pipeline(input,limiter,new Writable({write(_chunk,_encoding,callback){callback();}}));
        }else{
          fs.mkdirSync(path.dirname(target),{recursive:true});noLinks(destination,target);
          await pipeline(input,limiter,fs.createWriteStream(target,{flags:'wx'}));
        }
      }finally{input.destroy();}
      if(bytes!==entry.uncompressedSize)throw new Error('解压数据长度不匹配');if(crc!==(entry.crc32>>>0))throw new Error('压缩包 CRC 校验失败');
      if(isDir){noLinks(destination,target);fs.mkdirSync(target,{recursive:true});}zip.readEntry();
    })().catch(fail);});zip.readEntry();
  });
}
