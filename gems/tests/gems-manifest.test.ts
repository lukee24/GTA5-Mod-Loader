import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {scan} from '../packages/scanner';import {noLinks,MAX_FILES} from '../packages/core/security';
import {readGemsManifest,parseGemsManifest,applyGemsManifest} from '../packages/scanner/manifest';
import type {FileEntry} from '../packages/core/types';
import crypto from 'node:crypto';
const base=()=>({format:1,files:[{source:'a.ini',target:'mods/a.ini'}]});
async function attempt(value:unknown){const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-manifest-')),source=path.join(root,'source');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'a.ini'),'unchanged');fs.writeFileSync(path.join(source,'b.ini'),'other');const file=path.join(source,'gems.mod.json'),text=JSON.stringify(value);fs.writeFileSync(file,text);
 return{root,source,file,text,scan:()=>scan(source,path.join(root,'data')),cleanup(){assert.equal(fs.readFileSync(file,'utf8'),text);assert.equal(fs.readFileSync(path.join(source,'a.ini'),'utf8'),'unchanged');assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-manifest-'));noLinks(path.parse(root).root,root);fs.rmSync(root,{recursive:true});}};
}
test('真实清单名称作者版本与HTTPS来源读取，明确目标不扩大',async()=>{
 const f=await attempt({...base(),name:'测试车辆',author:'作者',version:'1.0',source:'https://example.com/mod'});try{const report=await f.scan();assert.equal(report.name,'测试车辆');assert.equal(report.author,'作者');assert.equal(report.version,'1.0');assert.equal(report.sourceUrl,'https://example.com/mod');assert.deepEqual(report.files.filter(f=>f.target).map(f=>f.target),['mods/a.ini']);}finally{f.cleanup();}
});
test('清单空名称、控制字符、超长与复杂元数据拒绝而非忽略',async()=>{
 for(const update of [{name:''},{name:'   '},{name:'x\ny'},{name:'a'.repeat(201)},{name:{}},{author:[]},{author:'x\u007fy'},{version:99},{version:'v'.repeat(81)}]){const f=await attempt({...base(),...update});try{await assert.rejects(f.scan(),/GEMS 清单.*元数据/);}finally{f.cleanup();}}
});
test('清单来源非HTTPS、嵌入凭据、控制字符及坏网址拒绝',async()=>{
 for(const source of ['javascript:alert(1)','file:///C:/outside','http://example.com/a','https://user:secret@example.com/a','https://example.com/\na','not-url']){const f=await attempt({...base(),source});try{await assert.rejects(f.scan(),/GEMS 清单.*来源/);}finally{f.cleanup();}}
});
test('清单非对象或版本/文件列表无效给出明确中文错误',async()=>{
 for(const value of [null,[],{format:'1',files:base().files},{format:1,files:[]},{format:1,files:{source:'a.ini'}}]){const f=await attempt(value);try{await assert.rejects(f.scan(),/GEMS 清单格式无效/);}finally{f.cleanup();}}
});
test('清单操作超过20000项先拒绝，不开始寻找或分配目标',async()=>{
 const f=await attempt({format:1,files:Array.from({length:MAX_FILES+1},()=>({source:'a.ini',target:'mods/a.ini'}))});try{await assert.rejects(f.scan(),/GEMS 清单操作数量/);}finally{f.cleanup();}
});
test('清单坏操作类型和源目标类型给出中文错误',async()=>{
 for(const operation of [null,[],{}, {source:7,target:'mods/a.ini'},{source:'a.ini',target:[]}]){const f=await attempt({format:1,files:[operation]});try{await assert.rejects(f.scan(),/GEMS 清单操作格式无效/);}finally{f.cleanup();}}
});
test('清单大小写重复源或目标、非法路径继续拒绝',async()=>{
 for(const files of [[{source:'a.ini',target:'mods/a.ini'},{source:'A.INI',target:'mods/b.ini'}],[{source:'a.ini',target:'mods/a.ini'},{source:'b.ini',target:'MODS/A.INI'}],[{source:'../a.ini',target:'mods/a.ini'}],[{source:'a.ini',target:'../outside'}]]){const f=await attempt({format:1,files});try{await assert.rejects(f.scan(),/重复|非法路径/);}finally{f.cleanup();}}
});
test('清单大小写源匹配可用，未知附加字段不变成命令，缺失文件拒绝',async()=>{
 const f=await attempt({format:1,run:'untrusted.exe',files:[{source:'B.INI',target:'scripts/b.ini'},{source:'A.INI',target:'mods/a.ini'}]});try{const report=await f.scan();assert.deepEqual(report.files.filter(f=>f.target).map(f=>f.target).sort(),['mods/a.ini','scripts/b.ini']);assert.equal(fs.readFileSync(report.files.find(f=>f.target==='scripts/b.ini')!.source,'utf8'),'other');}finally{f.cleanup();}
 const absent=await attempt({format:1,files:[{source:'absent.ini',target:'mods/a.ini'}]});try{await assert.rejects(absent.scan(),/源文件不存在/);}finally{absent.cleanup();}
});
test('清单坏UTF8、超字节容量和硬链接拒绝，原字节保留',async()=>{
 const f=await attempt(base());try{
  const initial=fs.readFileSync(f.file),bad=Buffer.concat([Buffer.from('{"format":1,"name":"'),Buffer.from([0xff]),Buffer.from('","files":[{"source":"a.ini","target":"mods/a.ini"}]}')]);fs.writeFileSync(f.file,bad);assert.throws(()=>readGemsManifest(f.source,f.file),/UTF-8/);assert.deepEqual(fs.readFileSync(f.file),bad);
  fs.writeFileSync(f.file,Buffer.alloc(1024**2+1,32));assert.throws(()=>readGemsManifest(f.source,f.file),/1MiB/);fs.writeFileSync(f.file,initial);const alias=path.join(f.source,'alias.json');fs.linkSync(f.file,alias);try{assert.throws(()=>readGemsManifest(f.source,f.file),/独立普通文件/);assert.deepEqual(fs.readFileSync(f.file),initial);}finally{fs.unlinkSync(alias);}
 }finally{fs.writeFileSync(f.file,f.text);f.cleanup();}
});
test('读取期间清单变化拒绝，缺失映射不部分改写已推断目标',async()=>{
 const f=await attempt(base()),read=fs.readSync;try{let changed=false;fs.readSync=((fd,...args)=>{const result=(read as any)(fd,...args);if(!changed){changed=true;fs.appendFileSync(f.file,' ');}return result;}) as typeof fs.readSync;assert.throws(()=>readGemsManifest(f.source,f.file),/发生变化/);assert.equal(fs.readFileSync(f.file,'utf8'),f.text+' ');}finally{fs.readSync=read;fs.writeFileSync(f.file,f.text);f.cleanup();}
 const files=[{path:'a.ini',target:'scripts/old.ini'}] as FileEntry[],manifest=parseGemsManifest(JSON.stringify({format:1,files:[{source:'a.ini',target:'mods/new.ini'},{source:'absent.ini',target:'mods/absent.ini'}]}));assert.throws(()=>applyGemsManifest(manifest,files),/源文件不存在/);assert.equal(files[0].target,'scripts/old.ini');
});
test('20000映射先索引文件再绑定，只有实际映射得到目标',()=>{
 // Metadata-only capacity fixture: not 20000 physical files or memory/IO certification.
 const files:FileEntry[]=[];let pathReads=0;for(let i=0;i<MAX_FILES;i++)files.push({get path(){pathReads++;return 'f'+i.toString(36);},source:'fixture',size:1,hash:'0'.repeat(64),binary:false});
 const manifest=parseGemsManifest(JSON.stringify({format:1,files:Array.from({length:MAX_FILES},(_,i)=>({source:'f'+i.toString(36),target:'mods/f'+i.toString(36)}))}));applyGemsManifest(manifest,files);assert.equal(pathReads,MAX_FILES);assert.equal(files[0].target,'mods/f0');assert.equal(files.at(-1)!.target,'mods/f'+(MAX_FILES-1).toString(36));
});
test('清单读取须与先前扫描摘要一致，同长度变化不能套用旧摘要',async()=>{
 const f=await attempt(base());try{
  const hash=crypto.createHash('sha256').update(f.text).digest('hex');assert.equal(readGemsManifest(f.source,f.file,hash.toUpperCase()).files[0].target,'mods/a.ini');
  const changed=f.text.replace('mods/a.ini','mods/z.ini');assert.equal(Buffer.byteLength(changed),Buffer.byteLength(f.text));fs.writeFileSync(f.file,changed);assert.throws(()=>readGemsManifest(f.source,f.file,hash),/扫描摘要不一致/);assert.equal(fs.readFileSync(f.file,'utf8'),changed);assert.throws(()=>readGemsManifest(f.source,f.file,'bad'),/扫描摘要无效/);
 }finally{fs.writeFileSync(f.file,f.text);f.cleanup();}
});
