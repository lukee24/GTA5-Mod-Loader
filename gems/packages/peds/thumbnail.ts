import fs from 'node:fs';
import path from 'node:path';
import {inflateSync} from 'node:zlib';
import type {Store} from '../database';
import type {FileEntry} from '../core/types';
import {noLinks,relativeSafe} from '../core/security';
import {readTextSnapshot} from '../scanner/text-snapshot';
import {readPedReferenceIndex,sourceReport} from './index';
import {canonicalGameRoot,digest,fail,hex,object,sourceKey,strictJson,text} from './validation';
import type {PedIdentity,PedThumbnail,PedThumbnailView} from './types';

export const PED_THUMBNAIL_BYTES=512*1024,PED_THUMBNAIL_SIDE=2048,PED_THUMBNAIL_PIXELS=4*1024*1024;
const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Array.from({length:256},(_,value)=>{let n=value;for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes:Buffer){let n=0xffffffff;for(const byte of bytes)n=crcTable[(n^byte)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
function fingerprint(stat:fs.BigIntStats){return [stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.nlink].join(':');}
function contained(root:string,file:string){
 noLinks(root,file);const base=canonicalGameRoot(fs.realpathSync.native(root)),actual=canonicalGameRoot(fs.realpathSync.native(file));
 if(!actual.startsWith(base.endsWith('\\')?base:base+'\\'))fail('缩略图不在资料根目录内');
 noLinks(base,actual);
}
function readImage(root:string,file:FileEntry){
 if(!['.png','.jpg','.jpeg'].includes(path.extname(file.path).toLowerCase()))fail('人物缩略图仅支持PNG/JPEG，不支持SVG或远程URL');
 if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>PED_THUMBNAIL_BYTES||!hex(file.hash))fail('缩略图超过512KiB或扫描记录无效');
 contained(root,file.source);const fd=fs.openSync(file.source,'r');
 try{
  const before=fs.fstatSync(fd,{bigint:true});if(!before.isFile()||before.nlink!==1n||before.size!==BigInt(file.size))fail('缩略图不是与扫描大小匹配的独立普通文件');
  const bytes=Buffer.alloc(file.size);let at=0;while(at<bytes.length){const n=fs.readSync(fd,bytes,at,bytes.length-at,at);if(!n)fail('缩略图读取不完整');at+=n;}
  contained(root,file.source);if(fingerprint(fs.fstatSync(fd,{bigint:true}))!==fingerprint(before)||fingerprint(fs.lstatSync(file.source,{bigint:true}))!==fingerprint(before))fail('缩略图读取期间文件身份变化');
  if(digest(bytes)!==file.hash)fail('缩略图与扫描摘要不一致');return bytes;
 }finally{fs.closeSync(fd);}
}
/** Bounded PNG decoding checks. Only non-interlaced, 8-bit images are admitted. */
export function inspectPedPng(bytes:Buffer):{width:number;height:number}{
 if(bytes.length>PED_THUMBNAIL_BYTES||bytes.length<45||!bytes.subarray(0,8).equals(pngSignature))fail('缩略图不是受支持的PNG');
 let at=8,width=0,height=0,channels=0,colour=-1,chunks=0,palette=false,ended=false,idatEnded=false;const compressed:Buffer[]=[];
 while(at<bytes.length){
  if(++chunks>1024||bytes.length-at<12)fail('PNG块数量或结构无效');const size=bytes.readUInt32BE(at),end=at+12+size;if(end>bytes.length)fail('PNG块长度无效');
  const type=bytes.toString('ascii',at+4,at+8),data=bytes.subarray(at+8,at+8+size);if(!/^[A-Za-z]{4}$/.test(type)||crc(bytes.subarray(at+4,at+8+size))!==bytes.readUInt32BE(at+8+size))fail('PNG块名称或CRC无效');
  if(chunks===1&&type!=='IHDR')fail('PNG首块必须是IHDR');
  if(type==='IHDR'){
   if(chunks!==1||size!==13)fail('PNG头重复或长度无效');width=data.readUInt32BE(0);height=data.readUInt32BE(4);colour=data[9];channels=({0:1,2:3,3:1,4:2,6:4} as Record<number,number>)[colour]||0;
   if(!width||!height||width>PED_THUMBNAIL_SIDE||height>PED_THUMBNAIL_SIDE||width*height>PED_THUMBNAIL_PIXELS||data[8]!==8||!channels||data[10]!==0||data[11]!==0||data[12]!==0)fail('PNG需为非交错8-bit图，单边不超过2048、像素不超过4Mi');
  }else if(type==='PLTE'){
   if(palette||compressed.length||size===0||size>768||size%3||colour===0||colour===4)fail('PNG调色板无效');palette=true;
  }else if(type==='IDAT'){
   if(idatEnded||colour===3&&!palette)fail('PNG图像块顺序无效');compressed.push(data);
  }else if(type==='IEND'){
   if(size||!compressed.length||end!==bytes.length)fail('PNG结束块或尾部无效');ended=true;at=end;break;
  }else{
   if(type[0]===type[0].toUpperCase())fail('PNG包含未支持的关键块');if(compressed.length)idatEnded=true;
  }
  at=end;
 }
 if(!ended)fail('PNG缺少结束块');const rowBytes=width*channels+1,expected=rowBytes*height;let decoded:Buffer;
 try{decoded=inflateSync(Buffer.concat(compressed),{maxOutputLength:expected});}catch{fail('PNG图像压缩数据无效或超过像素预算');}
 if(decoded.length!==expected)fail('PNG解压尺寸与声明不一致');for(let row=0;row<height;row++)if(decoded[row*rowBytes]>4)fail('PNG行过滤器无效');return{width,height};
}
function dimensionsAllowed(width:number,height:number){return Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=PED_THUMBNAIL_SIDE&&height<=PED_THUMBNAIL_SIDE&&width*height<=PED_THUMBNAIL_PIXELS;}
/** This only admits bounded headers. JPEG pixels require the caller's real decoder. */
export function inspectPedJpegHeader(bytes:Buffer):{width:number;height:number}{
 if(bytes.length>PED_THUMBNAIL_BYTES||bytes.length<12||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)fail('缩略图JPEG起止标记或大小无效');
 let at=2,width=0,height=0,components=0,segments=0;
 while(at<bytes.length-2){
  if(++segments>2048||bytes[at++]!==255)fail('JPEG头结构或段数量无效');while(bytes[at]===255)at++;const marker=bytes[at++];
  if(marker===undefined||marker===0||marker===216||marker===217||marker>=208&&marker<=215||marker===1)fail('JPEG头标记无效');
  if(at+2>bytes.length)fail('JPEG段长度缺失');const length=bytes.readUInt16BE(at),end=at+length;if(length<2||end>bytes.length-2)fail('JPEG段长度无效');
  if(marker>=192&&marker<=207&&![196,200,204].includes(marker)){
   if(![192,194].includes(marker)||width||length<8)fail('JPEG帧类型未支持或重复');height=bytes.readUInt16BE(at+3);width=bytes.readUInt16BE(at+5);components=bytes[at+7];
   if(bytes[at+2]!==8||![1,3].includes(components)||length!==8+3*components||!dimensionsAllowed(width,height))fail('JPEG需为8-bit灰度/RGB图，单边不超过2048、像素不超过4Mi');
  }
  if(marker===218){const scanComponents=bytes[at+2];if(!width||!scanComponents||scanComponents>components||length!==6+2*scanComponents||end>=bytes.length-2)fail('JPEG扫描头无效');return{width,height};}
  at=end;
 }
 fail('JPEG缺少有效帧或扫描数据');
}
function inspectHeader(bytes:Buffer,filePath:string):Pick<PedThumbnail,'mime'|'width'|'height'>{return path.extname(filePath).toLowerCase()==='.png'?{mime:'image/png',...inspectPedPng(bytes)}:{mime:'image/jpeg',...inspectPedJpegHeader(bytes)};}
export function inspectPedThumbnail(root:string,file:FileEntry):PedThumbnail{
 const bytes=readImage(root,file);return{sourcePath:file.path,sourceSha256:file.hash,sourceBytes:file.size,...inspectHeader(bytes,file.path)};
}
export function validatePedThumbnail(value:unknown):PedThumbnail{
 const v=object(value,['sourcePath','sourceSha256','sourceBytes','mime','width','height']);
 const extension=typeof v.sourcePath==='string'?path.extname(v.sourcePath).toLowerCase():'';
 if(!text(v.sourcePath,4096)||relativeSafe(v.sourcePath)!==v.sourcePath||!['.png','.jpg','.jpeg'].includes(extension)||!hex(v.sourceSha256)||!Number.isSafeInteger(v.sourceBytes)||v.sourceBytes<=0||v.sourceBytes>PED_THUMBNAIL_BYTES||v.mime!==(extension==='.png'?'image/png':'image/jpeg')||!dimensionsAllowed(v.width,v.height))fail('缩略图描述无效');return v as PedThumbnail;
}
/** Never serves a path supplied by the renderer or an image guessed from a filename. */
export function readPedThumbnail(store:Store,identity:PedIdentity,decodeJpeg?:(bytes:Buffer)=>{width:number;height:number}|null):PedThumbnailView|null{
 const id=object(identity,['source','referenceId']);sourceKey(id.source);if(!hex(id.referenceId))fail('缩略图引用身份无效');
 const view=readPedReferenceIndex(store,id.source);if(view.status!=='current'||!view.analysis)fail('仅当前人物索引可读取缩略图');
 const reference=view.analysis.references.find(r=>r.referenceId===id.referenceId);if(!reference)fail('缩略图引用不属于当前来源');if(!reference.thumbnail)return null;
 const descriptor=validatePedThumbnail(reference.thumbnail),report=sourceReport(store,id.source),manifest=report.files.find(f=>f.path.toLowerCase()==='gems.mod.json');
 if(!manifest||!reference.evidence.some(e=>e.kind==='manifest-declaration'&&e.sourcePath===manifest.path&&e.sourceSha256===manifest.hash))fail('缩略图没有对应作者声明');
 contained(store.root,manifest.source);const json=strictJson(readTextSnapshot(store.root,manifest.source,1024**2,'GEMS 清单',manifest.hash),1024**2) as any;
 if(json.format!==1||json.pedReferences?.schemaVersion!==1||!Array.isArray(json.pedReferences.entries)||json.pedReferences.entries.filter((e:any)=>e?.modelName===reference.modelName&&e.thumbnail===descriptor.sourcePath).length!==1)fail('当前清单没有匹配的缩略图声明');
 const file=report.files.find(f=>f.path===descriptor.sourcePath);if(!file||file.hash!==descriptor.sourceSha256||file.size!==descriptor.sourceBytes)fail('缩略图不属于对应扫描来源');
 const bytes=readImage(store.root,file),dimensions=inspectHeader(bytes,file.path);if(dimensions.width!==descriptor.width||dimensions.height!==descriptor.height||dimensions.mime!==descriptor.mime)fail('缩略图尺寸或类型与索引不同');
 if(descriptor.mime==='image/jpeg'){
  if(!decodeJpeg)fail('JPEG缩略图需要实际图像解码器，尚未返回图像');let decoded:{width:number;height:number}|null;
  try{decoded=decodeJpeg(bytes);}catch{fail('JPEG实际图像解码失败');}
  if(!decoded||!dimensionsAllowed(decoded.width,decoded.height)||decoded.width!==descriptor.width||decoded.height!==descriptor.height)fail('JPEG实际解码为空或尺寸与声明不同');
 }
 return{...descriptor,dataUrl:'data:'+descriptor.mime+';base64,'+bytes.toString('base64')};
}
