import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readProfileFile} from '../desktop/profile-file';

test('外部方案读取：中文空格路径、容量边界、损坏UTF-8和目录',{concurrency:false},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-profile-read-')),file=path.join(root,'中文 方案.json');
 try{
  const text='{"名称":"测试"}';fs.writeFileSync(file,text);assert.equal(readProfileFile(file,Buffer.byteLength(text)),text);assert.throws(()=>readProfileFile(file,Buffer.byteLength(text)-1),/不超过/);
  fs.writeFileSync(file,Buffer.from([0xc3,0x28]));assert.throws(()=>readProfileFile(file,10),/encoded|编码/);
  assert.throws(()=>readProfileFile(root,1024),/普通/);assert.throws(()=>readProfileFile(path.join(root,'missing.json'),1024),/ENOENT/);
 }finally{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('gems-profile-read-'));fs.rmSync(root,{recursive:true});}
});

test('外部方案读取：路径在打开期间被替换即拒绝',{concurrency:false},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-profile-read-')),file=path.join(root,'source.json'),replacement=path.join(root,'replacement.json');const original=fs.openSync;
 try{
  fs.writeFileSync(file,'{"a":1}');fs.writeFileSync(replacement,'{"a":2}');let replaced=false;
  fs.openSync=((...args:Parameters<typeof fs.openSync>)=>{if(args[0]===file&&!replaced){replaced=true;fs.renameSync(file,path.join(root,'old.json'));fs.renameSync(replacement,file);}return original(...args);}) as typeof fs.openSync;
  assert.throws(()=>readProfileFile(file,1024),/发生变化/);assert.equal(fs.readFileSync(file,'utf8'),'{"a":2}');
 }finally{fs.openSync=original;assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('gems-profile-read-'));fs.rmSync(root,{recursive:true});}
});
