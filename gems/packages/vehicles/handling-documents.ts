import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {noLinks} from '../core/security';
import {readHandling,type HandlingChange,type HandlingModel} from './handling';
import {saveHandlingCopy} from './handling-copy';

export interface HandlingDocument {id:string;filename:string;loaded:string;sha256:string;models:HandlingModel[];}
export type HandlingCopyReport=ReturnType<typeof saveHandlingCopy>;
/** One bounded, immutable document snapshot. Renderer supplies a capability ID, never output paths or XML. */
export class HandlingDocuments {
 private current:{view:HandlingDocument;text:string}|null=null;
 constructor(private readonly root:string){}
 open(file:string):HandlingDocument {
  if(typeof file!=='string'||!path.isAbsolute(file)||!['.meta','.xml'].includes(path.extname(file).toLowerCase()))throw new Error('请选择本地 META 或 XML 配置文件');
  const volume=path.parse(file).root;noLinks(volume,file);
  const fd=fs.openSync(file,'r');let text:string;
  try{
   const before=fs.fstatSync(fd);
   if(!before.isFile()||before.nlink!==1||before.size>4*1024**2)throw new Error('配置不是普通独立文件或超过4 MiB');
   const bytes=Buffer.alloc(before.size);let offset=0;
   while(offset<bytes.length){const read=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(!read)throw new Error('配置读取不完整，请重新选择');offset+=read;}
   noLinks(volume,file);const after=fs.fstatSync(fd),current=fs.lstatSync(file);
   if([after,current].some(stat=>!stat.isFile()||stat.nlink!==1||stat.dev!==before.dev||stat.ino!==before.ino||stat.size!==before.size||stat.mtimeMs!==before.mtimeMs||stat.ctimeMs!==before.ctimeMs))throw new Error('读取期间配置已变化，请重新选择');
   try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new Error('当前配置编辑只支持有效UTF-8文本');}
  }finally{fs.closeSync(fd);}
  const models=readHandling(text),view={id:crypto.randomUUID(),filename:path.basename(file),loaded:new Date().toISOString(),sha256:crypto.createHash('sha256').update(text,'utf8').digest('hex'),models};
  this.current={view,text};return structuredClone(view);
 }
 save(id:unknown,model:unknown,changes:unknown):HandlingCopyReport {
  if(typeof id!=='string'||!this.current||id!==this.current.view.id)throw new Error('配置会话已失效，请重新选择文件');
  if(typeof model!=='string'||!Array.isArray(changes))throw new Error('配置模型或修改清单无效');
  return saveHandlingCopy(this.root,this.current.text,model,changes as HandlingChange[]);
 }
}
